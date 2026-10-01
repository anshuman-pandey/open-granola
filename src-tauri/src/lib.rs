mod airlock;
mod audio;
mod calendar;
mod commands;
mod inference;
mod llm;
mod storage;
mod transcribe;

use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::Mutex;
use tauri::{Emitter, Manager};

/// Library mutations and model calls acquire capture_gate before inner locks.
/// Never hold the database lock during inference or while joining capture.
pub struct AppState {
    pub data_dir: PathBuf,
    pub db: Mutex<storage::Db>,
    pub session: Mutex<Option<audio::CaptureSession>>,
    pub pending_capture: Mutex<Option<audio::CapturedMeeting>>,
    pub capture_gate: tokio::sync::Mutex<()>,
    pub llm: Mutex<Option<llm::LocalLlm>>,
    pub airlock: airlock::AirlockStatus,
}

pub fn run() {
    env_logger::init();
    let airlock = airlock::engage().expect("could not apply network policy");

    tauri::Builder::default()
        .setup(move |app| {
            let data_dir = app.path().app_data_dir()?.join("library");
            std::fs::create_dir_all(&data_dir)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&data_dir, std::fs::Permissions::from_mode(0o700))?;
            }
            std::fs::create_dir_all(data_dir.join("models"))?;
            let db = storage::Db::open(&data_dir.join("opengranola.db"))?;
            let state = Arc::new(AppState {
                data_dir,
                db: Mutex::new(db),
                session: Mutex::new(None),
                pending_capture: Mutex::new(None),
                capture_gate: tokio::sync::Mutex::new(()),
                llm: Mutex::new(None),
                airlock,
            });
            app.manage(state.clone());
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
                interval.tick().await;
                loop {
                    interval.tick().await;
                    let _gate = state.capture_gate.lock().await;
                    let db_state = state.clone();
                    let result = tauri::async_runtime::spawn_blocking(move || {
                        db_state.db.lock().enforce_retention()
                    })
                    .await;
                    match result {
                        Ok(Ok(count)) if count > 0 => {
                            let _ = app_handle.emit("library-changed", ());
                        }
                        Ok(Err(e)) => {
                            let _ = app_handle.emit("library-changed", ());
                            log::error!("retention failed: {e}");
                        }
                        Err(e) => log::error!("retention worker failed: {e}"),
                        _ => {}
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_capture,
            commands::cancel_capture,
            commands::list_action_items,
            commands::stop_capture_and_enhance,
            commands::list_meetings,
            commands::get_meeting,
            commands::ask_library,
            commands::semantic_search,
            commands::toggle_action_item,
            commands::set_retention_policy,
            commands::purge_everything,
            commands::model_status,
            commands::upcoming_calendar_events,
            commands::get_brief,
            commands::list_commitments,
            commands::mark_commitment,
            commands::run_recipe,
            commands::import_granola_export,
        ])
        .run(tauri::generate_context!())
        .expect("error while running open-granola");
}
