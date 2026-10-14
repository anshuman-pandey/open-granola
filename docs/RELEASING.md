# Build and validate a desktop preview

The first packaged validation target is **Apple Silicon, macOS 14.4 or later**. Other operating systems remain source-build targets until their installers have their own test records. A successful CI build does not establish microphone, model or call-capture compatibility.

## Download a candidate

The CI workflow builds a Mac preview after the frontend, all native platform jobs and Rust audit pass. On pull requests, main-branch pushes and manual workflow runs, its `macos-preview` job uploads an artifact named `open-granola-macos-arm64-preview-<commit>` for 14 days.

1. Open the relevant run under [Actions → CI](https://github.com/anshuman-pandey/open-granola/actions/workflows/ci.yml).
2. Download the artifact and extract it. GitHub may require sign-in to download workflow artifacts.
3. Read `BUILD.json` and `READ-ME.txt`; confirm the architecture and commit.
4. In the extracted folder, run `shasum -a 256 -c SHA256SUMS.txt`.
5. Open the DMG and copy **Open Granola.app** to Applications, or extract the included application ZIP.

Candidates are **ad-hoc signed and not notarized**. Signature verification proves bundle consistency, not a verified publisher identity. If macOS blocks opening it, use Apple's [documented per-app opening flow](https://support.apple.com/en-us/102445) only after deciding that you trust this source. Do not disable Gatekeeper globally.

The automated packaging check verifies the app signature, inclusion and ARM64 architecture of the inference helper, and required app/helper sandbox entitlements. It also generates SHA-256 checksums. The public release workflow continues to create draft prereleases on version tags; it does not publish them automatically.

## First setup

The installer contains the app and inference helper, **not the model files**.

1. Open **Settings → Models & connections**. Choose a summary provider and save it. Local providers avoid sending text to a cloud provider; their server configuration still matters.
2. In Settings, find **Model folder**. Open that exact directory in Finder using **Go → Go to Folder**; sandboxed builds may use a different path from development builds.
3. Obtain a compatible model from the [upstream Whisper model repository](https://huggingface.co/ggerganov/whisper.cpp), verify its publisher checksum and license, and copy it into that directory as `whisper-large-v3-turbo.bin`. A GGML-format Whisper model is required; a similarly named Transformers checkpoint is not interchangeable.
4. With LM Studio or Ollama, follow the corresponding [LM Studio](integrations/LM_STUDIO.md) or [Ollama](integrations/OLLAMA.md) guide. The built-in summarizer additionally requires `qwen3-4b-q4.gguf` from a trusted publisher. A renamed GGUF file alone does not prove compatible architecture or acceptable quality.
5. Refresh the model status and run **Test connection**, then perform a short synthetic recording and inspect the saved transcript and notes.

Model setup remains manual. RAM requirements, speed and note quality need measurements on the exact chosen models and machine; no minimum-memory claim is established by a successful build. The current recording path captures the microphone only, so remote voices through headphones are not recorded.

## Validation before a public release

Use a separate synthetic library. Follow [the provider validation record](integrations/VALIDATION.md) and record the build commit, macOS version, architecture, RAM, model identities and provider version.

Required evidence:

- A fresh installation, first launch, microphone permission and first correct saved meeting.
- Restart, keyword search, Markdown export and an Obsidian export opened in a real vault.
- An unavailable summary provider followed by a successful retry, with transcript and task state preserved.
- A long microphone session, stop/cancel behavior and device disconnect handling. A summary retry cannot recover an unsaved recording after an app crash.
- Upgrade with a synthetic library and subsequent uninstall/reinstall, with observed library behavior recorded.
- Screenshots and a short demonstration from this build using synthetic content.
- Independent first-run reports from 10–20 volunteers. Track reported time to first useful notes and repeat use voluntarily; add no telemetry.

Use the [first-run issue form](https://github.com/anshuman-pandey/open-granola/issues/new?template=first-run.yml) for results. Mark every unperformed check as not run. Installation and permission tests cannot be replaced by mocks or API-only requests.

## Developer ID distribution

For a publisher-verified Mac installer, the maintainer needs a **Developer ID Application** certificate with its private key, its export password, the signing identity, and an Apple notarization credential (App Store Connect API key or Apple ID app-specific password and team ID).

Configure credentials as repository Actions secrets; never commit or paste them into issues. Follow [Tauri's signing and notarization instructions](https://v2.tauri.app/distribute/sign/macos/). Import the signing identity before building so `scripts/prepare-inference.mjs` signs the helper using its own `app-sandbox` and `inherit` entitlements. The main app uses `src-tauri/entitlements.plist`. Then verify notarization and test on a different Mac before publishing the draft.

The ad-hoc preview job intentionally uses no signing secrets and has read-only repository permissions. A Developer ID release needs its own controlled signing environment; adding secrets alone does not change this preview job into a notarized build.
