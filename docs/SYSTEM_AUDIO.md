# Experimental macOS system-audio capture

macOS 14.4+ builds implement an optional microphone + system-audio recording path. Windows and Linux remain microphone-only. This is implemented code, not a claim of validated calls or a production-ready release.

## Use and privacy

1. Install/configure the local Whisper model as described in the README.
2. Start a recording. Leave the box unchecked for microphone-only capture, or explicitly select **Microphone + system audio**.
3. With the combined mode, grant microphone and system-audio recording permission when macOS requests it. If denied, review **System Settings → Privacy & Security → Screen & System Audio Recording** (wording varies by OS), then retry; relaunch may be necessary.
4. Use headphones and obtain participants' consent. The tap includes other apps' audio, including notifications/media, not just the call. Do not treat it as an app-specific filter.
5. On a device/route change or callback failure, stop to save the recovered transcript, then start a new recording. An error never silently selects microphone-only mode.

The checkbox is reset for each recording and is not a persistent preference. Raw audio remains in bounded RAM buffers, is resampled locally and is not saved as an audio file. Summary-provider settings and their existing remote-text disclosure remain applicable. Combined speech is one mixed source: no speaker diarization or remote-person attribution is claimed. Use headphones to avoid acoustically recording the same remote speech twice through speakers and the microphone.

## Implementation

An Objective-C Core Audio bridge creates a private, unmuted mono process tap excluding this app's audio process. A private aggregate contains the selected default microphone and that tap; the microphone anchors the clock and Core Audio handles drift compensation. CPAL opens this exact named aggregate, downmixes its channels, and enqueues into the existing bounded ring buffer. FFT resampling and Whisper run outside the real-time callback. There is no virtual driver installation, screen video capture or recording helper executable.

Startup unwinds partial native resources on failure. The stream is dropped before the aggregate and tap. Default input/output route changes, aggregate loss and tap format changes terminate the capture. A five-second callback watchdog distinguishes absent callbacks from legitimate silent buffers; **it cannot prove that silent system-audio channels contain the expected remote signal**. Silent/permission-denied tap behavior and long-session drift therefore remain explicit hardware gates. Input overrun also stops capture visibly and preserves the transcribed portion for saving.

The app's minimum macOS deployment target is 14.4. The bridge is conditionally compiled; unsupported platforms reject an IPC request for system audio instead of substituting another source. `NSAudioCaptureUsageDescription` describes the privacy scope in the bundle.

Primary API reference: [Apple: Capturing system audio with Core Audio taps](https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps).

## Validation and remaining gates

Code/API checks cover the native bridge build, injected HAL startup failures at seven stages, private/unmuted configuration, self-process exclusion, route-change detection and ordered cleanup. Rust tests cover resampling/tail preservation and callback freshness; frontend tests cover explicit opt-in, capability failure, backend propagation and no microphone fallback. The mocked native test never creates a real tap/device or captures audio.

```sh
clang -mmacosx-version-min=14.4 -fobjc-arc -Wall -Wextra -Werror src-tauri/native/system_audio_test.m -framework Foundation -framework CoreAudio -o /tmp/og-system-audio-test
/tmp/og-system-audio-test
npm run check
cargo test --manifest-path src-tauri/Cargo.toml --locked --workspace
```

Not performed: desktop launch/install, permission grant/denial through TCC, actual system/microphone recording, remote calls through headphones, device disconnect/reconnect, GUI recovery, long-session synchronization, real-model transcription accuracy or protected-media behavior. A build/mock pass does not close these gates. Before a release claim, validate those paths on the exact packaged build and record OS, audio routes, models and outcomes with synthetic/non-sensitive audio. Do not remove the experimental label based only on CI.
