# Development preview messaging

## Accurate product description

Open Granola is an Apache-2.0 desktop meeting notebook with local microphone transcription and a choice of text models for notes. It can use built-in local inference, LM Studio, OpenAI-compatible servers, OpenAI or Claude API keys, and an experimental official ChatGPT sign-in integration. Cloud routes send transcript text to the provider after the user enables them.

The browser preview demonstrates the workspace with labeled samples. Desktop recording requires a manually installed Whisper file. System audio, diarization, calendar integration and semantic search are not implemented. Real-account ChatGPT authorization and complete hardware/model workflows still need end-to-end validation.

The current useful demonstration is provider selection, a synthetic connection test, local transcript storage, visible processing details and recovery from a failed saved summary. The connection test does not establish that recording works, and summary retry does not recover an unsaved session after an app crash.

## Evidence needed before a release announcement

1. Start from the documented install steps on a named machine/OS.
2. Show the exact model files and selected provider, with data destination visible.
3. Record a short microphone session; inspect the transcript and generated notes.
4. Restart the app and verify persistence, search and Markdown export.
5. Make the summary provider unavailable, preserve the transcript, restore the provider and retry the saved meeting.
6. Test provider authentication with a real account and publish the routes that actually passed.
7. Validate signing, permissions, install, upgrade and uninstall for each advertised platform; publish the actual assets.

Do not present mocked transport tests, browser sample data or a successful build as a real meeting demonstration.

## Priorities that follow the research

The [research report](COMPETITIVE_RESEARCH.md) includes a star-ranked top ten, smaller direct alternatives and verified open issues. Provider choice is already common. The stronger direction is meeting results people can inspect and recover.

- **Next:** simpler model setup and tested packaging; real microphone and provider evaluation.
- **Then:** system audio and signal-health feedback on defined hardware; durable recovery for interrupted capture.
- **After that:** source-linked decisions/actions, name corrections, language controls and robust long-meeting processing.
- **Later:** selective text sharing and scoped agent access, with clear data boundaries.

These are proposals, not delivered features or guaranteed sources of GitHub stars.

## Language that stays accurate

Use descriptions such as “local transcription,” “optional cloud summaries,” “microphone-only preview,” and “transcript preserved when a saved summary fails.” Explain what has personally been tested, which model ran, and what remains unfinished.

Avoid claiming universal call capture, no network stack, zero retention, forensic erasure, encrypted notes, platform completeness, or a feature nobody else has. Cite current primary sources for any competitor comparison. AI-built code and organic stars are development context; neither demonstrates that the app works.

Keep [README.md](../README.md), [Privacy](../PRIVACY.md), [Security](../SECURITY.md) and the tested release behavior aligned.
