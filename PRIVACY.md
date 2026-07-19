# Sotto Privacy Policy & Data Handling Statement

**Effective:** v0.1.0 · **Scope:** the Sotto desktop application, all platforms

## The one-paragraph version

Sotto collects nothing, transmits nothing, retains nothing off your device, and cannot do otherwise:
the application contains no network client code, and on macOS the operating system independently
denies the process outbound network access. There are no accounts, no servers, no analytics, no
crash-report beacons, no update checks, and no third-party SDKs with their own data practices.
Everything — audio, transcripts, notes, embeddings, settings — lives in a single folder on your
device that you can inspect, export, or destroy at will.

## What data exists, and where

| Data | Location | Lifetime |
|---|---|---|
| Raw meeting audio | RAM only (ring buffer) | Dropped when you press Stop, unless you opt in to encrypted local audio |
| Opt-in audio files | `<app-data>/library/audio/*.enc` (AES-256-GCM, key in OS keychain) | Until you delete them or retention purge runs |
| Transcripts, notes, action items | `<app-data>/library/sotto.db` (SQLite) | Until you delete them or retention purge runs |
| Search embeddings | Same DB (sqlite-vec) | Same |
| Settings & templates | Same DB / `<app-data>/library/` | Same |
| Model files (Whisper, LLM, embed) | `<app-data>/library/models/` | Until you delete them |

`<app-data>` = `~/Library/Application Support/notes.sotto.app` (macOS), `%APPDATA%/notes.sotto.app`
(Windows), `~/.local/share/notes.sotto.app` (Linux).

## The one network exception

Downloading AI models on first run opens an HTTPS connection to the model host (Hugging Face). This
requires you to explicitly toggle **Airlock off** in Settings, and it is the only feature in the app
capable of opening a socket. You can avoid it entirely by copying GGUF model files into
`library/models/` from any other source. After models are in place, Sotto functions 100% offline,
forever.

## How the guarantee is enforced (verify it yourself)

1. **Compile time** — there is no HTTP/WebSocket/gRPC dependency in `src-tauri/Cargo.toml`.
   `.github/workflows/airlock.yml` fails CI if one ever appears.
2. **Kernel/sandbox time** — `src-tauri/entitlements.plist` omits
   `com.apple.security.network.client`, and `src-tauri/src/airlock.rs` loads a seatbelt profile
   `(deny network*)` at startup. On Linux, the Flatpak manifest uses `--unshare=network`.
3. **Runtime test** — `airlock::tests::outbound_tcp_is_impossible` proves a TCP connect fails from
   within the running process.
4. **Your own tools** — run `lsof -i -P | grep -i sotto` (macOS/Linux) or Microsoft TCPView
   (Windows) at any time. You will see zero connections.

## Retention & deletion

- **Default:** raw audio exists only in memory during capture and is dropped at Stop.
- **Auto-purge:** you choose a retention window (e.g. 90 days); expired meetings are deleted and the
  database is vacuumed so deletion is physical.
- **Purge library:** Settings → "Delete everything" zero-fills the database file before unlinking
  it, then removes the model cache on confirmation.

## What Sotto never does

- No account creation, sign-in, or device fingerprinting
- No telemetry, analytics, A/B testing, or crash reporting
- No training on your data (there is nowhere to send it)
- No cloud sync, no "anonymous usage statistics", no third-party trackers
- No sale, sharing, or processing of personal data by anyone — there is no "anyone"

## For compliance reviewers

Sotto's architecture makes most data-processing questions moot: there is no processor and no
transfer. For HIPAA/GDPR/SOC 2 evaluations, the relevant artifacts are `PRIVACY.md` (this file),
`docs/ARCHITECTURE.md`, the Airlock source, and reproducible builds (planned). Questions:
privacy@sotto-notes.dev.

*This document describes the software as shipped. If you build Sotto from modified source, those
modifications are your own responsibility — which is exactly the point of Apache-2.0.*
