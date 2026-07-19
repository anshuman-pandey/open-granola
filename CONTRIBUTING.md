# Contributing to Sotto

First: thank you. Sotto exists because meeting software forgot who it works for. Help us keep it honest.

## The three laws of Sotto PRs

1. **No network dependencies.** No HTTP clients, no WebSocket, no cloud SDKs, no "anonymous analytics". CI (`airlock.yml`) enforces this; a human will too.
2. **No accounts or sync servers.** If a feature seems to need a server, the Sotto way is to do it on-device or not at all. Pair-device sync (LAN, end-to-end encrypted, user-initiated) is the only exception on the roadmap.
3. **Deletion must mean deletion.** Any feature that stores data must respect the retention policy and the purge path in `storage.rs`.

## Dev setup

```bash
git clone https://github.com/sotto-notes/sotto.git && cd sotto
npm install
npm run tauri dev
```

Prereqs: Rust ≥ 1.77 (`rustup`), Node ≥ 20, platform Tauri deps. Frontend is React + TypeScript +
Tailwind (in `src/`); backend is Rust (`src-tauri/src/`). Models are fetched into the app-data
folder on first run — or drop GGUFs into `library/models/` manually:

- `whisper-large-v3-turbo.bin` (transcription)
- `qwen3-4b-q4.gguf` (notes, chat, live assist)
- `nomic-embed-v1.5.gguf` (semantic search)

## Where to start

- Issues labeled [`good first issue`](https://github.com/sotto-notes/sotto/labels/good%20first%20issue)
- Platform audio: `src-tauri/src/audio/loopback.rs` (Windows WASAPI and Linux PipeWire need the most love)
- Diarization quality: `src-tauri/src/transcribe.rs` (`spectral_embedding` / clustering)
- Templates & UX polish: `src/components/TemplatesView.tsx`

## Style

- Rust: `cargo fmt` + `cargo clippy -- -D warnings`. Document lock order when touching shared state.
- TypeScript: strict mode, no unused locals (CI runs `tsc -b`).
- Commits: conventional commits (`feat:`, `fix:`, `perf:` …). Small PRs beat big PRs.
- Tests: `cargo test` for Rust; every privacy-relevant path needs a test — deletion, retention, airlock.

## Code of conduct

Be kind, be direct, assume good intent. Maintainers may remove anyone who makes the community worse.

## License

By contributing you agree your work is licensed under Apache-2.0.
