# Provider compatibility validation

Use this record for the [LM Studio](LM_STUDIO.md) and [Ollama](OLLAMA.md) guides. A documentation review, mock HTTP test, browser demo and real model run are different kinds of evidence. Report each separately.

## Current evidence

| Check | Status of these guides on 2026-10-10 |
|---|---|
| URLs, fields and limits compared with Open Granola source | Reviewed |
| Server setup compared with official provider documentation | Reviewed |
| Synthetic request run against a real LM Studio/Ollama model | Not run for these guides |
| Real microphone → Whisper → provider → saved notes | Not run for these guides |
| Hindi/Spanish transcription and note quality judged by fluent reviewers | Not evaluated |
| Signed-package install and provider access on each advertised OS | Not validated by these guides |

## Record the environment

Copy this block into a [provider compatibility report](https://github.com/anshuman-pandey/open-granola/issues/new?template=integration.yml), replacing the placeholders. Do not include keys, private hosts, meeting content, account identifiers or unreviewed logs.

```text
Date:
Open Granola commit/version:
OS, architecture, CPU/GPU and RAM:
Mode: desktop development / packaged desktop
Provider and server version:
Local-only server configuration:
API base URL (loopback only, or redact private host):
Exact model ID, quantization and context capacity:
Whisper model filename/version/source:
UI locale:
Transcription language choice:
Note output language choice:
Synthetic connection test: pass / fail / not run
Short recording + saved structured notes: pass / fail / not run
Restart + search + Markdown export: pass / fail / not run
Provider unavailable + saved-summary retry: pass / fail / not run
Language review: reviewer language(s), observed errors
Relevant sanitized error:
```

## A repeatable small test

Use a separate test library containing only synthetic data. Do not replace your normal library or test deletion against real notes.

1. Start from the chosen guide and record all versions. Run **Test connection**. A pass means nonempty text came back from a synthetic request; it does not test the note JSON schema.
2. With microphone permission and local Whisper installed, record 30–60 seconds. State the selected sample clearly, including a decision, an explicit assignment and an unresolved question. Add natural pauses. The app currently captures the microphone, not remote call audio.
3. Finish the session. Confirm that the transcript is saved, names/numbers are correct, and notes contain the stated decision and assignment without inventing an answer to the unresolved question. Inspect the processing details for provider/model and requested output language.
4. Restart Open Granola. Open the meeting, search for a distinctive phrase, and export Markdown. Check that Unicode text survives all three steps.
5. Stop only your local test provider. On a fresh synthetic meeting or summary retry, observe the visible summary failure and confirm the saved transcript remains. Restart the provider and retry the saved summary; verify it succeeds without duplicate actions or loss of completion state.
6. Repeat using each language you intend to advertise. For automatic speech detection, include a separate mixed-language sample and report what happened. Do not infer code-switching quality from a monolingual success.

### Synthetic content

These short passages are original test material. They contain fictional names and no actual meeting data. The dates are fixed content, not real deadlines.

**English**

> This is a test meeting. We chose the blue cover for the guide. Asha will send the draft on 15 October 2026. We have not decided the printing budget.

**हिन्दी**

> यह एक परीक्षण बैठक है। हमने गाइड के लिए नीला कवर चुना है। आशा 15 अक्टूबर 2026 को मसौदा भेजेंगी। छपाई का बजट अभी तय नहीं हुआ है।

**Español**

> Esta es una reunión de prueba. Elegimos la portada azul para la guía. Asha enviará el borrador el 15 de octubre de 2026. Todavía no hemos decidido el presupuesto de impresión.

For cross-language output, keep the source transcript and choose a different summary language. Verify that prose changes language while names, dates, source quotations and the unresolved status remain faithful. A model accepting a language instruction does not establish that it follows it reliably.

## What to contribute after testing

Submit one record per reproducible provider/model/OS combination. Include a redacted screenshot of the settings and generated synthetic note, exact steps for failures, and any independent `curl` result. Label a `curl` success as an API test, not an app test. Do not include private recordings or claim broad compatibility based on one machine.
