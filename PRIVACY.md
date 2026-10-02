# Privacy and data handling

This statement describes the source in this repository. Open Granola is a development preview. Real-model capture, provider accounts and packaged builds require further end-to-end testing.

## Processing choices

Microphone audio is transcribed locally with Whisper. There is no cloud transcription route in the current app. Summaries, library questions, recipes and commitment extraction use the selected text model:

| Choice | Data sent by Open Granola |
|---|---|
| Built-in local model | No provider request |
| LM Studio / literal loopback server | Prompt and relevant text to the server on this computer |
| Cloud or remote custom provider | Prompt, transcript and/or relevant saved notes to the configured provider |
| Experimental ChatGPT sign-in | Authentication data to OpenAI; authorized text requests to OpenAI |

Remote text processing requires explicit provider selection and the off-device setting. A failed local model does not trigger an automatic cloud fallback. A loopback server can forward text to other services; inspect its own configuration and policies. Provider retention and processing terms apply to text sent off-device.

The [official ChatGPT sign-in integration](https://developers.openai.com/siwc/token-sharing-open-source) requests permission for eligible plan usage. It does not give Open Granola access to existing ChatGPT conversations. Real-account end-to-end validation is still pending.

## Local storage

The desktop app stores meetings, transcripts, actions, commitments, recipes, processing details, settings and any embedding placeholders in `<app-data>/library/opengranola.db`. SQLite can create `-wal` and `-shm` sidecars. The database is **not encrypted by the app**. Protection at rest depends on the operating system's account permissions and disk encryption.

Default app-data locations:

- macOS: `~/Library/Application Support/app.opengranola` (a sandboxed bundle may use its container)
- Windows: `%APPDATA%/app.opengranola`
- Linux: `~/.local/share/app.opengranola`

Use the directory shown in Settings for the running build. Models are manually installed under `library/models/` and are separate from meeting data. There is no in-app model downloader.

Raw capture audio and the live transcript remain in memory until the meeting is saved. The app does not implement stored audio playback or encrypted audio recording. Releasing RAM is not a guarantee against swap, crash dumps or memory forensics. A crash or power loss before persistence can lose the live session. Transcript-preserving retry applies to a meeting already saved in SQLite.

On Unix the library directory and database are restricted to the current user. On Windows access follows the user's filesystem permissions. Backup and synchronization software can copy these files independently of the app.

## Credentials and account data

API keys and ChatGPT tokens are handled in native code. The renderer receives status and account labels, not token values. The preferred store is the OS credential store; if a write fails, the app can keep credentials only in process memory and shows session-only storage. The user may need to reconnect after restarting.

Non-secret provider settings live in `library/providers.json`. ChatGPT registration/account labels live in `library/chatgpt-accounts.json`; credentials are not put in those JSON files. API keys are scoped to the selected provider and API base URL. Changing a route does not authorize sending its old key to an unrelated endpoint.

The library purge and meeting retention policy do **not** delete these provider configuration files or OS-stored credentials. Clear keys or disconnect the ChatGPT account in Models & connections separately. Review authorized app access in ChatGPT settings if remote revocation cannot be confirmed.

## Network boundary

This build permits native network requests for the configured provider and optional ChatGPT authentication. The production webview's Content Security Policy limits its connections to local Tauri IPC; provider keys and HTTP requests stay out of frontend browser APIs. Custom commands still form a security boundary and need validation.

There is **no blanket OS network-denial policy**. The macOS entitlement configuration permits outbound provider traffic and the local sign-in callback listener; Windows and Linux also allow configured native networking. The historical `airlock` module reports this application policy rather than claiming an enforced air gap. The app does not measure lifetime network traffic.

Provider requests disable automatic proxy discovery and redirects. Remote custom endpoints require HTTPS, while literal loopback addresses may use HTTP. These controls reduce accidental routing errors; they do not prove how a selected server handles text after receipt. A provider that requires an enterprise proxy or custom authentication mechanism may need further integration.

## Retention and deletion

- With retention disabled, the library remains until cleared. A retention period applies to existing and newly created/imported meetings.
- Expired meetings are removed with their dependent transcripts, actions, commitments, embeddings and search entries. The policy is checked when the database opens and during desktop use.
- **Purge library** clears database library tables, including recipes and database settings. It retains the schema, manually installed model files, provider JSON configuration and credentials stored separately.
- Local deletion uses foreign-key cascades, SQLite secure deletion, FTS cleanup, compaction and a checked WAL truncation. If cleanup is blocked, the operation reports an error.

This removes data from the live application database. It does not guarantee forensic erasure from SSDs, snapshots, swap, exports or backups. It also cannot delete requests already received by an external provider.

## Review and reporting

The source implements no telemetry or Open Granola cloud-sync service. This is not a compliance certification or an independent security audit. [SECURITY.md](SECURITY.md) describes implemented controls, limits and vulnerability reporting.
