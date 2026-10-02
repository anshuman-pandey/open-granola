# Security

## Reporting a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/anshuman-pandey/open-granola/security/advisories/new) if enabled. Otherwise, open an issue asking the maintainer for a private reporting channel without posting exploit details or sensitive data. Include the affected commit, platform, reproduction steps and expected impact privately. Do not attach real meeting recordings, transcripts, API keys or authorization URLs.

Open Granola is a development preview. No independent security certification, response SLA or long-term support policy is claimed. Provider/account integration and packaged builds still need real end-to-end validation.

## Security boundaries

| Boundary | Implemented control | Limit |
|---|---|---|
| Webview → network | Production CSP restricts connections to local Tauri IPC; remote resources, forms, frames and objects are blocked | This does not sandbox native dependencies or prove process-wide network isolation |
| Webview → native code | Explicit event listen/unlisten capabilities; input-validated app commands; no generic HTTP/shell/filesystem plugin | Native command inputs and outputs remain a security boundary |
| Native code → provider | Reviewed provider/auth modules; explicit remote-text consent; HTTPS for remote endpoints; redirects/proxy discovery disabled; bounded requests | The selected server controls what happens after receiving text; custom providers may require unsupported mechanisms |
| API keys → storage | Provider/endpoint-scoped OS credential storage, with session-only fallback and visible storage status | OS account compromise is outside the boundary; credentials live separately from library purge |
| ChatGPT sign-in → app | Loopback callback, PKCE/state/nonce, verified ID token and granted plan-use scopes | Real-account integration has not been validated end to end; external availability and policy can change |
| Meeting → stored records | SQLite defensive mode, foreign keys, transactions, cascades and FTS maintenance | App-level database encryption is not implemented |
| Summary failure → recovery | Raw transcript saved first; saved summary can be retried while retaining the transcript and existing action state | Live RAM-only capture is not crash durable; provider delivery is not reversed by failure |
| Deletion → live database | SQLite secure delete, FTS cleanup, VACUUM and checked WAL truncation | Does not erase exports, backups, SSD remnants, snapshots or data already sent to providers |

There is no OS-wide network-denial policy. The macOS app requests network client/server entitlements for provider requests and the loopback authentication callback. Windows and Linux permit configured native networking too. The `airlock` module reports this provider policy; it does not establish an air gap.

The threat boundary includes malformed imported JSON, untrusted meeting text, accidental credential disclosure and unintended provider routing. It does not cover a compromised OS account, malicious app binary, privileged process or hostile model exploiting native inference code. Obtain model files from trusted sources. Meeting content can influence generated text through prompt injection; generated notes do not authorize external actions.

## Credentials and sign-in

Keys and tokens stay in native code or the OS credential store, not browser storage or the meeting database. Non-secret provider settings and account registrations are stored separately in JSON. A failed credential-store write uses session memory and is disclosed to the user; restart can require reconnecting. Durable markers prevent stale credentials from silently becoming active again after a failed replacement or disconnect.

The ChatGPT route follows [OpenAI's open-source/local-app authorization flow](https://developers.openai.com/siwc/token-sharing-open-source). It requests eligible plan use for text, not access to existing ChatGPT conversations. Disconnect clears local access and attempts remote revocation; if revocation cannot be confirmed, the app directs the user to ChatGPT settings. Claude is API-key-only in this app.

Provider HTTP clients disable redirects and automatic proxy discovery. Native endpoint validation rejects embedded URL credentials, query strings and fragments. LM Studio requires a literal loopback HTTP URL; remote custom endpoints require HTTPS and explicit consent. Provider-supplied text is not exposed as executable code. These controls do not turn an arbitrary configured provider into a trusted service.

## Regression checks

- `npm run check:security` validates production/development CSP, event capabilities, bundle helpers and signing entitlements. It restricts first-party networking to reviewed native provider/auth modules. It is a source regression guard, not an exhaustive audit or network proof.
- `node --test scripts/check-security.test.mjs` covers policy validation failures and the reviewed native transport exception.
- `cargo test --manifest-path src-tauri/Cargo.toml` covers storage invariants, capture utilities, provider routing/parsing, authentication helpers and related native behavior. Read the test names and mocks before interpreting results.
- `npm run check` runs frontend lint, tests, static security checks and the production build.

A synthetic provider test can establish that a model accepts a small text request. It does not test recording, long contexts, account eligibility across all providers or signed application packaging. Before distribution, test the actual signed bundle, microphone permissions, the OS credential store, local inference and enabled cloud routes on each advertised platform.

## Inference worker

Whisper runs in the app process; llama.cpp runs in a separate helper to avoid native GGML symbol collisions. The desktop launches a fixed adjacent `open-granola-inference` executable without shell interpretation or PATH lookup. Private stdin/stdout pipes carry a maximum 1 MiB request and 2 MiB response, with at most 2,000 requested generated tokens and a 180-second deadline. Invalid transport or timeout kills and reaps the worker.

The helper has no provider functionality. Its macOS sandbox inheritance follows the parent app, which now permits provider networking. Do not claim standalone helper use or the inherited sandbox enforces network denial.

For macOS packaging, the worker is copied as a custom bundle file so Tauri preserves its separate signature. Import the Apple signing identity into a keychain and set `APPLE_SIGNING_IDENTITY` before building. The preparation script signs the worker with `app-sandbox` and `inherit`; the main app has its own entitlements. Certificate-only automatic import during Tauri bundling is not supported by this helper preparation step. Verify both signatures and inference behavior in the finished bundle.

## Design references

- [SQLite secure deletion and WAL checkpoints](https://www.sqlite.org/pragma.html), [FTS5 secure deletion](https://www.sqlite.org/fts5.html#the_secure_delete_configuration_option) and [external-content maintenance](https://www.sqlite.org/fts5.html#external_content_tables).
- [SQLite vulnerability status](https://www.sqlite.org/cves.html): native-library advisories matter beyond Rust dependency matching.
- [Tauri CSP](https://v2.tauri.app/security/csp/) and [core permissions](https://v2.tauri.app/reference/acl/core-permissions/).
- [ChatGPT preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations): account-plan requests have distinct API constraints.

## Prior dependency findings (audit dated 2026-09-30)

The prior audit recorded two RustSec warnings in the Tauri Linux/BSD GTK dependency tree. Preserve these findings until a fresh audit and dependency review establish their resolution:

- **glib 0.18.5 — [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html):** a string-variant iterator has undefined behavior that can cause an optimized build to crash. The fixed release is 0.20.0 or later. At that audit, Tauri 2.12, Tao 0.37, and Wry 0.57 required GTK 0.18, whose types are tied to the older GLib crate. Adding a newer direct dependency does not replace those transitive types. Our code does not directly call the affected iterator; reachability through the framework has not been proven absent. Linux/BSD release validation remains incomplete until a compatible upstream fix or a reviewed backport is adopted.
- **proc-macro-error 1.0.4 — [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html):** an unmaintained build-time dependency of GTK/GLib macros, with no patched release. Replacing it requires changes in the upstream macros. This is a maintenance finding, not evidence of an observed runtime exploit.

These dependencies are conditional on the GTK platform backend. Keep full-lockfile auditing enabled so changes to their status remain visible. A clean vulnerability count does not mean all informational or native-library risks are resolved.
