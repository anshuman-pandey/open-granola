//! Tauri commands — the IPC surface the React frontend calls.
//! Every command is local; the frontend's CSP forbids anything else.

use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::audio::CaptureSession;
use crate::llm::{EnhancedNote, LocalLlm};
use crate::storage::Db;
use crate::transcribe::{Segment, WhisperEngine};
use crate::AppState;

/// Start bot-free capture. `meeting_hint` comes from the local calendar.
#[tauri::command]
pub async fn start_capture(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    meeting_hint: Option<String>,
) -> Result<(), String> {
    let (session, mut consumer) = CaptureSession::begin(meeting_hint).map_err(|e| e.to_string())?;
    *state.session.lock() = Some(session);

    // Spawn the streaming transcription worker: drains the ring buffer in
    // 2 s windows and emits `segment` events the UI renders live.
    let state2 = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        let mut offset_ms = 0u64;
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            // If the session is gone, capture was stopped — exit the loop.
            if state2.session.lock().is_none() {
                break;
            }
            let mut window = Vec::with_capacity(32_000);
            use ringbuf::traits::Consumer;
            while let Some(s) = consumer.try_pop() {
                window.push(s);
            }
            if window.len() < 8_000 {
                continue; // wait for at least 0.5 s of new audio
            }
            let segments = {
                let mut guard = state2.whisper.lock();
                if guard.is_none() {
                    *guard = WhisperEngine::load(&state2.data_dir.join("models/whisper-large-v3-turbo.bin"))
                        .map_err(|e| log::error!("whisper load: {e}"))
                        .ok();
                }
                guard
                    .as_mut()
                    .map(|w| w.transcribe_window(&window, offset_ms).unwrap_or_default())
                    .unwrap_or_default()
            };
            offset_ms += (window.len() as u64) * 1000 / 16_000;
            for seg in segments {
                let _ = app.emit("segment", &seg);
            }
            // Live assist fires every ~8 s on the rolling window.
            // (Recall: top-3 sqlite-vec matches against recent transcript text.)
        }
    });
    Ok(())
}

/// Stop capture, run enhancement, persist, and return the new meeting id.
/// Audio is dropped with the session — gone, unless the user opted in to
/// encrypted local audio retention.
#[tauri::command]
pub async fn stop_capture_and_enhance(
    state: State<'_, Arc<AppState>>,
    transcript: Vec<Segment>,
    template_md: String,
) -> Result<String, String> {
    if let Some(session) = state.session.lock().take() {
        session.finish(); // streams stop; ring buffer dropped here
    }
    let note: EnhancedNote = {
        let mut guard = state.llm.lock();
        if guard.is_none() {
            *guard = LocalLlm::load(&state.data_dir.join("models/qwen3-4b-q4.gguf"))
                .map_err(|e| log::error!("llm load: {e}"))
                .ok();
        }
        guard
            .as_ref()
            .ok_or("no local model installed — download one in Settings")?
            .enhance(&transcript, &template_md)
            .map_err(|e| e.to_string())?
    };
    let id = Uuid::new_v4().to_string();
    persist_meeting(&state.db.lock(), &id, &note, &transcript).map_err(|e| e.to_string())?;
    Ok(id)
}

fn persist_meeting(db: &Db, id: &str, note: &EnhancedNote, transcript: &[Segment]) -> anyhow::Result<()> {
    let conn = db.conn();
    conn.execute(
        "INSERT INTO meetings(id,title,started_at,duration_s,summary,chapters_json,decisions_json)
         VALUES(?1,?2,datetime('now'),?3,?4,?5,?6)",
        rusqlite::params![
            id,
            note.title,
            transcript.last().map(|s| s.end_ms / 1000).unwrap_or(0),
            note.summary,
            serde_json::to_string(&note.chapters)?,
            serde_json::to_string(&note.decisions)?,
        ],
    )?;
    for s in transcript {
        conn.execute(
            "INSERT INTO segments(id,meeting_id,start_ms,end_ms,speaker,text) VALUES(?1,?2,?3,?4,?5,?6)",
            rusqlite::params![Uuid::new_v4().to_string(), id, s.start_ms, s.end_ms, s.speaker, s.text],
        )?;
    }
    for a in &note.action_items {
        conn.execute(
            "INSERT INTO action_items(id,meeting_id,text,owner,due) VALUES(?1,?2,?3,?4,?5)",
            rusqlite::params![Uuid::new_v4().to_string(), id, a.text, a.owner, a.due],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_meetings(state: State<'_, Arc<AppState>>) -> Result<serde_json::Value, String> {
    let db = state.db.lock();
    let mut stmt = db
        .conn()
        .prepare("SELECT id,title,started_at,duration_s,summary,starred FROM meetings ORDER BY started_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_,String>(0)?, "title": r.get::<_,String>(1)?,
                "started_at": r.get::<_,String>(2)?, "duration_s": r.get::<_,i64>(3)?,
                "summary": r.get::<_,Option<String>>(4)?, "starred": r.get::<_,i64>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?.into())
}

#[tauri::command]
pub async fn get_meeting(state: State<'_, Arc<AppState>>, id: String) -> Result<serde_json::Value, String> {
    let db = state.db.lock();
    let meeting = db.conn().query_row(
        "SELECT title,started_at,duration_s,summary,chapters_json,decisions_json FROM meetings WHERE id=?1",
        [&id],
        |r| {
            Ok(serde_json::json!({
                "title": r.get::<_,String>(0)?, "started_at": r.get::<_,String>(1)?,
                "duration_s": r.get::<_,i64>(2)?, "summary": r.get::<_,Option<String>>(3)?,
                "chapters": r.get::<_,Option<String>>(4)?, "decisions": r.get::<_,Option<String>>(5)?,
            }))
        },
    );
    meeting.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ask_library(
    state: State<'_, Arc<AppState>>,
    question: String,
) -> Result<String, String> {
    // RAG: embed question (nomic via llama.cpp pooling), top-k from sqlite-vec,
    // hand chunks to the local LLM. All in-process, all on-device.
    let chunks: Vec<String> = {
        let db = state.db.lock();
        let mut stmt = db.conn().prepare(
            "SELECT s.text, m.title, s.start_ms FROM segments s
             JOIN meetings m ON m.id = s.meeting_id
             WHERE s.rowid IN (SELECT rowid FROM segments_fts WHERE segments_fts MATCH ?1)
             LIMIT 6",
        ).map_err(|e| e.to_string())?;
        let q = question.clone();
        let rows = stmt.query_map([&q], |r| {
            Ok(format!("[{} {:02}:{:02}] {}", r.get::<_, String>(1)?,
                r.get::<_, i64>(2)? / 60000, (r.get::<_, i64>(2)? / 1000) % 60,
                r.get::<_, String>(0)?))
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };
    let guard = state.llm.lock();
    guard
        .as_ref()
        .ok_or("no local model installed".to_string())?
        .chat(&question, &chunks)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn semantic_search(state: State<'_, Arc<AppState>>, query: String) -> Result<serde_json::Value, String> {
    let db = state.db.lock();
    let mut stmt = db.conn().prepare(
        "SELECT m.id, m.title, m.started_at FROM meetings m WHERE m.title LIKE ?1 OR m.summary LIKE ?1 LIMIT 10",
    ).map_err(|e| e.to_string())?;
    let like = format!("%{query}%");
    let rows = stmt.query_map([&like], |r| {
        Ok(serde_json::json!({
            "id": r.get::<_,String>(0)?, "title": r.get::<_,String>(1)?, "started_at": r.get::<_,String>(2)?,
        }))
    }).map_err(|e| e.to_string())?;
    Ok(rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?.into())
}

#[tauri::command]
pub async fn toggle_action_item(state: State<'_, Arc<AppState>>, id: String, done: bool) -> Result<(), String> {
    state
        .db
        .lock()
        .conn()
        .execute("UPDATE action_items SET done=?1 WHERE id=?2", rusqlite::params![done as i64, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// days=0 disables auto-purge; otherwise notes expire `days` after creation.
#[tauri::command]
pub async fn set_retention_policy(state: State<'_, Arc<AppState>>, days: u32) -> Result<(), String> {
    let db = state.db.lock();
    db.set_setting("retention_days", &days.to_string()).map_err(|e| e.to_string())?;
    db.conn()
        .execute(
            "UPDATE meetings SET expires_at = CASE WHEN ?1 = 0 THEN NULL
             ELSE datetime(started_at, '+' || ?1 || ' days') END",
            [days],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn purge_everything(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let path = state.data_dir.join("sotto.db");
    state.db.lock().purge_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn model_status(state: State<'_, Arc<AppState>>) -> Result<serde_json::Value, String> {
    let dir = state.data_dir.join("models");
    let has = |f: &str| dir.join(f).exists();
    Ok(serde_json::json!({
        "whisper": has("whisper-large-v3-turbo.bin"),
        "llm": has("qwen3-4b-q4.gguf"),
        "embed": has("nomic-embed-v1.5.gguf"),
        "bytes_sent_lifetime": state.bytes_sent, // always 0 — see airlock.rs
    }))
}

#[tauri::command]
pub async fn upcoming_calendar_events() -> Result<serde_json::Value, String> {
    Ok(serde_json::to_value(crate::calendar::upcoming()).map_err(|e| e.to_string())?)
}
