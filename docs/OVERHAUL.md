# Repository overhaul — 1 October 2026

Working branch: `codex/repo-overhaul`. Starting commit: `9d62163`.

Scope: changes to this open-source repository. Open Granola remains free under its existing Apache-2.0 license. This work does not publish a hosted service or a product release; local builds validate the repository.

## Result

The audit covered the desktop core, frontend views/state, storage and privacy boundaries, dependency/build configuration, CI, landing page and project documentation. Product/design, native engineering and security agents implemented and reviewed the changes together. The work replaces several unsafe prototype behaviors with testable behavior. No numerical “10×” quality or speed improvement is claimed.

## Main changes

| Area | Before | After |
| --- | --- | --- |
| Full deletion | Overwrote an open database, omitted commitments and recipes | Transactional clearing of all user tables, FTS rebuild, VACUUM/WAL compaction, reusable database |
| Retention | Foreign keys off, enforcement missing, new records unprotected | Cascades enabled, orphan migration, expiry on insert, startup/periodic enforcement and tests |
| Search | Unsynchronized FTS and raw user query syntax | Insert/update/delete triggers, index migration and safely quoted lexical queries |
| Capture | Non-thread-safe stream ownership, repeat starts, incorrect timestamps | Dedicated stream owner, serialized lifecycle, final buffer drain, native transcript ownership |
| Saving | Enhancement failure lost the note | Raw transcript committed first; recoverable save failure with retry/discard |
| Native inference | Incompatible GGML libraries in one process | Dedicated local llama.cpp worker with bounded private stdio protocol |
| Desktop loading | Sample meetings survived empty/failed real reads; full transcript fetch per row | Empty/error states, metadata-only list, lazy note detail and bulk actions |
| Product experience | Dead controls, inaccessible search, stale state, misleading status | Responsive workspace, keyboard search, source-linked notes, working Markdown export, truthful settings |
| Imports | Unbounded JSON and partial writes silently ignored | Input limits, validation, atomic writes and visible failures |
| Dependencies | 17 npm affected packages, 12 high; private registry URLs | Compatible patched lockfile, public registry URLs; npm audit reports zero |
| Build/CI | Missing Tauri CLI, mismatched dev port, broad/ineffective policy grep | Working scripts, loopback-only dev server, exact security assertions, native matrix and audit gates |
| Claims | Shredding, no network stack, encrypted playback and unfinished features advertised as done | Code, docs and landing page distinguish implemented behavior and limitations |
| Open-source participation | Existing Apache-2.0 license | Explicit free-use guidance, package license metadata, clone/setup instructions and GitHub issue/PR templates |

## Security fixes

- Enable SQLite foreign keys and secure deletion, maintain FTS, remove legacy orphans, and test post-purge integrity and reuse.
- Store the Unix library/database with private permissions. Explicitly state that app-level database encryption is absent.
- Restrict the renderer CSP and event permissions; remove unused store permissions and remote Google Fonts.
- Replace fixed network counters with actual platform enforcement status. macOS release startup fails if the intended network restriction cannot be established. Development, Windows and Linux limits remain explicit.
- Validate structured model output and import payloads. Never execute model output or treat it as application instructions.
- Preserve pending captures across failed writes; prevent stale asynchronous library reads from restoring cleared UI data.
- Isolate Whisper and llama.cpp native dependencies. Launch only the named adjacent worker, without a shell or sockets, using bounded requests/responses and timeouts.

## Validation

Frontend verification includes strict TypeScript build, ESLint, regression tests for native/demo isolation, lazy loading, capture failures/retry/unmount, search races, export, malformed stored fields and keyboard behavior. Separate policy tests inject invalid CSP origins/capabilities and ensure they are rejected.

The browser workspace was inspected at desktop and mobile sizes. Search-to-note navigation, chapter-to-transcript navigation and the simulated recording workflow were exercised. Native and final dependency audit results are recorded in the completion summary below.

### Completion summary

- Frontend: 20 regression tests and 5 security-policy tests pass; ESLint and production TypeScript/Vite build pass.
- npm audit: 0 reported vulnerabilities, down from 17 affected packages (12 high).
- RustSec: the current audit reports 0 vulnerability-class advisories after upgrading `ringbuf` to 0.5.2. Two informational warnings remain in Tauri's Linux GTK dependency graph: [`glib` unsoundness](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) and [unmaintained `proc-macro-error`](https://rustsec.org/advisories/RUSTSEC-2024-0370.html). They are documented and not suppressed. This is not a clean bill of health for Linux.
- Native helper: compiled and staged; missing-model startup returns a bounded error and exits without attempting capture.
- macOS sandbox: local positive-control/denial tests passed for unsigned process inheritance and a properly signed temporary application/helper bundle with the project's entitlement files. Actual release signing still requires maintainer verification.
- Native workspace: 23 regression tests pass; workspace formatting and Clippy across all targets with `-D warnings` pass. The Tauri CLI debug build with `--no-bundle` and Cargo `--locked` produced `src-tauri/target/debug/open-granola` on macOS. This validates the desktop executable and embedded frontend build; no release package was created.

## Current research used

- Tauri's [security model](https://v2.tauri.app/security/) and [configuration reference](https://v2.tauri.app/reference/config/) informed CSP and least-privilege boundaries. Framework/OS networking remains a separate consideration from first-party network clients.
- Vite's [supported release policy](https://vite.dev/releases) and [Windows path bypass advisory](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff) informed the patched Vite 7.3 line and loopback-only development server.
- The llama.cpp Rust bindings' [Whisper collision report](https://github.com/utilityai/llama-cpp-rs/issues/484), corroborated by the current crate build warning, informed process isolation for the native engines.
- SQLite's [foreign-key documentation](https://www.sqlite.org/foreignkeys.html), [FTS5 external-content guidance](https://www.sqlite.org/fts5.html#external_content_tables) and [secure_delete documentation](https://www.sqlite.org/pragma.html#pragma_secure_delete) informed storage repair and realistic deletion claims.
- npm's advisory database and [RustSec](https://rustsec.org/) provide dependency findings. Audit counts describe known package advisories, not a proof that the app has no vulnerabilities.

## Remaining engineering work

1. **Real hardware and models:** test microphone permissions, long recordings, model compatibility, language coverage, latency and transcription quality. No meeting audio was recorded from the user's machine during this audit.
2. **Packaging:** verify signed/notarized macOS builds and Windows/Linux installations. Maintainer signing credentials and platform runners are required for release verification.
3. **Missing product capabilities:** implement system audio loopback, diarization, calendar support, semantic embeddings, encrypted audio playback and mobile pairing as separate reviewed features.
4. **Scale and recovery:** add pagination beyond the bounded library queries, chunked long-meeting summarization and optional secure crash recovery. Pending unsaved recordings currently require the process to stay alive.
5. **Privacy limits:** notes are plaintext SQLite; deletion cannot remove filesystem snapshots/backups, other programs' copies or SSD remapped blocks. Windows/Linux do not have an application-installed OS network sandbox.

## Repository delivery

The changes are prepared on `codex/repo-overhaul` for review through a pull request against `main` in `anshuman-pandey/open-granola`. This delivery covers repository changes; it does not deploy a service or publish a product release. GitHub checks on the pull request provide the cross-platform validation record.
