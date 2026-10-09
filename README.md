<p align="center">
  <img src="docs/assets/logo.svg" width="72" alt="Open Granola logo" />
</p>

<h1 align="center">Open Granola</h1>

<p align="center">
  <strong>Local transcripts. Your choice of AI for meeting notes.</strong><br/>
  An Apache-2.0 desktop meeting notebook built with Tauri, React and Rust.
</p>

<p align="center">
  <a href="#try-the-preview">Try the preview</a> ·
  <a href="#models-and-connections">Models</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="PRIVACY.md">Privacy</a> ·
  <a href="docs/COMPETITIVE_RESEARCH.md">Research and priorities</a>
</p>

<p align="center">
  English · <a href="docs/i18n/README.hi.md">हिन्दी</a> · <a href="docs/i18n/README.es.md">Español</a> · <a href="docs/I18N.md">Language support</a>
</p>

**Development preview.** Open Granola records your microphone, transcribes with local Whisper, and turns the transcript into notes using a local model or a provider you connect. Your library stays in a local SQLite database. Cloud summaries send transcript text to the selected provider.

System-audio capture is not implemented: this build does not record the remote side of a call through headphones. Real microphone/model sessions, provider accounts and packaged releases still need end-to-end testing on the intended hardware. The browser preview uses labeled sample meetings.

## What is implemented

- **Microphone transcription:** local `whisper.cpp`, timestamped transcript segments and a visible live transcript.
- **Summary provider selection:** built-in Qwen, LM Studio, OpenAI API, Claude API, custom OpenAI-compatible endpoints and experimental Sign in with ChatGPT.
- **Connection test:** a synthetic text request checks the selected summarizer without sending a meeting. It does not test microphone capture or Whisper.
- **Recovery for saved meetings:** the transcript is saved before summarization. A failed summary can be retried without recording again. Existing action IDs and completion state are preserved when notes are regenerated.
- **Processing details:** saved meetings record the configured model/provider route and summary status so later settings changes do not obscure how the note was generated.
- **Local library:** keyword search, questions over retrieved text, actions, commitments, Markdown recipes, JSON import and Markdown export.
- **Retention controls:** remove expired meetings or purge the local library. See the limits in [Privacy](PRIVACY.md).

Generated notes and commitments need review. Speaker identification, semantic/vector search, calendar integration, direct imports from named meeting services, encrypted audio playback and native system-audio capture are not implemented.

## Models and connections

Transcription and summarization perform different jobs. **Local Whisper is currently required for recording with every summary provider.** This release does not provide a cloud transcription API.

| Summary route | Setup | What Open Granola sends |
|---|---|---|
| Built-in local Qwen | Install `qwen3-4b-q4.gguf` | No provider request |
| LM Studio | Start its OpenAI-compatible server; use `http://127.0.0.1:1234/v1` and the loaded model ID | Text to a server on this device |
| OpenAI API | Your API key and supported model ID | Text to OpenAI; API billing applies |
| Claude API | Your Anthropic API key and model ID | Text to Anthropic; API billing applies |
| OpenAI-compatible | A compatible base URL, model ID and optional key; for example a local Ollama server | Text to the configured server |
| ChatGPT plan — experimental | **Continue with ChatGPT**, authorize eligible plan usage, then select a model | Text to OpenAI using the authorized plan |

The ChatGPT route uses the [official sign-in flow for open-source/local apps](https://developers.openai.com/siwc/token-sharing-open-source). It does not grant access to your existing ChatGPT conversations. Eligibility and model availability depend on the account and provider. This integration has not yet been verified end to end with a real account. It supports text requests here; [the preview does not support audio transcription](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

Claude is connected with an API key; this app has no Claude consumer-account login. OpenAI API keys and ChatGPT plan sign-in are separate routes.

### Connect a summarizer

Setup guides: [LM Studio](docs/integrations/LM_STUDIO.md) · [Ollama](docs/integrations/OLLAMA.md).

1. Open **Settings → Models & connections** in the desktop app.
2. Choose a provider and enter its exact model ID. For a custom server, enter the API base URL it documents.
3. For ChatGPT, connect your account and use **Load available models**, or enter a model ID supported by your account. For an off-device destination, enable the setting that permits sending text to it. This also covers relevant saved notes used by the assistant and recipes.
4. Save the settings, then run **Test connection**.
5. Record a short microphone session and verify its transcript and notes before using a longer session.

Remote endpoints require HTTPS; unencrypted HTTP is accepted only for literal loopback addresses such as `127.0.0.1`. Use the literal address shown above for LM Studio. Custom compatibility must be tested: an OpenAI-compatible label does not guarantee every endpoint supports the same request fields. There is no automatic switch from local to cloud processing when a model fails.

Keys are handled in native code and stored in the OS credential store when available. If that store cannot save them, the app uses session-only memory and shows that status. Credentials are not saved in the meeting database or browser storage. A server running locally may itself forward requests; its configuration determines what happens after Open Granola sends it text.

## Try the preview

### Browser workspace

```sh
git clone https://github.com/anshuman-pandey/open-granola.git
cd open-granola
npm ci
npm run dev
```

The browser workspace demonstrates sample meetings. It does not record audio, run native inference or save provider credentials.

### Desktop development build

Install Rust **1.98 or later**, Node **22.12 or later** (Node 24 LTS recommended), CMake, libclang, a C/C++ compiler and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). Linux also needs the ALSA, WebKitGTK and configured PipeWire development dependencies. The macOS bundle targets macOS 14.4 or later. Platform build configuration is not a claim of completed hardware QA.

```sh
npm ci
npm run tauri dev
```

The Tauri hooks build the local inference helper before starting the app. For a release bundle:

```sh
npm run tauri build
```

Build output is under `src-tauri/target/release/bundle`. Signing, notarization and install/upgrade testing are separate release work. Publish verified assets under [Releases](https://github.com/anshuman-pandey/open-granola/releases) when ready; this README does not promise a prebuilt installer.

### Install local models

Settings shows the actual model directory: `<app-data>/library/models/`.

- Install a compatible Whisper model as **`whisper-large-v3-turbo.bin`** to record audio.
- Install a compatible GGUF model as **`qwen3-4b-q4.gguf`** only if using the built-in summarizer.
- For LM Studio or a cloud summarizer, Whisper is still required, but the built-in Qwen file is not.

Model installation is manual. The app does not download, resume downloads or verify publisher checksums for you. Obtain models from a trusted publisher and check their format and license. Missing or invalid files produce setup errors.

## How a meeting is processed

```text
Microphone → local Whisper → saved local transcript
                                  ↓
                    selected local/server/cloud model
                                  ↓
                         notes, actions, commitments
```

Notes, transcripts and processing details are stored locally without app-level database encryption. If summarization fails after the transcript is committed, retry the saved meeting. A crash while capture is still in memory is not recoverable by that feature. Audio is held in RAM rather than intentionally written to a recording file.

## Privacy in plain terms

- Local models are the default. Off-device text processing requires provider configuration and consent.
- Native networking is enabled for providers and ChatGPT sign-in. This build is **not an OS-enforced network air gap**.
- The webview is restricted to bundled assets and local app IPC. Provider requests run in native code.
- The app implements no telemetry or Open Granola cloud-sync service. Connected providers have their own data policies.
- Deleting local records does not erase provider-held data, exported files, OS snapshots or backups.

Read [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) for storage, credential, network and deletion details.

## Next priorities

The [competitive review](docs/COMPETITIVE_RESEARCH.md) examined ten large related repositories plus seven closer/adjacent products. The priorities follow recurring user problems, rather than the number of features in a competitor's README:

1. Verify a complete fresh-install microphone workflow with real models and provider accounts; improve model setup and packaging.
2. Implement and test system audio, device changes, signal freshness and long recordings on a defined platform matrix.
3. Link decisions and actions to transcript passages, with review before treating an AI inference as a confirmed commitment.
4. Add vocabulary corrections, explicit language selection and recoverable long-meeting processing.
5. Explore selective text sharing and scoped agent access after the core record is dependable.

These are planned capabilities. Research and automated tests do not establish that the app works for your meeting setup.

## Development checks

```sh
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
```

Native tests require the platform build prerequisites. Review the [architecture](docs/ARCHITECTURE.md), [security policy](SECURITY.md) and [contribution guide](CONTRIBUTING.md) before changing capture, credentials or data handling.

## License

[Apache-2.0](LICENSE). Model files and third-party providers have their own licenses and terms.
