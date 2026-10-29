# Adoption work and submission evidence

Updated **2026-10-12**. This record supplements the existing roadmap without changing its wording or checkbox state. It records observed readiness, not a promise of stars or a completed release.

## Repository changes

- Obsidian-compatible note export with stable YAML properties, current task states, Unicode content, processing history and the source transcript. A real Obsidian installation still needs a compatibility record.
- Tailwind 4 build migration removing the vulnerable Tailwind 3 glob chain. Full npm audit reports zero vulnerabilities on the review date; the security gate remains enabled.
- Automated Apple Silicon preview packaging, helper-signature/entitlement checks, checksums and build metadata. Candidates are ad-hoc signed and not notarized. Read [RELEASING.md](RELEASING.md).
- A first-run issue form and an independent tester checklist. No telemetry is added.

## Evidence still required

| Check | Current status | What closes it |
|---|---|---|
| Fresh-install recording | Not independently validated | Synthetic microphone → Whisper → correct saved notes, with exact build and model identities |
| Remote call participants | Not implemented | Platform-specific system audio, permissions and call/headphone tests |
| Automatic model setup | Not implemented | Trusted sources, verified downloads/imports and failure handling; current setup is manual |
| Interrupted live capture | Not recoverable after a crash | Durable checkpoints and crash/restart validation; saved-summary retry is already implemented |
| Publisher-verified Mac release | No signing secrets configured at review | Developer ID signing, helper inheritance, notarization and another-Mac install test |
| Obsidian compatibility | Automated file/export tests pass; actual app not tested | Open the exported synthetic note in a named Obsidian version and review properties/tasks/transcript |
| Independent use | No records collected by this work | 10–20 volunteer first-run reports, then optional repeat-use feedback |

## Relevant discovery targets

Owner approval in the project conversation covers pursuing the named listings when their evidence requirements are met. No external submission is recorded yet. Recheck each upstream's current rules and existing entries immediately before submitting.

| Target | Verified route | Submission gate |
|---|---|---|
| [Ollama Productivity & Apps](https://github.com/ollama/ollama#productivity--apps) | Community integrations invite a project PR | Complete an actual local Ollama/model test, including app summary parsing and saved-summary retry; attach a sanitized record |
| [OpenAlternative: Granola](https://openalternative.co/alternatives/granola) | “Add it” routes to a signed-in submission | A usable tested candidate, exact limitations, maintainer account access and verification of submission terms/cost |
| [awesome-local-ai](https://github.com/pedramnj/awesome-local-ai/blob/main/CONTRIBUTING.md) | One small project-entry PR | Demonstrated local operation, maintained repo, under-one-hour installation and a concrete distinction from existing entries |
| [awesome-whisper](https://github.com/sindresorhus/awesome-whisper/blob/main/contributing.md) | Contribution rules | At least 100 GitHub stars, a ready usable app, and confirmation that submissions are currently open |
| [awesome-tauri](https://github.com/tauri-apps/awesome-tauri/blob/dev/.github/contributing.md) | Application submissions closed | Skip this target for the desktop app |

Neutral entry draft, to adapt only to an eligible category and its format:

> [Open Granola](https://github.com/anshuman-pandey/open-granola) — Desktop meeting notebook with local Whisper microphone transcription, local or connected summaries, saved-summary recovery and Obsidian-compatible Markdown export.

### Ollama PR draft — submit after validation

Title: `docs: add Open Granola to productivity apps`

Body:

> Adds Open Granola to the Productivity & Apps community integrations. It uses the local OpenAI-compatible endpoint for meeting-note summaries. Recording uses local Whisper and currently captures the microphone only. Setup: [Ollama guide](https://github.com/anshuman-pandey/open-granola/blob/main/docs/integrations/OLLAMA.md). Compatibility record: link the completed record for the exact app commit, Ollama version, local model, OS, structured notes and failure/retry result before submitting.

The missing record is a submission blocker, not a placeholder to post upstream. LM Studio documentation and any upstream fixes remain subject to the evidence and contribution rules in [COMMUNITY_GROWTH.md](COMMUNITY_GROWTH.md).

## Review measures

The review baseline is 12 stars, one fork and no published releases on 2026-10-12. Stars are a discovery signal, not evidence of active users.

Track completed independent setup records, reported time to first useful notes, optional repeat use, accepted maintained integrations and external contributions. Release asset downloads can be counted but do not identify unique or active users. Keep results aggregate and voluntary; collect no meeting content or contributor profiles.

Publish an actual synthetic demonstration after a candidate passes validation. Historical design screenshots under `docs/assets` and `landing/assets` contain outdated capability/privacy labels and should not be used as release evidence. Preserve the current README presentation and roadmap while adding only the setup and integration links needed to use delivered features.

## Reusable dependencies

The desktop app is not a standalone npm SDK: its package is private and the Rust library is tied to Tauri, audio, storage and inference. Start with the delivered file integration. Extract a versioned schema/parser package only when an external maintainer identifies a concrete use case and commits to consuming it. Agreement, documentation and compatibility tests come before publishing or opening a dependency-adoption PR.
