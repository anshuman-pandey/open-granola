# Security

## Reporting a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/anshuman-pandey/open-granola/security/advisories/new) if it is enabled for this repository. If it is unavailable, open an issue asking the maintainer for a private reporting channel without including exploit details or sensitive data. Include the affected commit, platform, reproduction steps, and expected impact in the private report. Do not attach real meeting recordings or transcripts.

This project is an early prototype. No release has an independent security certification, and there is no promised response SLA or long-term support policy.

## Security boundaries

| Boundary | Implemented control | Limit |
|---|---|---|
| Frontend → remote services | Production CSP restricts connections to local Tauri IPC; remote resources, forms, frames, and objects are blocked | CSP does not sandbox Rust dependencies or top-level navigation |
| Frontend → plugins | Only event listen/unlisten capabilities; unused filesystem store plugin removed | Application commands still require careful validation |
| Rust process → network | Release macOS sandbox denies network; startup fails on installation failure | Windows/Linux OS blocking is unimplemented; debug builds need localhost |
| Stored meeting → child records | SQLite defensive mode, foreign keys, cascades, FTS triggers, startup legacy repair | SQLite is not encrypted by the app |
| Retention → new records | Policy update is transactional; insert trigger assigns expiry | Imported timestamps need validation at the command boundary |
| Deletion → live database | Secure delete for ordinary and FTS tables, index rebuild, VACUUM, checked WAL truncation | Does not erase SSD remnants, snapshots, exports or backups |

The intended attacker boundary includes untrusted imported note text and accidental first-party networking. It does not include a compromised OS account, malicious app binary, privileged process, or hostile model file exploiting native inference code. Model files should come from sources you trust. Prompt injection in meeting content can affect generated text; outputs require review and should never authorize actions automatically.

## Regression checks

- `node scripts/check-security.mjs` parses the actual production/development CSP and capability files, checks signing entitlements, and flags common first-party network calls. It is a regression guard, not a network proof.
- `node --test scripts/check-security.test.mjs` verifies that remote origins mixed with valid origins, missing restrictions, broad permissions, and production network calls are rejected.
- `cargo test --manifest-path src-tauri/Cargo.toml storage::tests` exercises dependent-row deletion, FTS maintenance, policy propagation, legacy repair, full purge, WAL cleanup, and reopen/write integrity.
- On macOS, `cargo test --manifest-path src-tauri/Cargo.toml airlock::tests` installs the real sandbox in a child process and checks that a previously reachable local TCP endpoint returns an OS permission error. It does not depend on external network availability.

Before shipping, build and test the signed release on each supported OS, inspect effective signing entitlements, check webview/helper network behavior, test capture permissions and model failures, and audit both Rust and JavaScript dependencies. Development test results alone do not validate a packaged binary.

## Inference worker

Whisper and llama.cpp run in separate processes to avoid collisions between their native GGML libraries. The desktop launches a fixed adjacent `open-granola-inference` executable without a shell or PATH lookup. Requests use anonymous stdin/stdout pipes with a 1 MiB input limit, 2 MiB response limit, 2,000-token generation limit, and a 180-second deadline. Timeout or invalid transport output kills and reaps the worker. The worker inherits the parent's sandbox; it does not install another sandbox or claim that standalone command-line use has OS network enforcement.

On macOS the worker is copied as a custom bundle file so Tauri does not replace its helper signature with the main app's entitlements. For a signed release, import an Apple signing identity into a keychain and set `APPLE_SIGNING_IDENTITY` before building. The preparation script signs the worker with exactly `app-sandbox` and `inherit`; the main app retains its separate entitlements. Certificate-only automatic import during Tauri bundling is not supported by this helper preparation step. Verify both effective signatures and exercise inference in the finished bundle before distribution.

## Design references

- [SQLite secure_delete and WAL checkpoints](https://www.sqlite.org/pragma.html): ordinary secure deletion does not cover all FTS shadow content; a TRUNCATE checkpoint may report that readers prevented completion.
- [SQLite FTS5 secure-delete](https://www.sqlite.org/fts5.html#the_secure_delete_configuration_option) and [external-content maintenance](https://www.sqlite.org/fts5.html#external_content_tables): the application enables FTS secure deletion and maintains the index with triggers.
- [SQLite vulnerability status](https://www.sqlite.org/cves.html): native SQLite advisories also matter when a Rust dependency audit has no matching advisory.
- [Tauri CSP](https://v2.tauri.app/security/csp/) and [core permissions](https://v2.tauri.app/reference/acl/core-permissions/): default permissions include more than event subscriptions, so this app uses explicit minimal capabilities.

## Remaining dependency findings (2026-09-30)

The Tauri Linux/BSD GTK dependency tree still contains two RustSec warnings. Neither is suppressed in the audit configuration:

- **glib 0.18.5 — [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html):** a string-variant iterator has undefined behavior that can cause an optimized build to crash. The fixed release is 0.20.0 or later. Tauri 2.12, Tao 0.37, and Wry 0.57 still require GTK 0.18, whose types are tied to the older GLib crate. Adding a newer direct dependency does not replace those transitive types. Our code does not directly call the affected iterator; reachability through the framework has not been proven absent. Linux/BSD release validation remains incomplete until a compatible upstream fix or a reviewed backport is adopted.
- **proc-macro-error 1.0.4 — [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html):** an unmaintained build-time dependency of GTK/GLib macros, with no patched release. Replacing it requires changes in the upstream macros. This is a maintenance finding, not evidence of an observed runtime exploit.

These dependencies are conditional on the GTK platform backend. Keep full-lockfile auditing enabled so changes to their status remain visible. A clean vulnerability count does not mean all informational or native-library risks are resolved.
