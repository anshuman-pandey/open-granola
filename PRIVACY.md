# Privacy and data handling

This statement describes the source in this repository. Open Granola is an early desktop prototype; platform capture, inference, and packaging still require testing before a production release.

## Where your data lives

The desktop app stores notes, transcripts, action items, commitments, recipes, settings, and any stored embedding data in `<app-data>/library/opengranola.db`. SQLite may also create `-wal` and `-shm` sidecar files there. This database is **not encrypted by the app**. Use your operating system's disk encryption and account controls for protection at rest.

Raw capture audio is held in memory. The current app does not implement encrypted audio recording or cloud storage. Stopping capture releases the audio buffers; that is not a guarantee against OS swap, crash dumps, or memory forensics.

Models are manually installed under `<app-data>/library/models/`. There is no in-app model download or updater. Model files are separate from meeting data.

Default app-data locations:

- macOS: `~/Library/Application Support/app.opengranola` (a sandboxed bundle may use its container)
- Windows: `%APPDATA%/app.opengranola`
- Linux: `~/.local/share/app.opengranola`

On Unix, the application library directory and database are restricted to the current user. On Windows, access follows the user profile's filesystem permissions. Backups or sync software you configure can copy this directory independently of the app.

## Network behavior and its limits

The application provides no upload, cloud sync, analytics, account, or remote inference feature. Its production webview Content Security Policy restricts connection requests to Tauri's local IPC transport. Capabilities grant only backend event subscription; no HTTP, shell, or filesystem store plugin is exposed to frontend code.

Release macOS builds verify that an existing signed App Sandbox has no network entitlements, or install a process sandbox that denies network access for an unsigned build. Startup fails if the policy cannot be established. The signing configuration requests App Sandbox without network entitlements; release testing must verify the signed bundle. A sandbox on the Rust process alone does not prove the behavior of every webview helper process, which is why the webview policy and release verification both matter.

Windows and Linux currently have **no implemented OS network block**. They rely on the application code and webview policy. Development builds permit the local frontend server and do not install the process network block. A source scan or lack of an HTTP client does not prove that a process or its dependencies cannot open sockets. The app does not measure lifetime network traffic.

## Retention and deletion

- With retention disabled, your library stays until you clear it. A retention period applies to existing and newly created/imported meetings.
- Expired meetings are removed with their transcripts, actions, commitments, embeddings, and search entries. Retention is checked when the database opens and during normal desktop use.
- **Purge library** clears all library tables, including recipes and settings. It keeps the database usable and leaves manually installed model files in place.
- Deletion uses SQLite foreign-key cascades, secure deletion, FTS index cleanup, database compaction, and a checked WAL truncation. If another reader prevents log cleanup, the operation reports an error rather than claiming cleanup finished.

These operations remove data from the live application database. They **cannot guarantee forensic erasure** from SSD wear-leveling, filesystem snapshots, swap, exports, or independent backups. An app cannot erase copies it does not control.

## Review and reporting

Read [SECURITY.md](SECURITY.md) for the threat model, implemented checks, and vulnerability reporting. There is no compliance certification or independent security audit claimed for this prototype. Review the code and your deployment environment before using it for sensitive meetings.
