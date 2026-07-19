//! Sotto — local-first meeting notes.
//!
//! Design law, in order:
//! 1. NO network. There is no http client in this crate. Airlock (see `airlock.rs`)
//!    additionally asks the OS to deny outbound connections at runtime.
//! 2. Raw audio lives in memory only, unless the user explicitly opts in to
//!    encrypted local audio retention.
//! 3. Every model runs on-device: whisper.cpp (transcription), llama.cpp
//!    (enhancement/chat), nomic-embed (semantic search index).
//! 4. The user can delete everything, truly, with one call: `storage::purge_all`.

mod airlock;
mod audio;
mod calendar;
mod commands;
mod llm;
mod storage;
mod transcribe;

use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::Mutex;
use tauri::Manager;

/// Shared application state. All heavy resources (model contexts) are loaded
/// lazily and kept behind `parking_lot` mutexes — the lock order is documented
/// at each field to prevent inference-time deadlocks.
pub struct AppState {
    pub data_dir: PathBuf,
    pub db: Mutex<storage::Db>,
    pub session: Mutex<Option<audio::CaptureSession>>,
    pub whisper: Mutex<Option<transcribe::WhisperEngine>>,
    pub llm: Mutex<Option<llm::LocalLlm>>,
    /// Cumulative counter shown in Settings: bytes sent over any socket.
    /// It is hard-wired to zero and exists so the UI can make the claim
    /// "0 bytes sent — ever" honestly.
    pub bytes_sent: u64,
}

pub fn run() {
    env_logger::init();
    airlock::engage(); // before anything else touches the network stack

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?.join("library");
            std::fs::create_dir_all(&data_dir)?;
            let db = storage::Db::open(&data_dir.join("sotto.db"))?;
            app.manage(Arc::new(AppState {
                data_dir,
                db: Mutex::new(db),
                session: Mutex::new(None),
                whisper: Mutex::new(None),
                llm: Mutex::new(None),
                bytes_sent: 0,
            }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_capture,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running sotto");
}
