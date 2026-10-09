//! Tauri commands — the IPC surface the React frontend calls.
//! Provider connections stay in native code; the renderer cannot call APIs.

use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::audio::CaptureSession;
use crate::language::LanguageSettings;
use crate::llm::{EnhancedNote, LocalLlm, NoteModel};
use crate::providers::{Provider, ProviderConfig, ProviderStatus};
use crate::storage::Db;
use crate::transcribe::Segment;
use crate::AppState;

/// Capture startup validates the model and microphone before reporting success.
#[tauri::command]
pub async fn start_capture(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    meeting_hint: Option<String>,
) -> Result<(), String> {
    let _gate = state.capture_gate.lock().await;
    if state.session.lock().is_some() || state.pending_capture.lock().is_some() {
        return Err("A recording is already active or waiting to be saved".into());
    }
    if let Some(title) = &meeting_hint {
        validate_text(title, 500, "Meeting title", true)?;
    }
    let model = state.data_dir.join("models/whisper-large-v3-turbo.bin");
    let language = LanguageSettings::load(&state.db.lock())
        .map_err(|e| format!("{e:#}"))?
        .transcription_language;
    let session = tauri::async_runtime::spawn_blocking(move || {
        CaptureSession::begin(app, model, meeting_hint, language)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("{e:#}"))?;
    *state.session.lock() = Some(session);
    Ok(())
}

#[tauri::command]
pub async fn cancel_capture(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let _gate = state.capture_gate.lock().await;
    let session = state.session.lock().take();
    if let Some(session) = session {
        tauri::async_runtime::spawn_blocking(move || session.finish())
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
    }
    state.pending_capture.lock().take();
    Ok(())
}

/// Save the worker's final transcript first. Enhancement is optional and can
/// never prevent a transcript from being saved. UI segments are not trusted.
#[tauri::command]
pub async fn stop_capture_and_enhance(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    template_md: String,
) -> Result<String, String> {
    validate_text(&template_md, 16_000, "template", true)?;
    let _gate = state.capture_gate.lock().await;
    let session = state.session.lock().take();
    if let Some(session) = session {
        let captured = tauri::async_runtime::spawn_blocking(move || session.finish())
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
        *state.pending_capture.lock() = Some(captured);
    }
    let captured = state
        .pending_capture
        .lock()
        .clone()
        .ok_or("No recording to save")?;
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let id = Uuid::new_v4().to_string();
        let fallback = EnhancedNote {
            title: captured.title.clone().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "Recorded meeting".into()),
            summary: "Transcript saved. AI enhancement is unavailable for this note.".into(),
            chapters: vec![], decisions: vec![], action_items: vec![],
        };
        persist_meeting(&state.db.lock(), &id, &fallback, &captured.transcript, &captured.started_at, captured.duration_s, &template_md)
            .map_err(|e| e.to_string())?;
        state.pending_capture.lock().take();
        // Failures from here preserve the already-committed raw note.
        let enhanced = enhance_saved(&state, &id, &captured.transcript, &template_md, true);
        let enhanced_ok = enhanced.is_ok();
        if let Err(e) = enhanced { let _ = app.emit("capture-warning", format!("Transcript saved; {e}")); }
        let commitment_language = LanguageSettings::load(&state.db.lock()).map_err(|e| e.to_string());
        if let Ok(commitments) = if enhanced_ok { commitment_language.and_then(|languages| with_llm(&state, |llm| llm.extract_commitments(&captured.transcript, &languages.summary_language))) } else { Ok(Vec::new()) } {
            let db = state.db.lock();
            if let Ok(tx) = db.conn().unchecked_transaction() {
                let result: rusqlite::Result<()> = commitments.into_iter().try_for_each(|c| {
                    tx.execute("INSERT INTO commitments(id,meeting_id,text,owner,due,status,made_on,evidence) VALUES(?1,?2,?3,?4,?5,'open',date('now'),?6)",
                        rusqlite::params![Uuid::new_v4().to_string(), id, c.text, c.owner, c.due, c.evidence]).map(|_| ())
                });
                if result.is_ok() { let _ = tx.commit(); }
            };
        }
        Ok(id)
    }).await.map_err(|e| e.to_string())?
}

pub(crate) fn with_llm<T>(
    state: &AppState,
    run: impl FnOnce(&NoteModel<'_>) -> anyhow::Result<T>,
) -> Result<T, String> {
    let provider = state.providers.lock();
    if provider.config().provider != Provider::Local {
        return run(&NoteModel::new(&*provider)).map_err(|e| e.to_string());
    }
    let mut model = state.llm.lock();
    if model.is_none() {
        *model = Some(
            LocalLlm::load(&state.data_dir.join("models/qwen3-4b-q4.gguf"))
                .map_err(|e| format!("{e:#}"))?,
        );
    }
    run(&NoteModel::new(model.as_ref().expect("model initialized"))).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_provider_settings(
    state: State<'_, Arc<AppState>>,
) -> Result<ProviderStatus, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || Ok(state.providers.lock().status()))
        .await
        .map_err(|_| "Could not read provider settings".to_string())?
}

#[tauri::command]
pub async fn get_language_settings(
    state: State<'_, Arc<AppState>>,
) -> Result<LanguageSettings, String> {
    let _gate = state.capture_gate.lock().await;
    LanguageSettings::load(&state.db.lock()).map_err(|e| format!("{e:#}"))
}

// Caller holds capture_gate, including through the database write. No language
// or provider change can race a capture, pending save, purge, or summary retry.
fn save_language_preferences(
    state: &AppState,
    settings: LanguageSettings,
) -> Result<LanguageSettings, String> {
    if state.session.lock().is_some() || state.pending_capture.lock().is_some() {
        return Err("Stop and save or discard the recording before changing languages".into());
    }
    settings
        .save(&state.db.lock())
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn save_language_settings(
    state: State<'_, Arc<AppState>>,
    settings: LanguageSettings,
) -> Result<LanguageSettings, String> {
    let _gate = state.capture_gate.lock().await;
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || save_language_preferences(&state, settings))
        .await
        .map_err(|_| "Could not save language settings".to_string())?
}

#[tauri::command]
pub async fn save_provider_settings(
    state: State<'_, Arc<AppState>>,
    config: ProviderConfig,
    api_key: Option<String>,
    clear_api_key: Option<bool>,
) -> Result<ProviderStatus, String> {
    let _gate = state.capture_gate.lock().await;
    if state.session.lock().is_some() || state.pending_capture.lock().is_some() {
        return Err("Stop or discard the recording before changing model providers".into());
    }
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let status = state
            .providers
            .lock()
            .save(config, api_key, clear_api_key.unwrap_or(false))
            .map_err(|e| e.to_string())?;
        // Drop old local prompt buffers and release model memory on switching.
        *state.llm.lock() = None;
        Ok(status)
    })
    .await
    .map_err(|_| "Could not update provider settings".to_string())?
}

#[derive(serde::Serialize)]
pub struct ConnectionTestResult {
    ok: bool,
    message: String,
}

#[tauri::command]
pub async fn test_provider_connection(
    state: State<'_, Arc<AppState>>,
) -> Result<ConnectionTestResult, String> {
    let _gate = state.capture_gate.lock().await;
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        with_llm(&state, |model| model.test_connection())?;
        Ok(ConnectionTestResult {
            ok: true,
            message: "Connection succeeded using synthetic test text. No meeting data was sent."
                .into(),
        })
    })
    .await
    .map_err(|_| "Could not finish the connection test".to_string())?
}

fn persist_meeting(
    db: &Db,
    id: &str,
    note: &EnhancedNote,
    transcript: &[Segment],
    started_at: &str,
    duration_s: u64,
    template: &str,
) -> anyhow::Result<()> {
    let tx = db.conn().unchecked_transaction()?;
    tx.execute("INSERT INTO meetings(id,title,started_at,duration_s,summary,chapters_json,decisions_json,template) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
        rusqlite::params![id, note.title, started_at, i64::try_from(duration_s)?, note.summary, serde_json::to_string(&note.chapters)?, serde_json::to_string(&note.decisions)?, template])?;
    for s in transcript {
        tx.execute("INSERT INTO segments(id,meeting_id,start_ms,end_ms,speaker,text) VALUES(?1,?2,?3,?4,?5,?6)",
            rusqlite::params![Uuid::new_v4().to_string(), id, i64::try_from(s.start_ms)?, i64::try_from(s.end_ms)?, s.speaker, s.text])?;
    }
    tx.commit()?;
    Ok(())
}

fn update_enhancement(
    db: &Db,
    id: &str,
    note: &EnhancedNote,
    run_id: &str,
    update_actions: bool,
) -> anyhow::Result<()> {
    let tx = db.conn().unchecked_transaction()?;
    tx.execute(
        "UPDATE meetings SET title=?1,summary=?2,chapters_json=?3,decisions_json=?4 WHERE id=?5",
        rusqlite::params![
            note.title,
            note.summary,
            serde_json::to_string(&note.chapters)?,
            serde_json::to_string(&note.decisions)?,
            id
        ],
    )?;
    for a in note.action_items.iter().filter(|_| update_actions) {
        tx.execute(
            "INSERT INTO action_items(id,meeting_id,text,owner,due) VALUES(?1,?2,?3,?4,?5)",
            rusqlite::params![Uuid::new_v4().to_string(), id, a.text, a.owner, a.due],
        )?;
    }
    tx.execute(
        "UPDATE summary_runs SET status='completed',completed_at=?1 WHERE id=?2",
        rusqlite::params![chrono::Utc::now().to_rfc3339(), run_id],
    )?;
    tx.commit()?;
    Ok(())
}

/// Each attempt records its chosen route before inference. A failed attempt may
/// have reached that route, so this is processing history, not an egress audit.
fn enhance_saved(
    state: &AppState,
    id: &str,
    transcript: &[Segment],
    template: &str,
    update_actions: bool,
) -> Result<(), String> {
    if transcript
        .iter()
        .all(|segment| segment.text.trim().is_empty())
    {
        return Err("This meeting has no transcript to summarize".into());
    }
    let config = state.providers.lock().config().clone();
    let language = LanguageSettings::load(&state.db.lock())
        .map_err(|e| format!("{e:#}"))?
        .summary_language;
    let run_id = Uuid::new_v4().to_string();
    let provider = serde_json::to_value(config.provider).map_err(|e| e.to_string())?;
    state.db.lock().conn().execute("INSERT INTO summary_runs(id,meeting_id,provider,model,endpoint,off_device,status,started_at,summary_language) VALUES(?1,?2,?3,?4,?5,?6,'running',?7,?8)",
        rusqlite::params![run_id,id,provider.as_str().unwrap_or("unknown"),config.model,config.base_url,config.sends_transcript_off_device(),chrono::Utc::now().to_rfc3339(),language]).map_err(|e|e.to_string())?;
    let result = with_llm(state, |model| {
        model.enhance(transcript, template, &language)
    })
    .and_then(|note| {
        update_enhancement(&state.db.lock(), id, &note, &run_id, update_actions).map_err(|_| {
            "Summary generated but could not be saved. The previous note is intact.".to_string()
        })
    });
    if let Err(ref error) = result {
        // Provider errors are already redacted. Bound the persisted diagnostic.
        let detail: String = error.chars().take(1000).collect();
        state
            .db
            .lock()
            .conn()
            .execute(
                "UPDATE summary_runs SET status='failed',error=?1,completed_at=?2 WHERE id=?3",
                rusqlite::params![detail, chrono::Utc::now().to_rfc3339(), run_id],
            )
            .map_err(|_| {
                "Summary failed and its status could not be saved. The transcript is intact."
                    .to_string()
            })?;
    }
    result
}

#[tauri::command]
pub async fn regenerate_summary(
    state: State<'_, Arc<AppState>>,
    meeting_id: String,
    expected_config: ProviderConfig,
) -> Result<(), String> {
    validate_text(&meeting_id, 128, "Meeting id", false)?;
    let _gate = state.capture_gate.lock().await;
    if state.session.lock().is_some() || state.pending_capture.lock().is_some() {
        return Err("Finish the current recording before regenerating a summary".into());
    }
    if state.providers.lock().config() != &expected_config.validated().map_err(|e| e.to_string())? {
        return Err("The provider changed. Review the selected destination and try again.".into());
    }
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (template,transcript,update_actions)={
            let db=state.db.lock();
            let template:Option<String>=db.conn().query_row("SELECT template FROM meetings WHERE id=?1",[&meeting_id],|row|row.get(0)).map_err(|_|"Meeting was not found".to_string())?;
            let mut statement=db.conn().prepare("SELECT start_ms,end_ms,speaker,text FROM segments WHERE meeting_id=?1 ORDER BY start_ms,rowid").map_err(|e|e.to_string())?;
            let transcript=statement.query_map([&meeting_id],|row|Ok(Segment{start_ms:nonnegative_ms(row,0)?,end_ms:nonnegative_ms(row,1)?,speaker:row.get(2)?,text:row.get(3)?,final_:true})).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
            (template.unwrap_or_default(),transcript,!db.conn().query_row("SELECT EXISTS(SELECT 1 FROM action_items WHERE meeting_id=?1)",[&meeting_id],|row|row.get::<_,bool>(0)).map_err(|e|e.to_string())?)
        };
        // Keep action item IDs and completion state stable during retries.
        enhance_saved(&state,&meeting_id,&transcript,&template,update_actions)
    }).await.map_err(|_|"Summary worker did not finish; the saved transcript is intact".to_string())?
}

fn nonnegative_ms(row: &rusqlite::Row<'_>, column: usize) -> rusqlite::Result<u64> {
    u64::try_from(row.get::<_, i64>(column)?).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            column,
            rusqlite::types::Type::Integer,
            Box::new(error),
        )
    })
}

fn summary_history(db: &Db, meeting_id: &str) -> rusqlite::Result<Vec<serde_json::Value>> {
    let mut statement=db.conn().prepare("SELECT provider,model,endpoint,off_device,status,error,started_at,completed_at,summary_language FROM summary_runs WHERE meeting_id=?1 ORDER BY rowid DESC LIMIT 20")?;
    let rows=statement.query_map([meeting_id],|row|Ok(serde_json::json!({
        "provider":row.get::<_,String>(0)?,"model":row.get::<_,String>(1)?,"endpoint":row.get::<_,String>(2)?,"off_device":row.get::<_,bool>(3)?,"status":row.get::<_,String>(4)?,"error":row.get::<_,Option<String>>(5)?,"started_at":row.get::<_,String>(6)?,"completed_at":row.get::<_,Option<String>>(7)?,"summary_language":row.get::<_,Option<String>>(8)?
    })))?;
    rows.collect()
}

fn validate_text(value: &str, max: usize, label: &str, allow_empty: bool) -> Result<(), String> {
    if value.len() > max || (!allow_empty && value.trim().is_empty()) {
        return Err(format!(
            "{label} must {}contain at most {max} bytes",
            if allow_empty { "" } else { "be nonempty and " }
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn list_meetings(state: State<'_, Arc<AppState>>) -> Result<serde_json::Value, String> {
    let db = state.db.lock();
    let mut stmt = db
        .conn()
        .prepare("SELECT id,title,started_at,duration_s,substr(summary,1,1000),starred,chapters_json,decisions_json,template FROM meetings ORDER BY julianday(started_at) DESC LIMIT 1000")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_,String>(0)?, "title": r.get::<_,String>(1)?,
                "started_at": r.get::<_,String>(2)?, "duration_s": r.get::<_,i64>(3)?,
                "summary": r.get::<_,Option<String>>(4)?, "starred": r.get::<_,i64>(5)?,
                "chapters": r.get::<_,Option<String>>(6)?, "decisions": r.get::<_,Option<String>>(7)?, "template": r.get::<_,Option<String>>(8)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    Ok(rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into())
}

#[tauri::command]
pub async fn get_meeting(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<serde_json::Value, String> {
    validate_text(&id, 128, "Meeting id", false)?;
    let db = state.db.lock();
    let meeting = db.conn().query_row(
        "SELECT title,started_at,duration_s,summary,chapters_json,decisions_json,template,starred FROM meetings WHERE id=?1",
        [&id],
        |r| {
            Ok(serde_json::json!({
                "title": r.get::<_,String>(0)?, "started_at": r.get::<_,String>(1)?,
                "duration_s": r.get::<_,i64>(2)?, "summary": r.get::<_,Option<String>>(3)?,
                "chapters": r.get::<_,Option<String>>(4)?, "decisions": r.get::<_,Option<String>>(5)?,
                "template": r.get::<_,Option<String>>(6)?, "starred": r.get::<_,i64>(7)?,
            }))
        },
    ).map_err(|e| e.to_string())?;

    let mut stmt = db.conn().prepare(
        "SELECT id,start_ms,end_ms,speaker,text FROM segments WHERE meeting_id=?1 ORDER BY start_ms",
    ).map_err(|e| e.to_string())?;
    let segments: Vec<serde_json::Value> = stmt
        .query_map([&id], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_,String>(0)?, "start_ms": r.get::<_,i64>(1)?,
                "end_ms": r.get::<_,i64>(2)?, "speaker": r.get::<_,i64>(3)?,
                "text": r.get::<_,String>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = db
        .conn()
        .prepare("SELECT id,text,owner,due,done FROM action_items WHERE meeting_id=?1")
        .map_err(|e| e.to_string())?;
    let actions: Vec<serde_json::Value> = stmt
        .query_map([&id], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_,String>(0)?, "text": r.get::<_,String>(1)?,
                "owner": r.get::<_,Option<String>>(2)?, "due": r.get::<_,Option<String>>(3)?,
                "done": r.get::<_,i64>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "id": id,
        "meeting": meeting,
        "segments": segments,
        "action_items": actions,
        "processing_history": summary_history(&db,&id).map_err(|e|e.to_string())?,
    }))
}

/// User text becomes quoted literal tokens, never FTS operators or syntax.
fn fts_query(query: &str) -> Option<String> {
    let terms: Vec<_> = query
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .take(24)
        .map(|s| format!("\"{}\"", s))
        .collect();
    (!terms.is_empty()).then(|| terms.join(" OR "))
}

#[tauri::command]
pub async fn ask_library(
    state: State<'_, Arc<AppState>>,
    question: String,
    meeting_id: Option<String>,
) -> Result<String, String> {
    let _gate = state.capture_gate.lock().await;
    validate_text(&question, 4000, "Question", false)?;
    let query = fts_query(&question).ok_or("Enter a question containing words")?;
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let chunks = library_context(&state.db.lock(), &query, meeting_id.as_deref()).map_err(|e| e.to_string())?;
        if chunks.is_empty() { return Ok("I could not find matching transcript passages in this library. Try specific words from the meeting.".into()); }
        with_llm(&state, |llm| llm.chat(&question, &chunks))
    }).await.map_err(|e| e.to_string())?
}

fn library_context(db: &Db, query: &str, meeting_id: Option<&str>) -> anyhow::Result<Vec<String>> {
    let mut stmt = db.conn().prepare(
        "SELECT snippet(segments_fts,0,'','',' … ',64),m.title,s.start_ms FROM segments_fts f JOIN segments s ON s.rowid=f.rowid JOIN meetings m ON m.id=s.meeting_id
         WHERE segments_fts MATCH ?1 AND (?2 IS NULL OR m.id=?2) ORDER BY rank LIMIT 12")?;
    let rows = stmt.query_map(rusqlite::params![query, meeting_id], |r| {
        Ok(format!(
            "[{} {:02}:{:02}] {}",
            r.get::<_, String>(1)?,
            r.get::<_, i64>(2)? / 60000,
            r.get::<_, i64>(2)? / 1000 % 60,
            r.get::<_, String>(0)?
        ))
    })?;
    let mut chunks = rows.collect::<Result<Vec<_>, _>>()?;
    // Imported summary-only notes and broad questions also need useful context.
    // Label summaries separately so the model never invents transcript times.
    if chunks.is_empty() || meeting_id.is_some() {
        let mut summaries = db.conn().prepare("SELECT title,substr(summary,1,2000) FROM meetings WHERE (?1 IS NULL OR id=?1) AND summary IS NOT NULL AND trim(summary) != '' AND summary NOT LIKE 'Transcript saved.%' ORDER BY julianday(started_at) DESC LIMIT 6")?;
        for row in summaries.query_map([meeting_id], |r| {
            Ok(format!(
                "[{} · saved summary excerpt] {}",
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?
            ))
        })? {
            chunks.push(row?);
        }
    }
    if chunks.is_empty() {
        if let Some(id) = meeting_id {
            let mut transcript = db.conn().prepare("SELECT m.title,s.start_ms,substr(s.text,1,1500) FROM segments s JOIN meetings m ON m.id=s.meeting_id WHERE s.meeting_id=?1 ORDER BY s.start_ms LIMIT 12")?;
            for row in transcript.query_map([id], |r| {
                Ok(format!(
                    "[{} {:02}:{:02}] {}",
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)? / 60000,
                    r.get::<_, i64>(1)? / 1000 % 60,
                    r.get::<_, String>(2)?
                ))
            })? {
                chunks.push(row?);
            }
        }
    }
    Ok(chunks)
}

#[tauri::command]
pub async fn semantic_search(
    state: State<'_, Arc<AppState>>,
    query: String,
) -> Result<serde_json::Value, String> {
    validate_text(&query, 1000, "Search", true)?;
    let Some(fts) = fts_query(&query) else {
        return Ok(serde_json::json!([]));
    };
    let db = state.db.lock();
    let mut stmt = db.conn().prepare(
        "SELECT DISTINCT m.id,m.title,m.started_at FROM meetings m WHERE m.title LIKE ?1 ESCAPE '\\' OR m.summary LIKE ?1 ESCAPE '\\'
         OR m.id IN (SELECT s.meeting_id FROM segments_fts f JOIN segments s ON s.rowid=f.rowid WHERE segments_fts MATCH ?2)
         ORDER BY julianday(m.started_at) DESC LIMIT 30").map_err(|e| e.to_string())?;
    let like = format!(
        "%{}%",
        query
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    );
    let rows = stmt.query_map(rusqlite::params![like, fts], |r| Ok(serde_json::json!({ "id": r.get::<_,String>(0)?, "title": r.get::<_,String>(1)?, "started_at": r.get::<_,String>(2)? }))).map_err(|e| e.to_string())?;
    Ok(rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into())
}

#[tauri::command]
pub async fn list_action_items(
    state: State<'_, Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock();
    let mut stmt = db.conn().prepare("SELECT a.id,a.text,a.owner,a.due,a.done,a.meeting_id,m.title FROM action_items a JOIN meetings m ON m.id=a.meeting_id ORDER BY a.done,a.due IS NULL,a.due,julianday(m.started_at) DESC LIMIT 5000").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(serde_json::json!({"id":r.get::<_,String>(0)?,"text":r.get::<_,String>(1)?,"owner":r.get::<_,Option<String>>(2)?,"due":r.get::<_,Option<String>>(3)?,"done":r.get::<_,i64>(4)?,"meeting_id":r.get::<_,String>(5)?,"meeting_title":r.get::<_,String>(6)?}))).map_err(|e| e.to_string())?;
    Ok(rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into())
}

#[tauri::command]
pub async fn toggle_action_item(
    state: State<'_, Arc<AppState>>,
    id: String,
    done: bool,
) -> Result<(), String> {
    validate_text(&id, 128, "Item id", false)?;
    let changed = state
        .db
        .lock()
        .conn()
        .execute(
            "UPDATE action_items SET done=?1 WHERE id=?2",
            rusqlite::params![done as i64, id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Action item no longer exists".into());
    }
    Ok(())
}

/// days=0 disables auto-purge; otherwise notes expire `days` after creation.
#[tauri::command]
pub async fn set_retention_policy(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    days: u32,
) -> Result<(), String> {
    let _gate = state.capture_gate.lock().await;
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = state
            .db
            .lock()
            .set_retention_policy(days)
            .map(|_| ())
            .map_err(|e| e.to_string());
        // Deletion may commit before a checkpoint fails. Refresh the UI even
        // when SQLite reports a later cleanup error.
        let _ = app.emit("library-changed", ());
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn purge_everything(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let _gate = state.capture_gate.lock().await;
    if state.session.lock().is_some() || state.pending_capture.lock().is_some() {
        return Err("Stop or discard the current recording before deleting the library".into());
    }
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = state.db.lock().purge_all().map_err(|e| e.to_string());
        // A checkpoint failure can follow a committed delete, so always drop
        // prior prompt buffers and invalidate frontend data after an attempt.
        *state.llm.lock() = None;
        let _ = app.emit("library-changed", ());
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn model_status(state: State<'_, Arc<AppState>>) -> Result<serde_json::Value, String> {
    let retention: u32 = state
        .db
        .lock()
        .conn()
        .query_row(
            "SELECT value FROM settings WHERE key='retention_days'",
            [],
            |r| r.get::<_, String>(0),
        )
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let dir = state.data_dir.join("models");
    let has = |f: &str| {
        dir.join(f)
            .metadata()
            .is_ok_and(|m| m.is_file() && m.len() > 0)
    };
    Ok(serde_json::json!({
        "whisper": has("whisper-large-v3-turbo.bin"), "llm": has("qwen3-4b-q4.gguf"), "embed": false,
        "model_directory": dir, "airlock": state.airlock, "retention_days": retention,
        "capabilities": { "system_audio": crate::audio::SYSTEM_AUDIO_SUPPORTED, "diarization": false, "calendar": false, "semantic_search": false },
        "recording": state.session.lock().is_some(),
        "pending_capture": state.pending_capture.lock().is_some(),
    }))
}

#[tauri::command]
pub async fn upcoming_calendar_events() -> Result<serde_json::Value, String> {
    serde_json::to_value(crate::calendar::upcoming()).map_err(|e| e.to_string())
}

/// Calendar integration is unavailable; clients render an honest empty state.
#[tauri::command]
pub async fn get_brief() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "empty": true }))
}

#[tauri::command]
pub async fn list_commitments(
    state: State<'_, Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock();
    // Mark anything past due as overdue, lazily — no background daemon needed.
    db.conn()
        .execute(
            "UPDATE commitments SET status='overdue'
         WHERE status='open' AND due IS NOT NULL AND date(due) < date('now')",
            [],
        )
        .map_err(|e| e.to_string())?;
    let mut stmt = db.conn().prepare(
        "SELECT c.id, c.text, c.owner, c.due, c.status, c.made_on, c.evidence, m.title, c.meeting_id
         FROM commitments c JOIN meetings m ON m.id = c.meeting_id
         ORDER BY CASE c.status WHEN 'overdue' THEN 0 WHEN 'open' THEN 1 ELSE 2 END, c.made_on DESC LIMIT 5000",
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_,String>(0)?, "text": r.get::<_,String>(1)?,
                "owner": r.get::<_,Option<String>>(2)?, "due": r.get::<_,Option<String>>(3)?,
                "status": r.get::<_,String>(4)?, "made_on": r.get::<_,String>(5)?,
                "evidence": r.get::<_,Option<String>>(6)?,
                "meeting_title": r.get::<_,String>(7)?, "meeting_id": r.get::<_,String>(8)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    Ok(rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into())
}

#[tauri::command]
pub async fn mark_commitment(
    state: State<'_, Arc<AppState>>,
    id: String,
    status: String,
) -> Result<(), String> {
    if !matches!(status.as_str(), "open" | "kept") {
        return Err("Status must be open or kept".into());
    }
    validate_text(&id, 128, "Item id", false)?;
    let changed = state
        .db
        .lock()
        .conn()
        .execute(
            "UPDATE commitments SET status=?1 WHERE id=?2",
            rusqlite::params![status, id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Commitment no longer exists".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn run_recipe(
    state: State<'_, Arc<AppState>>,
    prompt: String,
    meeting_id: Option<String>,
) -> Result<String, String> {
    let _gate = state.capture_gate.lock().await;
    validate_text(&prompt, 16_000, "Recipe", false)?;
    if let Some(id) = &meeting_id {
        validate_text(id, 128, "Meeting id", false)?;
    }
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let context = {
            let db = state.db.lock();
            if let Some(id) = meeting_id {
                let mut stmt = db.conn().prepare("SELECT text FROM segments WHERE meeting_id=?1 ORDER BY start_ms LIMIT 10000").map_err(|e| e.to_string())?;
                let rows = stmt.query_map([id], |r| r.get::<_,String>(0)).map_err(|e| e.to_string())?;
                rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())?
            } else {
                let mut stmt = db.conn().prepare("SELECT title || ' ' || COALESCE(summary,'') FROM meetings ORDER BY julianday(started_at) DESC LIMIT 6").map_err(|e| e.to_string())?;
                let rows = stmt.query_map([], |r| r.get::<_,String>(0)).map_err(|e| e.to_string())?;
                rows.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())?
            }
        };
        if context.is_empty() { return Err("There are no notes to run this recipe against".into()); }
        with_llm(&state, |llm| llm.run_recipe(&prompt, &context))
    }).await.map_err(|e| e.to_string())?
}

/// Accept a single note, an array, or {"notes": [...]}. Validate the whole
/// export before touching SQLite; one transaction prevents partial imports.
#[tauri::command]
pub async fn import_granola_export(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    json: String,
) -> Result<usize, String> {
    let _gate = state.capture_gate.lock().await;
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let notes = parse_import(&json)?;
        let db = state.db.lock();
        let imported = import_notes(&db, &notes).map_err(|e| e.to_string())?;
        let retention = db.enforce_retention();
        drop(db);
        let _ = app.emit("library-changed", ());
        retention
            .map_err(|e| format!("Imported {imported} notes. Retention cleanup failed: {e}"))?;
        Ok(imported)
    })
    .await
    .map_err(|e| e.to_string())?
}

struct ImportNote {
    title: String,
    created: String,
    summary: Option<String>,
    segments: Vec<Segment>,
}

fn parse_import(json: &str) -> Result<Vec<ImportNote>, String> {
    if json.len() > 20 * 1024 * 1024 {
        return Err("Export is larger than 20 MB".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("Invalid JSON: {e}"))?;
    let values = match value {
        serde_json::Value::Array(v) => v,
        serde_json::Value::Object(mut o) if o.contains_key("notes") => o
            .remove("notes")
            .unwrap()
            .as_array()
            .cloned()
            .ok_or("notes must be an array")?,
        serde_json::Value::Object(o) => vec![serde_json::Value::Object(o)],
        _ => return Err("Export must contain note objects".into()),
    };
    if values.is_empty() || values.len() > 1000 {
        return Err("Export must contain 1 to 1,000 notes".into());
    }
    values
        .into_iter()
        .enumerate()
        .map(|(i, n)| {
            let invalid = |reason: &str| format!("Note {}: {reason}", i + 1);
            let o = n.as_object().ok_or_else(|| invalid("expected an object"))?;
            let title = o
                .get("title")
                .and_then(|v| v.as_str())
                .ok_or_else(|| invalid("title must be text"))?
                .trim()
                .to_string();
            validate_text(&title, 500, "Title", false)?;
            let summary = match o.get("summary") {
                None | Some(serde_json::Value::Null) => None,
                Some(v) => Some(
                    v.as_str()
                        .ok_or_else(|| invalid("summary must be text"))?
                        .to_string(),
                ),
            };
            if let Some(summary) = &summary {
                validate_text(summary, 1_000_000, "Summary", true)?;
            }
            let created = match o.get("created_at").or_else(|| o.get("createdAt")) {
                None => chrono::Utc::now().to_rfc3339(),
                Some(v) => normalize_date(
                    v.as_str()
                        .ok_or_else(|| invalid("created_at must be an ISO date"))?,
                )
                .ok_or_else(|| invalid("created_at must be an ISO date"))?,
            };
            let mut segments = Vec::new();
            if let Some(transcript) = o.get("transcript") {
                let entries = transcript
                    .as_array()
                    .ok_or_else(|| invalid("transcript must be an array"))?;
                if entries.len() > 50_000 {
                    return Err(invalid("too many transcript segments"));
                }
                let mut speakers = std::collections::HashMap::new();
                for (j, entry) in entries.iter().enumerate() {
                    let text = entry
                        .get("text")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| invalid("every segment requires text"))?
                        .trim()
                        .to_string();
                    validate_text(&text, 100_000, "Segment", false)?;
                    let start_ms = import_timestamp(entry, "start", j as u64 * 1000)?;
                    let end_ms = import_timestamp(entry, "end", start_ms.saturating_add(1000))?;
                    if end_ms < start_ms {
                        return Err(invalid("segment end precedes start"));
                    }
                    let speaker = match entry.get("speaker") {
                        None | Some(serde_json::Value::Null) => 0,
                        Some(serde_json::Value::Number(n)) => {
                            n.as_u64().filter(|n| *n <= 255).ok_or_else(|| {
                                invalid("speaker number must be between 0 and 255")
                            })? as u8
                        }
                        Some(serde_json::Value::String(name)) => {
                            if !speakers.contains_key(name) && speakers.len() >= 255 {
                                return Err(invalid("too many speakers"));
                            }
                            let next = speakers.len() as u8;
                            *speakers.entry(name.clone()).or_insert(next)
                        }
                        _ => return Err(invalid("speaker must be a name or number")),
                    };
                    segments.push(Segment {
                        start_ms,
                        end_ms,
                        speaker,
                        text,
                        final_: true,
                    });
                }
                segments.sort_by_key(|s| s.start_ms);
            }
            Ok(ImportNote {
                title,
                created,
                summary,
                segments,
            })
        })
        .collect()
}

fn normalize_date(raw: &str) -> Option<String> {
    if let Ok(date) = chrono::DateTime::parse_from_rfc3339(raw) {
        return Some(date.with_timezone(&chrono::Utc).to_rfc3339());
    }
    chrono::NaiveDate::parse_from_str(raw, "%Y-%m-%d")
        .ok()?
        .and_hms_opt(0, 0, 0)
        .map(|d| d.and_utc().to_rfc3339())
}

fn import_timestamp(entry: &serde_json::Value, key: &str, default: u64) -> Result<u64, String> {
    let (value, scale) = match entry.get(format!("{key}_ms")) {
        Some(v) => (Some(v), 1.0),
        None => (entry.get(key), 1000.0),
    };
    let Some(value) = value else {
        return Ok(default);
    };
    let n = value.as_f64().ok_or("Segment timestamps must be numbers")? * scale;
    if !n.is_finite() || !(0.0..=604_800_000.0).contains(&n) {
        return Err("Segment timestamps must be between 0 and 7 days".into());
    }
    Ok(n.round() as u64)
}

fn import_notes(db: &Db, notes: &[ImportNote]) -> anyhow::Result<usize> {
    let tx = db.conn().unchecked_transaction()?;
    for note in notes {
        let id = Uuid::new_v4().to_string();
        let duration = note.segments.iter().map(|s| s.end_ms).max().unwrap_or(0) / 1000;
        tx.execute(
            "INSERT INTO meetings(id,title,started_at,duration_s,summary) VALUES(?1,?2,?3,?4,?5)",
            rusqlite::params![
                id,
                note.title,
                note.created,
                i64::try_from(duration)?,
                note.summary
            ],
        )?;
        for s in &note.segments {
            tx.execute("INSERT INTO segments(id,meeting_id,start_ms,end_ms,speaker,text) VALUES(?1,?2,?3,?4,?5,?6)", rusqlite::params![Uuid::new_v4().to_string(), id, i64::try_from(s.start_ms)?, i64::try_from(s.end_ms)?, s.speaker, s.text])?;
        }
    }
    tx.commit()?;
    Ok(notes.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saved_note_fixture(db: &Db) -> Vec<Segment> {
        let note = EnhancedNote {
            title: "Original title".into(),
            summary: "Previously approved summary".into(),
            chapters: vec![],
            decisions: vec!["Keep the launch date".into()],
            action_items: vec![],
        };
        let transcript = vec![Segment {
            start_ms: 1234,
            end_ms: 4567,
            speaker: 2,
            text: "I already sent the launch checklist.".into(),
            final_: true,
        }];
        persist_meeting(
            db,
            "retry-meeting",
            &note,
            &transcript,
            "2099-01-01T12:00:00Z",
            5,
            "Decisions and next steps",
        )
        .unwrap();
        db.conn().execute_batch("INSERT INTO action_items(id,meeting_id,text,owner,due,done) VALUES('existing-action','retry-meeting','Send launch checklist','Sam','Friday',1);").unwrap();
        transcript
    }

    fn preserved_meeting_children(db: &Db) -> (Vec<serde_json::Value>, Vec<serde_json::Value>) {
        let segments = db
            .conn()
            .prepare("SELECT id,meeting_id,start_ms,end_ms,speaker,text FROM segments ORDER BY id")
            .unwrap()
            .query_map([], |row| {
                Ok(serde_json::json!([
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?
                ]))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        let actions = db
            .conn()
            .prepare("SELECT id,meeting_id,text,owner,due,done FROM action_items ORDER BY id")
            .unwrap()
            .query_map([], |row| {
                Ok(serde_json::json!([
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, i64>(5)?
                ]))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        (segments, actions)
    }

    #[test]
    fn summary_retry_updates_note_and_history_without_replacing_transcript_or_actions() {
        let db = Db::open(std::path::Path::new(":memory:")).unwrap();
        saved_note_fixture(&db);
        let before = preserved_meeting_children(&db);
        db.conn().execute_batch("INSERT INTO summary_runs(id,meeting_id,provider,model,endpoint,off_device,status,started_at) VALUES('retry-run','retry-meeting','lm_studio','test-model','http://127.0.0.1:1234/v1',0,'running','2099-01-01T12:30:00Z');").unwrap();
        let regenerated = EnhancedNote {
            title: "Better title".into(),
            summary: "The checklist was already sent.".into(),
            chapters: vec![crate::llm::Chapter {
                title: "Launch".into(),
                timestamp: "00:01".into(),
                body: "Checklist delivered.".into(),
            }],
            decisions: vec!["Keep the launch date".into()],
            // Regeneration must not replace an action the user completed or
            // append another copy of what a different model extracts.
            action_items: vec![crate::llm::ActionItem {
                text: "A newly proposed action".into(),
                owner: Some("Pat".into()),
                due: None,
            }],
        };
        update_enhancement(&db, "retry-meeting", &regenerated, "retry-run", false).unwrap();
        assert_eq!(preserved_meeting_children(&db), before);
        let result: (String, String, String) = db
            .conn()
            .query_row(
                "SELECT title,summary,chapters_json FROM meetings WHERE id='retry-meeting'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(result.0, regenerated.title);
        assert_eq!(result.1, regenerated.summary);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&result.2).unwrap()[0]["timestamp"],
            "00:01"
        );
        let history = summary_history(&db, "retry-meeting").unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0]["status"], "completed");
        assert!(history[0]["completed_at"].as_str().is_some());
        assert_eq!(history[0]["off_device"], false);
        assert!(history[0]["error"].is_null());
    }

    #[test]
    fn failed_summary_retry_keeps_previous_note_and_records_failure() {
        let dir = std::env::temp_dir().join(format!("open-granola-retry-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = Db::open(std::path::Path::new(":memory:")).unwrap();
        let transcript = saved_note_fixture(&db);
        let before = preserved_meeting_children(&db);
        let state = AppState {
            providers: parking_lot::Mutex::new(
                crate::providers::ProviderManager::load(&dir).unwrap(),
            ),
            _instance_lock: std::fs::File::create(dir.join("instance.lock")).unwrap(),
            data_dir: dir.clone(),
            db: parking_lot::Mutex::new(db),
            session: parking_lot::Mutex::new(None),
            pending_capture: parking_lot::Mutex::new(None),
            capture_gate: tokio::sync::Mutex::new(()),
            llm: parking_lot::Mutex::new(None),
            airlock: crate::airlock::engage().unwrap(),
        };
        // The selected local model is intentionally absent; no provider or
        // credential-store access is necessary to reproduce a real failure.
        LanguageSettings {
            summary_language: "hi".into(),
            ..Default::default()
        }
        .save(&state.db.lock())
        .unwrap();
        let error =
            enhance_saved(&state, "retry-meeting", &transcript, "Meeting", false).unwrap_err();
        assert!(!error.is_empty());
        {
            let db = state.db.lock();
            assert_eq!(preserved_meeting_children(&db), before);
            let note: (String, String) = db
                .conn()
                .query_row(
                    "SELECT title,summary FROM meetings WHERE id='retry-meeting'",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();
            assert_eq!(
                note,
                (
                    "Original title".into(),
                    "Previously approved summary".into()
                )
            );
            let history = summary_history(&db, "retry-meeting").unwrap();
            assert_eq!(history.len(), 1);
            assert_eq!(history[0]["provider"], "local");
            assert_eq!(history[0]["status"], "failed");
            assert_eq!(history[0]["off_device"], false);
            assert_eq!(history[0]["summary_language"], "hi");
            assert!(history[0]["completed_at"].as_str().is_some());
            assert!(!history[0]["error"].as_str().unwrap().is_empty());
        }
        // A pending capture rejects setting changes and cannot silently alter
        // the preference that was in force when capture started.
        *state.pending_capture.lock() = Some(crate::audio::CapturedMeeting {
            transcript: transcript.clone(),
            started_at: "2099-01-01".into(),
            duration_s: 1,
            title: None,
        });
        let next = LanguageSettings {
            summary_language: "es".into(),
            ..Default::default()
        };
        assert!(save_language_preferences(&state, next.clone()).is_err());
        assert_eq!(
            LanguageSettings::load(&state.db.lock())
                .unwrap()
                .summary_language,
            "hi"
        );
        state.pending_capture.lock().take();
        save_language_preferences(&state, next).unwrap();
        assert!(enhance_saved(&state, "retry-meeting", &transcript, "Meeting", false).is_err());
        let history = summary_history(&state.db.lock(), "retry-meeting").unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0]["summary_language"], "es");
        assert_eq!(history[1]["summary_language"], "hi");
        assert_eq!(preserved_meeting_children(&state.db.lock()), before);
        drop(state);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn processing_history_is_scoped_and_returns_the_latest_twenty_attempts() {
        let db = Db::open(std::path::Path::new(":memory:")).unwrap();
        saved_note_fixture(&db);
        db.conn().execute_batch("INSERT INTO meetings(id,title,started_at,duration_s) VALUES('other','Other private meeting','2099-01-01',1);").unwrap();
        for index in 0..25 {
            db.conn().execute("INSERT INTO summary_runs(id,meeting_id,provider,model,endpoint,off_device,status,started_at) VALUES(?1,'retry-meeting','local',?1,'',0,'completed','2099-01-01')",[format!("run-{index}")]).unwrap();
        }
        db.conn().execute_batch("INSERT INTO summary_runs(id,meeting_id,provider,model,endpoint,off_device,status,started_at) VALUES('private-other-run','other','openai','other-model','https://api.openai.com/v1',1,'failed','2099-01-01');").unwrap();
        let history = summary_history(&db, "retry-meeting").unwrap();
        assert_eq!(history.len(), 20);
        assert_eq!(history[0]["model"], "run-24");
        assert_eq!(history[19]["model"], "run-5");
        assert!(history.iter().all(|run| run["model"] != "other-model"));
    }
    #[test]
    fn import_rejects_invalid_shapes_and_ranges() {
        for json in [
            "null",
            "[]",
            "{\"title\":7}",
            "[{\"title\":\"ok\"},false]",
            "{\"title\":\"x\",\"created_at\":\"yesterday\"}",
            "{\"title\":\"x\",\"transcript\":[{\"text\":\"hi\",\"start\":5,\"end\":2}]}",
        ] {
            assert!(parse_import(json).is_err(), "{json}");
        }
    }
    #[test]
    fn import_converts_seconds_preserves_milliseconds_and_named_speakers() {
        let notes = parse_import(r#"{"notes":[{"title":"Demo","createdAt":"2026-09-30","transcript":[{"text":"Hello","start":1.5,"end":2.25,"speaker":"Sam"},{"text":"Again","start_ms":3000,"end_ms":4000,"speaker":"Sam"}]}]}"#).unwrap();
        assert_eq!(notes[0].segments[0].start_ms, 1500);
        assert_eq!(notes[0].segments[1].end_ms, 4000);
        assert_eq!(notes[0].segments[0].speaker, notes[0].segments[1].speaker);
        assert_eq!(notes[0].created, "2026-09-30T00:00:00+00:00");
    }
    #[test]
    fn fts_user_text_is_literal() {
        assert_eq!(
            fts_query("What's \"budget\" OR plan?"),
            Some("\"What\" OR \"s\" OR \"budget\" OR \"OR\" OR \"plan\"".into())
        );
        assert_eq!(fts_query("*** : ( )"), None);
    }
    #[test]
    fn imports_roll_back_on_storage_error() {
        let db = Db::open(std::path::Path::new(":memory:")).unwrap();
        db.conn().execute_batch("CREATE TRIGGER reject_bad BEFORE INSERT ON segments WHEN new.text='reject' BEGIN SELECT RAISE(ABORT,'test rejection'); END;").unwrap();
        let notes =
            parse_import(r#"[{"title":"Good"},{"title":"Bad","transcript":[{"text":"reject"}]}]"#)
                .unwrap();
        assert!(import_notes(&db, &notes).is_err());
        let count: i64 = db
            .conn()
            .query_row("SELECT count(*) FROM meetings", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
    #[test]
    fn failed_enhancement_keeps_raw_note_and_transcript() {
        let db = Db::open(std::path::Path::new(":memory:")).unwrap();
        let raw = EnhancedNote {
            title: "Raw".into(),
            summary: "Saved transcript".into(),
            chapters: vec![],
            decisions: vec![],
            action_items: vec![],
        };
        let transcript = vec![Segment {
            start_ms: 0,
            end_ms: 1000,
            speaker: 0,
            text: "Unique recovered words".into(),
            final_: true,
        }];
        persist_meeting(
            &db,
            "meeting",
            &raw,
            &transcript,
            "2026-09-30T12:00:00Z",
            1,
            "Meeting",
        )
        .unwrap();
        db.conn().execute_batch("CREATE TRIGGER reject_actions BEFORE INSERT ON action_items BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
        let enhanced = EnhancedNote {
            title: "Enhanced".into(),
            action_items: vec![crate::llm::ActionItem {
                text: "Task".into(),
                owner: None,
                due: None,
            }],
            ..raw.clone()
        };
        assert!(update_enhancement(&db, "meeting", &enhanced, "test-run", true).is_err());
        let title: String = db
            .conn()
            .query_row("SELECT title FROM meetings WHERE id='meeting'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(title, "Raw");
        let count: i64 = db
            .conn()
            .query_row(
                "SELECT count(*) FROM segments_fts WHERE segments_fts MATCH 'recovered'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }
    #[test]
    fn literal_question_retrieves_only_selected_meeting() {
        let db = Db::open(std::path::Path::new(":memory:")).unwrap();
        db.conn().execute_batch("INSERT INTO meetings(id,title,started_at,duration_s) VALUES('one','First','2026-09-30',1),('two','Second','2026-09-30',1); INSERT INTO segments(id,meeting_id,start_ms,end_ms,speaker,text) VALUES('a','one',0,1,0,'Budget target'),('b','two',0,1,0,'Budget target');").unwrap();
        let query = fts_query("What's the budget? \" OR *").unwrap();
        let count: i64 = db.conn().query_row("SELECT count(*) FROM segments_fts f JOIN segments s ON s.rowid=f.rowid WHERE segments_fts MATCH ?1 AND s.meeting_id=?2",rusqlite::params![query,"one"],|r|r.get(0)).unwrap();
        assert_eq!(count, 1);
    }
    #[test]
    fn summary_only_notes_are_available_to_scoped_questions() {
        let db = Db::open(std::path::Path::new(":memory:")).unwrap();
        db.conn().execute_batch("INSERT INTO meetings(id,title,started_at,duration_s,summary) VALUES('one','First','2026-09-30',0,'Launch is on Friday'),('two','Second','2026-09-30',0,'Private other meeting');").unwrap();
        let context = library_context(
            &db,
            &fts_query("Summarize this meeting").unwrap(),
            Some("one"),
        )
        .unwrap();
        assert_eq!(context.len(), 1);
        assert!(context[0].contains("Launch is on Friday"));
        assert!(!context[0].contains("Private other meeting"));
    }
}
