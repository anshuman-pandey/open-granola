# GitHub market refresh and developer adoption

Research date: **29 October 2026**. This refresh supplements the [2 October review](../COMPETITIVE_RESEARCH.md); it does not change its roadmap or checkbox states. Exact queries, capped results, repository metadata, README hashes, issue URLs/states and selected issue-body fingerprints are in [the snapshot](competitors-2026-10-29.json).

## Decision

Ship a practical path from existing transcripts to reusable data: **SRT/VTT/TXT import, versioned Transcript JSON export, a dependency-free CLI, synthetic fixtures, and fast cross-platform contributor tests**.

This is an implementation choice for this repository, not a claim to have invented CLI/MCP access, transcript exports or structured schemas. The developer benefit is that someone can validate a fixture and build a conversion workflow immediately with Node, before installing a native toolchain, downloading models or configuring an account. The desktop uses the same parser as the CLI.

## Scope and method

- Three GitHub repository searches, sorted by stars and capped at 30 results each: Granola in README; meeting notes in name/description/README; meeting plus MCP in README. These are discovery samples, not exhaustive rankings.
- Eleven selected repositories spanning direct meeting apps, transcript tools and developer-oriented services.
- Per selected repo: metadata and current README, up to 25 recent open issue/PR records with PRs excluded from analysis, and up to ten open issues sorted by reactions.
- Six selected issue bodies read to distinguish concrete reports from feature headlines. Their fingerprints are retained instead of republishing their bodies.
- The capped searches yielded 83 unique candidate repositories. The issue samples contain 176 rows representing 146 distinct open issues; six bodies were selected for closer reading.
- Software claims come from project documentation; competitors were not installed or benchmarked. A GitHub-detected license is a starting point, not evidence that every commercial feature is in the community code.

Stars are point-in-time interest counts, not active usage. An open issue establishes a reported request or problem, not proof that a current release has no related implementation. Reactions are small for several selected issues; those are useful individual workflow signals rather than broad market-size estimates.

## Selected current benchmarks

| Project | Stars at retrieval | Current documented signal | Open Granola implication |
|---|---:|---|---|
| [Meetily](https://github.com/Zackriya-Solutions/meetily) | 32,292 | Community recording/import; its separate Pro documentation includes CLI/API automation | Keep community versus paid feature claims separate; make this repo's conversion workflow usable from source |
| [Buzz](https://github.com/chidiwilliams/buzz) | 22,263 | TXT/SRT/VTT export; existing-transcript import is a reported workflow request | Let users bring an already transcribed file without running speech recognition again |
| [OpenWhispr](https://github.com/OpenWhispr/openwhispr) | 10,297 | Local/cloud speech tooling; composable command controls requested in a Wayland workflow | Scriptable interfaces can solve integration friction; do not imply our converter controls recording |
| [Anarlog](https://github.com/fastrepl/anarlog) | 9,620 | Local records, Markdown export, CLI/MCP and agent-oriented repository components | Basic agent connectivity is established competition; reduce setup cost and define a clear data boundary |
| [Vexa](https://github.com/Vexa-ai/vexa) | 2,927 | Developer-oriented meeting API; a clean-install report describes sequential blockers | Give contributors a small useful path that bypasses native/model prerequisites |
| [OpenOats](https://github.com/yazinsai/OpenOats) | 2,620 | Contextual local meeting workflow and configurable models | Another provider picker is a weak standalone differentiator |
| [Minutes](https://github.com/silverstein/minutes) | 1,578 | Markdown-owned records plus CLI/MCP/SDK | Deliver a documented, testable interchange contract rather than advertise generic MCP as novel |
| [Muesli](https://github.com/Muesli-HQ/muesli) | 1,496 | An export-preference report describes friction from extra clicks and automatically opening editors | Keep script output predictable and avoid launching destination applications |
| [Steno](https://github.com/stenolabs/stenoai) | 1,350 | Request for schema-validated structured fields | Start with a narrow validated transcript contract; do not claim arbitrary structured AI extraction |
| [Heed](https://github.com/isjunrod/heed) | 20 | Smaller local-first capture project; startup/transcription failure report | A readable fixture and model-free contributor path remain useful even before hardware validation |
| [Open Foresight](https://github.com/teng-lin/open-foresight) | 4 | Offline/agent workflow with explicit installed-app acceptance and CI work | Keep parser/build tests separate from claims of finished installer/audio QA |

These eleven were selected for workflow relevance, not presented as the eleven largest projects on GitHub. Search results also include infrastructure and collections, which are retained in the snapshot but are not direct competitors.

## Evidence behind the implementation

### Bring a transcript that already exists

[Buzz #1423](https://github.com/chidiwilliams/buzz/issues/1423), open with one reaction at retrieval, describes a team that transcribes in batches and wants others to reuse/correct the resulting TXT/VTT/SRT files. This is a concrete portability workflow. It supports offering an import path; it does not establish Buzz's latest full capabilities.

**Delivered slice:** shared caption/text parsing, desktop import through the existing transaction boundary, and CLI conversion into the documented JSON envelope. No audio file importer or named-service migration claim is added.

### Make output predictable and useful to scripts

[Muesli #293](https://github.com/Muesli-HQ/muesli/issues/293), open with two reactions, requests fewer repetitive export choices and no automatic editor opening. [Minutes' README](https://github.com/silverstein/minutes) and [Anarlog's README](https://github.com/fastrepl/anarlog) already describe programmatic access and portable local records.

**Delivered slice:** stdout/stderr separation, stdin support, selectable JSON/Markdown/VTT/SRT, explicit new-file output, documented exit behavior and no destination-app launch. The converter does not expose the live database or open a network listener.

### Define the data before promising automation

[Steno #542](https://github.com/stenolabs/stenoai/issues/542), open with one reaction, asks for validated structured report fields with schema revision and clear failure handling. Its scope is richer than this change.

**Delivered slice:** a versioned transcript-only schema, runtime size/date/time checks, rejection of unknown versions, and one fixture shared by Node tests and the native database import test. This does not implement custom report-field generation or prove factual accuracy of imported summaries.

### Make the first developer interaction succeed

[Vexa #1671](https://github.com/Vexa-ai/vexa/issues/1671), open with one reaction, reports sequential clean-install blockers. [Minutes #865](https://github.com/silverstein/minutes/issues/865), open with no reactions, reports unclear model prerequisites. [OpenWhispr #1329](https://github.com/OpenWhispr/openwhispr/issues/1329), open with five reactions, requests command controls for compositor integration.

**Delivered slice:** a useful Node-only example/test path requiring neither native dependencies nor models, plus a six-configuration OS/Node CI matrix. This improves entry into contribution and file automation; it does not solve native capture, dictation shortcuts or model installation.

## Why this scope comes first

| Candidate | Decision | Reason |
|---|---|---|
| Transcript interchange plus CLI | Implement now | Existing native import boundary; immediate developer use; bounded inputs; no provider dependency |
| Generic MCP server | Defer | Mature competition; needs carefully scoped live-data access and a stable record contract |
| Automatic GitHub/Jira issue creation | Defer | Requires account permissions and human review of inferred tasks; local Markdown output is enough for the first integration |
| Custom schema-driven AI reports | Defer | Requires model-output validation, storage revision and failure semantics beyond a file converter |
| More model logos | Defer as a differentiator | Existing configurable providers already cover the baseline; measured compatibility is more valuable |
| System audio and easier model setup | Keep existing priority | Important adoption blockers, but require platform/hardware work and are not completed by this PR |

## Developer adoption checks

1. From a clean clone, validate and render the synthetic fixture with only a supported Node runtime.
2. Convert a real-format synthetic VTT/SRT fixture, import its JSON into the desktop, and preserve source timing/text through the native import boundary.
3. Exercise invalid versions, hostile Markdown content, malformed captions, oversize input, missing timestamps, Unicode and no-overwrite behavior.
4. Give contributors a fast OS/Node result independently of the slower native build.
5. Preserve the main README layout and roadmap; add a short entry to the workflow guide in each existing README language.

Measure independent completion of these documented paths, useful integration examples, reproducible bug reports and contributor turnaround. Stars may be observed, but no causal growth or unique-market-feature claim is established by this research.

## Format references

The caption parser supports a documented subset of [WebVTT](https://www.w3.org/TR/webvtt1/) and [SubRip](https://www.loc.gov/preservation/digital/formats/fdd/fdd000569.shtml). It flattens presentation metadata and refuses incompatible or ambiguous conversions. See [developer workflows](../DEVELOPER_WORKFLOWS.md) for the exact scope and limits.
