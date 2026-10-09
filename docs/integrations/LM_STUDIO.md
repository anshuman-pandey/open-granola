# Use LM Studio for meeting notes

This guide connects the Open Granola **desktop app** to a model served on the same computer. Speech still uses local Whisper. LM Studio handles text summaries, questions and recipes; it does not replace microphone transcription.

**Validation status, 2026-10-10:** checked against Open Granola's provider code and the upstream documentation below. No live LM Studio model or complete recording workflow was tested while writing this guide. Use the [validation record](VALIDATION.md) to report a tested combination.

## 1. Prepare the local model

Install LM Studio, download a model compatible with your hardware, and load it. In LM Studio's **Developer** tab, start its API server. The CLI alternative is `lms server start`. Keep serving on the local computer for this setup; network sharing is unnecessary. See the [official server guide](https://lmstudio.ai/docs/developer/core/server).

Find the exact model identifier in LM Studio. Its OpenAI-compatible model list is also available at:

```sh
curl --fail-with-body http://127.0.0.1:1234/v1/models
```

Use the returned `data[].id`, not a guessed filename. Port `1234` is the documented example; if you changed the server port, use that value in Open Granola too. The API includes `/v1/models` and `/v1/chat/completions`. [LM Studio compatibility documentation](https://lmstudio.ai/docs/developer/openai-compat)

If authentication is enabled, the model-list request also needs your token. LM Studio 0.4.0 and newer support API tokens; authentication is optional by default. Create a token under the server's authentication settings and enter it in Open Granola's API-key field. Never paste a real token into an issue or screenshot. [LM Studio authentication](https://lmstudio.ai/docs/developer/core/authentication)

## 2. Configure Open Granola

Open **Settings → Models & connections** in the desktop app. These are the English control names; translated labels may differ.

| Field | Value |
|---|---|
| Provider | **LM Studio** |
| API base URL | `http://127.0.0.1:1234/v1` |
| Model ID | The exact ID served by your LM Studio instance |
| API key | Leave empty for an unauthenticated server; otherwise use its token |
| Allow off-device text | Not needed for this loopback endpoint |

Select **Save model settings**, then **Test connection**. The test sends a short synthetic greeting, not a meeting. A successful response confirms a small text request only. It does not verify the model's structured notes, language quality, available context window or recording.

Do not append `/chat/completions` to the base URL: Open Granola adds that path. Use `127.0.0.1` rather than `localhost`. The dedicated LM Studio route accepts only literal loopback HTTP addresses; use the custom-provider route with HTTPS and explicit off-device consent for another computer.

If you previously saved a token, leaving the field empty preserves it. Use the app's key-removal control to clear it. The credential-storage indicator distinguishes the OS credential store from session-only memory.

## 3. Verify a short meeting

Install the Whisper file documented in the [README](../../README.md#install-local-models). The built-in Qwen file is unnecessary for this route. Record a short synthetic conversation, finish it, and inspect both the saved transcript and notes. Use the [shared validation steps](VALIDATION.md), including summary failure and retry. Do not use private meeting content for compatibility reports.

## Troubleshooting and limits

| Symptom | Check |
|---|---|
| Cannot connect | Server running; correct port; API URL ends in `/v1`; both apps run on the same host. A VM/container has its own loopback address. |
| Credentials rejected | LM Studio authentication setting and the saved token. |
| Endpoint or model not found | Exact served model ID and base URL; do not use `/api/v1` for this integration. |
| Connection passes but summary fails | The selected model must produce the JSON note structure requested by Open Granola. The connection test does not check that structure. |
| Timeout or incomplete text | Preload the model; try a shorter synthetic meeting or a model that fits available memory. Configure context capacity in LM Studio. |

Open Granola sends non-streaming `model`, `messages` with system/user text, and `max_tokens` to `/chat/completions`. It expects usable `choices[0].message.content`; an explicit finish reason other than `stop` fails. It does not send tool calls, audio, images, a JSON-schema constraint or model-loading commands. Native transport has a 10-second connection timeout, 120-second request timeout, 1 MiB prompt-text limit and 2 MiB response limit. Redirects and automatic proxy discovery are disabled. These limits come from [providers.rs](../../src-tauri/src/providers.rs), not from an LM Studio guarantee.

The destination is local, but Open Granola cannot prove how a separately configured server processes or forwards requests. The app has native networking and is not an OS-enforced air gap. Notes are not encrypted by the app. Local deletion does not erase another program's logs, exported files or backups. See [Privacy](../../PRIVACY.md).

Implementation references: [provider defaults and validation](../../src/lib/provider-types.ts), [native transport](../../src-tauri/src/providers.rs), [note prompts](../../src-tauri/src/llm.rs).
