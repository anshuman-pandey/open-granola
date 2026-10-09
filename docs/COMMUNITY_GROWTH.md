# Community contributions and discoverability

Research date: **2026-10-10**. These are proposed contributions and unsent drafts. No upstream issue, pull request, discussion or promotional message has been submitted as part of this work. This plan supplements [LAUNCH_KIT.md](LAUNCH_KIT.md) and the [competitive research](COMPETITIVE_RESEARCH.md); their evidence requirements still apply.

The useful offer is a reproducible local-model integration, clearer language support and fixes that help users of the dependencies. Measure successful setup and maintained contributions. Stars are voluntary; this plan makes no star-growth guarantee.

## Assets prepared in this repository

- Complete [Hindi](i18n/README.hi.md) and [Spanish](i18n/README.es.md) README translations, plus [Hindi](i18n/CONTRIBUTING.hi.md) and [Spanish](i18n/CONTRIBUTING.es.md) contribution guides.
- [Language coverage and maintenance contract](I18N.md), with UI language kept separate from speech and note language.
- [LM Studio setup](integrations/LM_STUDIO.md), [Ollama setup](integrations/OLLAMA.md) and a shared [synthetic validation record](integrations/VALIDATION.md).
- Focused [translation](../.github/ISSUE_TEMPLATE/translation.yml) and [provider compatibility](../.github/ISSUE_TEMPLATE/integration.yml) issue forms.

Release readiness also includes the [development dependency audit](SECURITY_TOOLING.md), which records the remaining CI blocker.

The guides are checked against code and primary documentation. They are not published evidence of live-model compatibility. Complete the validation record before describing a route as tested.

## Verified targets and useful contributions

### 1. LM Studio documentation: a tested integration recipe

**Target:** [lmstudio-ai/docs](https://github.com/lmstudio-ai/docs), specifically its [4_integrations directory](https://github.com/lmstudio-ai/docs/tree/main/4_integrations).

**Proposed artifact:** a compact Open Granola integration page derived from our LM Studio guide: exact model ID/base URL, optional authentication, a synthetic connection test, real recording prerequisites and a troubleshooting table. The value is an independently reproducible text-client setup, not a request for a product endorsement.

**Contribution rules checked:** the repository's [README](https://github.com/lmstudio-ai/docs/blob/main/README.md) describes article frontmatter (`title`, `description`, `index`) and file placement. Its [CONTRIBUTING.md](https://github.com/lmstudio-ai/docs/blob/main/CONTRIBUTING.md) was empty when checked; it does not establish an acceptance guarantee. Confirm the appropriate article format and scope with maintainers before a substantial new page. Search existing issues and integration pages first.

**Entry criteria:** a completed LM Studio validation record; exact server/model/OS versions; screenshots using only synthetic content; one maintainer willing to keep the instructions current. The guide should disclose microphone-only capture, manual Whisper installation and JSON-output requirements.

**Success measure:** another person completes setup from the guide without private assistance; maintainer feedback is resolved; a focused documentation contribution is accepted or yields a concrete correction we apply locally.

**Unsent draft — documentation scope discussion:**

> I maintain Open Granola, a Tauri meeting-notes development preview. We prepared a source-checked guide for using LM Studio's local Chat Completions server, including literal loopback URLs, optional tokens and synthetic connection testing. It is not yet a live-model compatibility claim. Would a short integration recipe be useful once we attach a reproducible server/model/OS test record? Our candidate guide is `docs/integrations/LM_STUDIO.md`; we can adapt it to your preferred location and keep it maintained.

### 2. Ollama: compatibility evidence and a small documentation fix

**Target:** [ollama/ollama](https://github.com/ollama/ollama). Start with the current [OpenAI compatibility documentation](https://docs.ollama.com/api/openai-compatibility) and existing issues.

**Proposed artifact:** a sanitized, minimal non-streaming Chat Completions request plus a tested result covering `message.content`, `finish_reason` and model context limits. If a real mismatch exists, propose a narrowly scoped compatibility regression test or documentation correction. Keep the app-specific installation guide in this repository unless upstream requests it.

**Contribution rules checked:** Ollama asks for discussion before nontrivial pull requests, behavior-focused tests and sparing dependencies. Small documentation corrections are welcome; large additions and API-breaking changes carry higher review cost. Its required commit-title style is `<package>: <short description>`. Follow the [contribution guide](https://github.com/ollama/ollama/blob/main/CONTRIBUTING.md), including private reporting for security issues.

**Entry criteria:** reproduce the problem independently of Open Granola using synthetic text; record versions and the exact local model; rule out a wrong URL, a cloud-backed model or insufficient context. No issue should be opened just to announce the app.

**Success measure:** a confirmed compatibility defect fixed, a confusing instruction corrected, or a tested model configuration documented for another user.

**Unsent draft — use only after a real reproduction exists:**

> A synthetic non-streaming request to `/v1/chat/completions` on [Ollama version, OS, model] produces [observed result], while [linked documented behavior] led us to expect [specific result]. The issue also reproduces with the attached minimal curl request, outside Open Granola. No meeting data or credentials are included. We checked [existing issue links]. Would a focused regression test or documentation clarification be the appropriate contribution?

Replace every bracketed field with evidence. If the behavior is already documented or correct, fix our integration instead.

### 3. whisper.cpp: human-led language evaluation

**Target:** [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp).

**Proposed artifact:** a human-authored reproduction for a demonstrated auto-detection versus explicit-language defect, using a consented/licensed synthetic audio clip, exact model hash and decoder settings. First compare Open Granola with the upstream CLI; an app-specific bug stays in Open Granola.

**Rules and current gate:** [CONTRIBUTING.md](https://github.com/ggml-org/whisper.cpp/blob/master/CONTRIBUTING.md) rejects predominantly AI-generated pull requests and AI-written posts, including issues and discussions. It also requests local CI, one focused change, prior discussion for complex changes and no trivial new-contributor fixes. See its [AGENTS.md](https://github.com/ggml-org/whisper.cpp/blob/master/AGENTS.md) for details. **This AI-authored plan is not an upstream submission draft. A human must independently author any communication or contribution in accordance with those rules.**

**Entry criteria:** fluent human review of the audio/reference text, reproducible upstream failure, duplicate search and willingness to explain the decoder behavior. No allegation of an upstream bug is established by our language allowlist or mock tests.

**Evidence checklist for the human contributor:** upstream commit, model identity, CPU/GPU backend, command line, explicit language versus auto, audio license/consent, expected and actual transcript, smallest reproduction and manual test results.

**Success measure:** an independently confirmed decoder issue or useful language evaluation, followed by a supported fix or clear limitation in our docs. No AI-written outreach draft is provided for this target.

### 4. whisper-rs: respect the maintained location

**Target:** [Codeberg: tazz4843/whisper-rs](https://codeberg.org/tazz4843/whisper-rs). The [old GitHub README](https://github.com/tazz4843/whisper-rs) states that new issues and pull requests belong on Codeberg and explains the maintainer's opposition to generative AI. The Codeberg site could not be read by the research tool because of robots restrictions, so its current contribution rules were not independently verified.

**Proposed artifact:** only after human review of current rules, a minimal Rust reproduction for a binding-specific issue with language selection, model capability detection or callback behavior. Use the [published FullParams API](https://docs.rs/whisper-rs/latest/whisper_rs/struct.FullParams.html) to distinguish binding use from a decoder defect.

**Entry criteria:** human verification of the live Codeberg policy; an issue that persists outside Open Granola but does not reproduce through the C++ API; exact crate and native dependency versions. Do not submit AI-authored promotional material or use the old GitHub tracker.

**Success measure:** a confirmed binding fix or a useful, policy-compliant clarification. This remains a human-led target; no AI-written outreach draft is provided.

### 5. Tauri: an engineering resource, not an app-list submission

**Target checked:** [tauri-apps/awesome-tauri contribution rules](https://github.com/tauri-apps/awesome-tauri/blob/dev/.github/contributing.md). **The official list no longer accepts application submissions.** Open Granola should not be submitted as an app, nor relabeled as a plugin to evade that rule.

**Useful future artifact:** a standalone English tutorial demonstrating how to keep Whisper and llama.cpp in separate processes when their GGML symbols conflict, with a minimal Tauri 2 example, bounded private IPC and measured packaging results. Our current [architecture](ARCHITECTURE.md) can inform it, but a general tutorial is not prepared or validated by this task.

For a future eligible resource, the list requires one suggestion per PR, alphabetical placement, a description under 24 words and signed commits. Plugins/integrations must support Tauri 2+, accept contributions, be maintained, have English documentation and be at least 30 days old. These conditions do not make an application eligible.

**Entry criteria:** an independently useful tutorial and reproducible sample, real platform validation, confirmation that the resource fits a current category, and no duplicate entry. Our existing macOS helper packaging needs its limitations explained rather than advertised as universal.

**Success measure:** readers reproduce the architecture and avoid a concrete native-build failure. Listing acceptance is secondary and unguaranteed. No app-showcase request is prepared.

## Execution order

1. **Repository readiness:** review the Hindi/Spanish terminology with fluent readers; validate links and language coverage; collect translation issues through the focused form.
2. **Provider evidence:** obtain one real LM Studio and one real local Ollama validation record, including failure recovery. Keep untested cells marked untested.
3. **Useful upstream work:** select one demonstrated problem or maintainable guide. Recheck current policies, then have the maintainer review the concrete artifact and any permitted draft before an external submission.
4. **Public demonstration:** use the existing launch kit's evidence checklist. Show the exact machine, provider/model, sample input, data destination and limitations. Link the language-specific README and reproducible setup guide.
5. **Follow-through:** answer reproduction questions, fix unclear instructions and maintain accepted artifacts. Do not duplicate the same promotional message across issue trackers.

## Review measures

Track these for each release or four-week review; no hidden app telemetry is needed:

**Repository baseline, 2026-10-10:** 12 stars, 1 fork and 14 open issues. This is a point-in-time snapshot, not a count of active users, successful installations or confirmed defects. Record the date with future comparisons rather than treating the figures as live counters.

| Measure | Evidence |
|---|---|
| Independent successful setup | Completed provider record from someone other than the guide author |
| Language quality | Fluent reviews and resolved wording/layout issues; distinguish untranslated UI from model-quality defects |
| Time to useful notes | Optional tester-reported time from documented setup to a correct synthetic saved note |
| Recovery quality | Reproduced failed-summary retry without lost transcript or duplicate actions |
| Upstream value | Accepted focused changes, confirmed defects and useful maintainer feedback |
| Discoverability | Voluntary referrals, relevant issues and repeat contributors; stars may be observed but are not a target promise |

For the next four-week review, aim for two independent provider setup records (one LM Studio, one local Ollama), one fluent review of each Hindi and Spanish repository translation, and a triage decision on each of the 14 baseline open issues. Count a test only when its evidence is available; mark blocked or untested work explicitly. A useful upstream artifact should be proposed only when its entry criteria are met. These are work targets, not forecasts of adoption or maintainer acceptance.

Use public contribution history and optional tester reports to measure this work. Record counts and sanitized outcomes, not contributor profiles, private meeting content or identifiers. Do not add tracking pixels, hidden analytics or mandatory telemetry to measure growth.

Recheck every external contribution rule immediately before submission. A local plan or draft is not authorization to post on a maintainer's behalf.
