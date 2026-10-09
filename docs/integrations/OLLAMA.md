# Use a local Ollama model for meeting notes

Open Granola connects to Ollama through **Custom OpenAI-compatible server**. There is no separate Ollama provider type. The desktop app transcribes your microphone with local Whisper and sends text to Ollama for notes, questions and recipes.

**Validation status, 2026-10-10:** checked against the current provider implementation and official Ollama documentation. No live Ollama model or microphone-to-summary workflow was tested for this guide. Compatibility remains specific to a server version and model; record results in the [validation record](VALIDATION.md).

## 1. Run a local model

Install Ollama using its [official quick start](https://docs.ollama.com/quickstart). Choose a locally downloaded model that fits your hardware and can follow structured-output instructions. Verify the exact model tag with:

```sh
ollama list
```

Start the Ollama application or, if a server is not already running, run `ollama serve`. Do not start a second instance on the same port.

Ollama normally listens on `127.0.0.1:11434`. Keep that loopback binding; this guide does not require LAN exposure or permissive browser CORS settings. If local-only processing is required, disable Ollama Cloud with `OLLAMA_NO_CLOUD=1` in the environment of the actual Ollama server, or set `disable_ollama_cloud` in its server configuration, then restart it. Follow the OS-specific configuration instructions in the [Ollama FAQ](https://docs.ollama.com/faq).

A local Ollama address alone does not guarantee local inference: Ollama can serve cloud models through its local server. Select a downloaded local model and verify cloud features are disabled when that boundary matters. Open Granola identifies the immediate endpoint; it cannot detect that server's onward requests.

## 2. Configure Open Granola

In the desktop app, open **Settings → Models & connections**. These are the English control names.

| Field | Value |
|---|---|
| Provider | **Custom OpenAI-compatible server** |
| API base URL | `http://127.0.0.1:11434/v1` |
| Model ID | The exact local tag shown by `ollama list` |
| API key | Empty for the standard local Ollama server |
| Allow off-device text | Not needed for this loopback endpoint |

The custom provider initially defaults to port **1234**, so replace it with Ollama's **11434**. Use `/v1`, not `/api`, and do not append `/chat/completions`. Save the settings, then run **Test connection**. A successful synthetic greeting is not a structured-summary or transcription test.

Ollama implements a subset of the OpenAI API and supports local `/v1/chat/completions`. Its examples use a placeholder key because their SDK requires one; the local server ignores that key. Open Granola does not require a placeholder. [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)

An empty key field preserves any previously saved credential for this provider/address. Clear that saved key using the app's key-removal control if it is no longer needed.

## 3. Check the same API independently

Replace `YOUR_LOCAL_MODEL_TAG` with the exact tag from your server. This request contains only synthetic text:

```sh
curl --fail-with-body http://127.0.0.1:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "YOUR_LOCAL_MODEL_TAG",
    "messages": [
      {"role": "system", "content": "Reply with a short greeting."},
      {"role": "user", "content": "Hello from a synthetic Open Granola test."}
    ],
    "max_tokens": 128,
    "stream": false
  }'
```

Open Granola expects nonempty `choices[0].message.content`. An explicit `finish_reason` other than `stop` is rejected. A reasoning-only response or output truncated by the token budget can fail even though the model is installed. This example exercises transport; it does not certify a model for meeting notes.

## 4. Verify recording and recovery

Install local Whisper as described in the [README](../../README.md#install-local-models); the built-in Qwen file is not required. Use the [validation steps](VALIDATION.md) to record a short synthetic meeting, review the notes, restart the app and test summary retry. Evaluate each requested output language with someone who reads it fluently.

## Troubleshooting and limits

| Symptom | Check |
|---|---|
| Connection refused | Ollama server running on the same host; port `11434`; VM/container boundaries. |
| 404/model not found | The base URL ends in `/v1`; the model tag exactly matches an installed model. |
| Small test succeeds, summary fails | Model follows the requested JSON structure and has enough context; inspect only synthetic material when debugging. |
| Slow response or timeout | Load the model before testing; reduce sample length or choose a model fitting the available memory. |
| Notes miss earlier content | Check model/server context capacity; a transport success does not prove the whole transcript fit. |

Open Granola uses non-streaming Chat Completions with `model`, system/user `messages` and `max_tokens`. It does not send Ollama-native `options`, `num_ctx`, `keep_alive`, tool definitions or audio. Configure context capacity in Ollama. The native client enforces a 10-second connection timeout, 120-second request timeout, 1 MiB prompt-text limit and 2 MiB response limit; redirects and proxy discovery are disabled. [Implementation](../../src-tauri/src/providers.rs)

Remote custom endpoints require HTTPS and explicit off-device-text consent. Do not disable those checks or expose an unauthenticated Ollama server to make a local configuration work. Open Granola's library is local and not encrypted at app level; purging it does not erase server-held data, exports or backups. [Privacy](../../PRIVACY.md)
