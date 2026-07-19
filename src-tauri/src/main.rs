// Sotto — local-first meeting notes.
// Entry point. All real work lives in sotto_lib so it can be tested headlessly.
// Prevents the console window flashing on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sotto_lib::run()
}
