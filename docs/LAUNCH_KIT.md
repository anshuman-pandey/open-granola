# Sotto Launch Kit

Everything you need to push Sotto to GitHub and post it everywhere. Copy-paste ready.
**Before posting:** replace `sotto-notes/sotto` with your actual GitHub org/repo and add real
download links after your first release build.

---

## 0. Ship to GitHub (5 minutes)

```bash
cd sotto
git init && git add -A && git commit -m "Sotto v0.1.0 — local-first meeting notes"
gh repo create sotto --public --source=. --push \
  --description "Your meetings, remembered. Nothing leaves your machine. Free, open-source (Apache-2.0) AI meeting notes — 100% on-device."
```

Then on github.com → repo **Settings**:
- Topics: `meeting-notes`, `ai`, `whisper`, `local-llm`, `privacy`, `tauri`, `rust`, `granola-alternative`, `open-source`, `transcription`
- Website: your landing page URL
- Social preview image: `docs/assets/social-preview.png` (1200×630 — export from the landing hero screenshot)
- Pin issue: "Roadmap & how to contribute"
- Enable Discussions; add `CODE_OF_CONDUCT.md` (GitHub wizard) and issue templates

Tag a release to trigger the build workflow:

```bash
git tag v0.1.0 && git push origin v0.1.0   # CI builds dmg/msi/AppImage into a draft release
```

---

## 1. Hacker News — Show HN

**Title:**
> Show HN: Sotto – open-source Granola alternative, 100% on-device (no cloud, no accounts)

**Body:**
> Hi HN — I built Sotto, a meeting notepad that captures calls without a bot (like Granola), but the entire pipeline runs on your own hardware: whisper.cpp for streaming transcription, an embedded llama.cpp model for notes/chat, sqlite-vec for semantic search. There is no server, no account, and no network stack in the binary at all — CI rejects any PR that adds an HTTP dependency, and the macOS build ships without the network.client entitlement, so the OS itself blocks outbound connections.
>
> Why: Granola is lovely but uploads your audio, trains on your data unless you opt out, caps free-tier history, and has no Linux app. I wanted the same workflow with the privacy of an air-gapped machine — and free, Apache-2.0.
>
> Things it does that Granola doesn't: live assist during the call (recall from past meetings, suggested follow-ups), Linux support, optional encrypted audio playback to verify transcripts, on-device speaker diarization, and auto-export of action items to Markdown/Obsidian/Notion/Todoist.
>
> Stack: Tauri (Rust) + React/TS, whisper-rs, llama-cpp-2, rusqlite + sqlite-vec. ~15 MB installer; models (~4 GB) download once on first run.
>
> Repo: https://github.com/sotto-notes/sotto — feedback very welcome, especially from the local-inference crowd. The diarizer is currently model-free spectral clustering; curious what you'd do better within a pure-Rust budget.

---

## 2. Reddit

**r/LocalLLaMA** (title):
> I built an open-source meeting notepad where whisper.cpp + a local GGUF do everything Granola does — zero cloud, zero retention [Apache-2.0]

Body: lead with architecture (streaming whisper windows, llama.cpp enhancement with strict-JSON schema, sqlite-vec RAG, spectral diarization), link repo + ARCHITECTURE.md, ask for feedback on the diarization approach and prompt-constrained JSON extraction.

**r/selfhosted / r/privacy** (title):
> Sotto: AI meeting notes with no server at all — the app has no network stack (auditable, Apache-2.0)

Body: lead with the Airlock (no HTTP deps, CI gate, macOS sandbox entitlement omission, `lsof` shows zero connections), audio-shredded-by-default, zero-fill purge. Link PRIVACY.md.

**r/productivity / r/Remotework** (title):
> I made a free open-source Granola alternative — bot-free notes, works offline, mac/win/linux

Body: lead with the workflow: no bot joins, notes write themselves, action items export to your tools, live assist during calls. Less jargon, more GIF.

**Rules check:** each sub has self-promotion rules — r/selfhosted wants "self-promotion Friday", r/LocalLLaMA allows OSS project posts, r/privacy requires substantive content. Adjust timing accordingly.

---

## 3. X / Twitter thread

**Tweet 1:**
> I built an open-source Granola alternative that never lets a single byte leave your machine.
>
> 🎙️ bot-free capture · ⚡ on-device Whisper · 🧠 local LLM notes · 🔍 semantic search · 🐧 Linux too
>
> Free. Apache-2.0. No accounts, no cloud, no retention.
> github.com/sotto-notes/sotto 🧵

**2/** Granola's trade: nice notes, but your audio goes to their cloud, they train on your data by default, free tier history is capped, and Linux doesn't exist. Sotto keeps the workflow, deletes the business model.

**3/** The Airlock: there is no HTTP client anywhere in the dependency tree. CI fails any PR that adds one. On macOS the app ships without the network.client entitlement — the kernel itself blocks outbound connections. Run `lsof -i | grep sotto`: nothing.

**4/** Live assist is my favorite part: during the call, a private panel surfaces recall from past meetings, facts, and follow-up questions to ask — computed on-device against your local vector index. Granola only helps you after the meeting ends.

**5/** Under the hood: Tauri + Rust, whisper.cpp streaming (2s windows), llama.cpp for summaries/chat, sqlite-vec for search, spectral-clustering diarization. 15MB installer, models download once. Works fully offline — on a plane, in a SCIF, wherever.

**6/** It's v0.1 and genuinely useful today. Star it, try it in your next call, and tell me what breaks. Issues and PRs welcome — especially Windows WASAPI and PipeWire folks. github.com/sotto-notes/sotto

---

## 4. Product Hunt

**Tagline (60 chars):**
> Open-source AI meeting notes. Nothing leaves your machine.

**Description (260 chars):**
> Sotto captures any call without a bot, transcribes on-device with Whisper, and writes notes with a local LLM. No cloud, no accounts, no data retention — the app has no network stack at all. Free & Apache-2.0 for macOS, Windows, Linux.

**First comment (maker):**
> Hey PH! I loved Granola's bot-free capture but not its cloud — audio uploads, training on your data unless you opt out, capped free history. So I built the version I wanted: same workflow, 100% on-device inference (whisper.cpp + llama.cpp), plus things Granola doesn't do — live assist during the call, Linux support, optional encrypted audio playback, and action items that auto-export to your tools. It's Apache-2.0 and free forever. Happy to answer anything about the local-inference pipeline!

**Gallery:** home.png → capture.png (live assist) → note.png (enhanced notes) → comparison table graphic → Airlock terminal graphic.

---

## 5. More places to post

| Channel | Angle |
|---|---|
| Lobsters | Architecture deep-dive (link ARCHITECTURE.md directly) |
| r/opensource, r/rust, r/tauri | "Built with Rust/Tauri, whisper-rs, llama-cpp-2" |
| HackerNews (again, 3+ months later) | "Sotto 1.0" once roadmap items land |
| dev.to / Hashnode blog | "I reverse-engineered Granola's magic and made it run 100% locally" — technical writeup |
| Awesome lists | PRs to awesome-selfhosted, awesome-privacy, awesome-local-ai |
| Discord/Slack communities | LocalLLaMA Discord, Tauri Discord #showcase, Ollama Discord |
| LinkedIn | Compliance angle: "The AI notetaker your legal team can't object to" |
| AlternativeTo / opensource.builders | List as Granola alternative |
| YouTube/loom demo | 90-sec: record a fake call → live assist → enhanced notes → purge |

## 6. Launch-week checklist

- [ ] Repo public, LICENSE (Apache-2.0) detected by GitHub
- [ ] Release v0.1.0 with dmg/msi/AppImage attached
- [ ] Landing page live (GitHub Pages: push `sotto-site/` to `gh-pages` branch)
- [ ] Social preview image set
- [ ] Show HN posted Tue–Thu, 8–10am ET (best window)
- [ ] X thread + Product Hunt same day; Reddit spread across the week
- [ ] Respond to every comment within 2 hours for the first 48h
- [ ] Add "Star history" and CI badges to README after day 1
