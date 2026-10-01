# Open Granola

A local meeting notebook built with React, Tauri, Rust, Whisper and llama.cpp. Apache-2.0.

## Free and open source

Open Granola is free to use, with source available under the [Apache-2.0 license](LICENSE). There is no subscription, account requirement, paid API key or feature paywall. Run it on your own computer and contribute improvements through this repository. Model files are installed separately and have their own licenses.

**Development preview.** The browser demo uses clearly labeled sample meetings. The desktop app stores notes in a local SQLite database and runs inference against manually installed models. There is no account, telemetry service, or application model downloader.

## What works in this source tree

- **Meeting workspace:** search, filter, sort, read notes and transcripts, navigate chapters, review action items and commitments, export Markdown, and use a keyboard command palette.
- **Microphone capture:** a dedicated native audio thread converts microphone input to 16 kHz mono and sends transcript segments from a local Whisper model. Start failures are surfaced; concurrent recordings are rejected.
- **Durable transcripts:** stopping drains pending audio and saves the raw transcript in a transaction before attempting local AI enhancement. A missing or failing language model does not discard a saved transcript. Failed saves can be retried while the app remains open.
- **Local notes and questions:** llama.cpp can create summaries and actions, answer questions using matching transcript passages, and run recipe prompts. Model output should be reviewed against the transcript.
- **JSON imports:** bounded, validated imports are atomic. Search uses SQLite full-text search; it is lexical search, not semantic vector retrieval.
- **Retention and deletion:** expired meetings and related rows are removed together. Full-library deletion clears notes, transcripts, actions, commitments, recipes, settings and search indexes while keeping the database usable.
- **Privacy boundaries:** a restrictive desktop Content Security Policy, minimal webview permissions, no remote fonts in the app, and a macOS release network restriction. See [PRIVACY.md](PRIVACY.md) for exact platform limitations.

## Current limitations

System audio loopback, speaker diarization, calendar integration, semantic embeddings, encrypted audio playback, automatic model downloads and mobile pairing are **not implemented**. Microphone capture does not capture the other side of a call through headphones. Stored notes are not encrypted by the app. Filesystem deletion cannot guarantee erasure from SSDs, snapshots or backups.

The desktop source requires platform testing before release. Windows and Linux have no application-installed OS network sandbox. Release signing/notarization requires maintainer credentials. This repository does not claim certification or production readiness.

## Run the browser demo

Use Node 24 LTS (minimum 22.12):

```sh
git clone https://github.com/anshuman-pandey/open-granola.git
cd open-granola
npm ci
npm run dev
```

Open `http://127.0.0.1:1420`. The demo is in memory and resets on reload. It never requests microphone access or runs local inference.

## Build the desktop app

Install a Rust 1.98 or newer toolchain, CMake, a C/C++ compiler, libclang, and [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/). Linux also needs ALSA development headers (`libasound2-dev`). The lockfile records the tested dependency resolution. The desktop build scripts first build and stage a private llama.cpp worker; it communicates with the app through local pipes so its GGML library cannot collide with Whisper. CPU inference is portable; accelerator builds require the matching platform toolchain.

```sh
npm ci
npm run tauri dev
# CPU inference by default; accelerator builds are explicit opt-ins:
npm run tauri build
# Apple Silicon, with Metal toolchain installed:
OPEN_GRANOLA_INFERENCE_FEATURES=metal npm run tauri build -- --features metal
```

Settings shows the local model directory and whether each expected file is present. Install trusted model files there manually:

| File | Purpose |
| --- | --- |
| `whisper-large-v3-turbo.bin` | whisper.cpp-compatible transcription model |
| `qwen3-4b-q4.gguf` | GGUF model with a supported chat template for local notes and questions |

File presence is a readiness hint; capture/inference validates whether the model actually loads. These files are large and are intentionally excluded from Git. The app does not fetch them or verify their provenance for you. Models and generated output remain on the device unless you explicitly copy or export content.

## Checks

```sh
npm run check
npm audit
npm run build:worker
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --workspace --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace
```

CI checks the frontend, security policy and native code on macOS, Windows and Linux. A green local macOS build does not replace the other platform checks. See [the overhaul report](docs/OVERHAUL.md) for verified results and remaining work.

## Repository map

- `src/App.tsx`: workspace state, lazy note loading and capture recovery.
- `src/lib/backend.ts`: typed browser/desktop boundary.
- `src/components/`: accessible workspace, notes, actions, settings and search.
- `src-tauri/src/audio/`: microphone ownership, buffering and resampling.
- `src-tauri/src/commands.rs`: validated IPC, transactional saves/imports and search.
- `src-tauri/src/storage.rs`: schema migration, FTS synchronization and deletion.
- `src-tauri/src/airlock.rs`: platform network restriction and honest status.
- `scripts/check-security.mjs`: static privacy boundary regression checks.

[Architecture](docs/ARCHITECTURE.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Privacy](PRIVACY.md)
