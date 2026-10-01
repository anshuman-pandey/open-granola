# Contributing to Open Granola

Keep meeting data local. Features must state their limitations and fail visibly when a model, permission or platform feature is unavailable.

## Join in

Bug reports, documentation fixes, accessibility improvements and code contributions are welcome. Check existing issues before opening one. For a larger change, describe the behavior and scope in an issue first so contributors can discuss it. See [SECURITY.md](SECURITY.md) for private vulnerability reports.

Fork the repository, create a branch for your change, and open a pull request against `main`. Include a short description and the checks you ran. Small documentation fixes do not need the native toolchain.

## Setup

Use Node 24 LTS and Rust 1.98 or newer. Native builds also need CMake, libclang, a C/C++ compiler, and [Tauri platform dependencies](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run dev          # browser sample workspace
npm run tauri dev    # native app; models installed manually in Settings' directory
```

See the [README](README.md) for model filenames and supported behavior.

## Engineering rules

1. Do not add application network clients, remote assets, analytics, accounts or cloud inference. Build tooling can download dependencies; that is distinct from application runtime behavior. Changes to these boundaries require an explicit product and security decision.
2. Every data-bearing table must participate in retention and full-library deletion. Add regression tests for schema, migration, FTS and deletion changes. Do not promise physical erasure from SSDs or backups.
3. Persist raw transcripts before enhancement. Use transactions for multi-table writes. Do not trust renderer-provided timestamps, model output structure or imported JSON.
4. Surface errors to the user and preserve recovery paths. Do not display sample data, canned answers or fixed network counters as real desktop results.
5. Keep expensive inference and audio work off the UI thread. Respect the capture gate when changing capture, retention and deletion.

## Before submitting

```sh
npm run check
npm audit
npm run build:worker
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --workspace --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace
```

Commit both dependency lockfiles. Describe behavior, validation and remaining platform limitations in the pull request. Use conventional commit messages and keep related changes together. Never commit meeting libraries, audio, model weights, credentials or signing keys.

## Useful next work

- Implement and test native system audio loopback on each OS.
- Add checkpoint recovery for process termination during capture.
- Validate long meeting transcription and summarization with real models.
- Add library pagination and long-transcript rendering benchmarks.
- Test model compatibility, accessibility and packaged permissions on actual hardware.

Report security issues using [SECURITY.md](SECURITY.md). Be kind and direct. Contributions are licensed under Apache-2.0.
