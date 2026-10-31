# Continuous discovery and adoption loop

Owner-authorized scope, 1 November 2026: research adjacent repositories, improve Open Granola, merge the loop's tested PRs, and submit eligible upstream listing/integration PRs. The engineering loop runs in the existing Codex chat at 09:00 and 21:00 Asia/Kolkata. GitHub independently collects public metrics daily at 09:00 after the measurement workflow reaches main.

## The two outcomes

**Stars** measure voluntary interest. **Adoption** means someone independently reaches a useful result and, ideally, returns. A star, clone, download, contributor or demo visit is not an active user. Do not buy stars, exchange stars, mass-promote in issues, invent usage, or add features only to increase a counter.

The [initial public snapshot](baseline-2026-11-01.json) records 16 stars, one fork, no published release assets and no non-owner contributors returned by GitHub. Independent first runs and repeat use are **unknown**, not zero. There is no evidence here that past changes caused star growth.

| Measure | Collection and interpretation |
|---|---|
| Stars and net change | GitHub repository metadata; compare dated observations, including decreases |
| Published asset downloads | Sum all public release assets, including prereleases; exclude drafts and CI artifacts; cumulative events, not unique installs |
| Non-owner contributors | Deduplicated public non-bot GitHub contributors, excluding the owner account; a collaboration proxy, not users |
| Independent first useful result | Review voluntary [setup reports](../../.github/ISSUE_TEMPLATE/setup-report.yml) or linked validation records; count distinct reporters once, distinguish CLI/desktop/demo, exclude maintainer/automation tests |
| Return use | Optional voluntary evidence of use on another day; do not infer from repeated downloads or ask for meeting content |
| Maintained distribution | Accepted upstream entries/integrations and independently reported referrals; a submitted PR is not an accepted listing |

No app telemetry is added. The snapshot contains aggregate public counters, source URLs and time, not contributor profiles or meeting content. Do not publish private traffic data, tokens or account identifiers in the ledger. GitHub's contributor cache may lag. Missing API data stays unavailable; incomplete pagination is never reported as a complete total.

```sh
node scripts/adoption-snapshot.mjs --output snapshot.json
node --test scripts/adoption-snapshot.test.mjs
```

Node 22.12+ is enough. No npm installation, native build or API key is required for public collection, subject to GitHub's anonymous rate limit. Optional `GH_TOKEN`/`GITHUB_TOKEN` is used only in headers to the fixed GitHub API origin; redirects are refused. `--output` creates a new file and refuses overwrites. Output files request owner-only permissions where supported.

The **Adoption metrics** GitHub workflow uploads daily JSON artifacts with 90-day retention and read-only repository permissions. It neither calls an LLM nor writes to branches. Download and preserve weekly snapshots before artifact expiry when retaining a longer trend. Collection is a scheduled attempt, not an exact-time or uptime guarantee.

## Each engineering cycle

1. **Inspect current state.** Fetch main; check CI, releases, open PRs, the [opportunity ledger](opportunities.json), and previous experiments. Continue an existing relevant PR before creating another. Preserve unrelated local/untracked files and the existing README, branding, UI design and roadmap checkboxes. Use an isolated checkout and `codex/` branches.
2. **Measure.** Read the latest successful metrics artifact or run the Node collector. Record the actual observation time. Compare 7- and 28-day windows only when comparable snapshots exist. Report missing baselines and small samples plainly.
3. **Research fresh sources.** Examine recent releases, code and concrete user issues from at least three relevant projects, and discover at least two new candidates across meeting notes, speech, local AI, transcript tools, note-taking and developer workflows. Rotate beyond the current watchlist. Record search queries, dates, repository URLs and evidence. A popular repo or open issue alone does not establish a missing feature or demand.
4. **Rank work by useful outcomes.** For each serious candidate, record adoption impact, relevant audience, evidence strength, implementation/maintenance cost and risk. Prefer onboarding, reliability, portability and useful integrations over cosmetic churn or copying provider logos. Choose at most one bounded implementation per 24 hours, and only when it clears an actual problem. A run with no worthwhile change is valid.
5. **Implement and verify.** Add a focused feature or fix, document its limits, and run checks appropriate to the affected paths plus the repository's required CI. Preserve privacy boundaries, free/open-source use, six-locale support for new UI copy and license obligations. Do not claim hardware/model validation from parser tests or builds. Fix failures rather than weakening checks.
6. **Merge the loop's own work.** Open a focused PR, attach it to this chat, inspect its final diff and all required checks, and merge using the verified head SHA once they pass. No further owner approval is needed for these merges. Do not bypass branch protection, force-push main, or merge unrelated/major dependency PRs without reviewing their actual compatibility and CI. Repair regressions before starting another experiment.
7. **Pursue distribution selectively.** Follow the upstream procedure below. A working, documented integration is preferable to inserting an unnecessary dependency. Never pretend another maintainer has agreed to consume our code.
8. **Close the feedback loop.** Record the PR/submission URL, shipped behavior, checks, hypothesis and next review date. Keep unchanged observations in this chat rather than opening a metrics-only PR twice a day. Update the tracked ledger when state changes; reuse an existing tracking PR. Notify only for a shipped improvement, accepted/rejected opportunity, material metric movement, failure, or needed user action.

## Upstream submission procedure

- Read the target's current README, contribution instructions, applicable AGENTS files, existing category, recent activity and open/closed suggestions immediately before submission. Check duplicate spelling and the canonical repository URL. Store the evidence date and precise gate.
- Submit only where the project genuinely fits and all explicit requirements are met. Respect closed submissions, star thresholds, AI-contribution restrictions and redirects to another tracker. Skip targets with stale maintenance or unverifiable rules rather than spraying PRs.
- Limit new upstream submissions to **two per rolling seven days**, one per project, and no duplicate while a prior submission is open or rejected without an invitation to retry. Carry the receipt and next permitted action forward. Address maintainer feedback on the existing PR; do not chase with unsolicited promotional comments.
- Use a minimal, objective entry and disclose development-preview status and material limitations. Show a reproducible integration or delivered workflow, not an endorsement request or unsupported compatibility claim. Mark a submission as submitted until the upstream maintainer accepts it; never merge somebody else's upstream PR using incidental permissions.
- Owner authorization covers eligible GitHub listing/integration PRs and necessary discussion on those PRs. It does not authorize paid placements, purchases, social posting, mailing campaigns, mass comments, or account creation using personal email. Never read or use a personal mailbox. Any future email work requires a verified business mailbox designated for Open Granola; none is designated by this loop.

## Initial research findings

[Subvox](https://github.com/joeblau/subvox), confirmed by the owner, is a macOS small-vocabulary motion-recognition prototype. Its session recorder exports labeled/predicted events and motion measurements; that is not evidence of a meeting-transcript integration. Track it as an adjacent technical signal. Revisit an adapter only after a concrete compatible text workflow or maintainer request appears; do not add a promotional dependency or imply current compatibility.

The ledger also distinguishes an eligible meeting-tools list from awesome-whisper's 100-star requirement, awesome-tauri's closed application category, a closed local-first list, inactive candidates, and provider listings that still need a genuine live-model validation record. Existing dated reviews in [ADOPTION_STATUS](../ADOPTION_STATUS.md), [COMMUNITY_GROWTH](../COMMUNITY_GROWTH.md), and [competitive research](../research/DEVELOPER_ADOPTION_2026_10_29.md) remain evidence from their review dates, not live capability guarantees.

## Weekly improvement of the loop

On the first Sunday run, review the preceding seven days and the available 28-day context. Evaluate each shipped experiment after at least 14 days or sufficient independent feedback. Record what happened, competing explanations and uncertainty. Keep useful changes even without star growth; improve or retire experiments with demonstrated friction. Reweight the next shortlist based on actual first-run success, repeat-use evidence, maintainer feedback and maintenance cost. Do not infer causality from a before/after star count.

The loop may refine its bounded queries and priorities. It may not expand its own publishing permissions, remove contribution-policy checks, start paid services or lower validation requirements. Repeated unchanged blockers should be recorded with a concrete unblocking action rather than retried indefinitely.

The engineering schedule uses this local desktop chat. The machine and app must remain available for those runs; the GitHub metrics workflow can still run independently. This protocol is not a claim of a hosted engineering service or completed release/hardware validation.
