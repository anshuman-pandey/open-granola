<p align="center">
  <img src="docs/assets/logo.svg" width="72" alt="Open Granola logo" />
</p>

<h1 align="center">Open Granola</h1>

<p align="center">
  <strong>Your meetings, remembered. Nothing leaves your machine.</strong>
</p>

<p align="center">
  Free, open-source (Apache-2.0) AI meeting notes for <strong>macOS · Windows · Linux</strong>.<br/>
  Bot-free capture · on-device Whisper · local LLM notes · zero cloud · zero accounts · zero data retention.
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#why-open-granola">Why Open Granola</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="PRIVACY.md">Privacy</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

---

Open Granola is the meeting notepad for people who read the privacy policy first. It captures any call
(Zoom, Meet, Teams, Webex, huddles, in-person) **without a bot joining**, transcribes it with
**whisper.cpp on your own hardware**, and turns it into chapters, decisions and action items with a
**local LLM** (llama.cpp). There is no Open Granola server. There is no account. There is no telemetry.
There isn't even a network stack in the binary — we call that **Airlock**, and you can verify it
yourself in about 40 lines of source.

> *Granola's workflow, everyone's source code. Your meetings stay yours.*

## Why Open Granola

Granola proved that bot-free capture is the right idea. It also uploads your audio, trains on your
data unless you opt out (org-wide opt-out costs $35/user/mo), caps the free tier's history, skips
Linux entirely, and offers no help while the meeting is actually happening. Open Granola keeps the idea and
removes the business model:

| | **Open Granola** | Granola |
|---|---|---|
| Price | **Free, forever** | $0–35/user/mo |
| Audio & AI processing | **100% on-device** | Cloud |
| Trains on your data | **Impossible (no network)** | Opt-out; org-wide = Enterprise |
| Data retention | **None — audio shredded post-transcript** | Server-side, tier-dependent |
| Works offline | **Yes, fully** | No |
| Live assist during the call | **On-device recall, facts, follow-ups** | Yes — in their cloud |
| Mobile capture | Companion via local pairing (roadmap) | iOS + Android apps |
| Speaker diarization | **On-device, free** | Cloud, degrades past 3 people |
| Linux | **First-class** | No |
| Audio playback to verify lines | **Optional, encrypted, local** | Not available |
| License | **Apache-2.0** | Proprietary |

## Features

- 🎙️ **Bot-free capture** — system audio + mic, per-platform native loopback (CoreAudio process-tap / WASAPI loopback / PipeWire). Nobody in the call sees anything.
- ⚡ **Streaming on-device transcription** — Whisper Large v3 Turbo or NVIDIA Parakeet, 99 languages, with custom vocabulary for your names, numbers and jargon.
- 🧠 **Local AI notes** — an embedded GGUF model (Qwen3-4B default) writes the summary, chapters, decisions and action items with owners and due dates the moment you stop.
- 💡 **Live assist** — during the meeting, a private panel surfaces recall from past notes, relevant facts, and suggested follow-up questions. Only you see it.
- 🔍 **Semantic search + chat** — every meeting is embedded into a local sqlite-vec index. Ask “what did Vesper say about compliance?” and get answers with timestamps.
- 🗞️ **Pre-meeting Briefs** — before each call, Open Granola writes a private brief: what happened last time with these people, which commitments are riding on this meeting, and three things worth raising. All from local RAG.
- 🤝 **Commitment ledger** — every promise anyone makes (“I'll have it by Friday”) is extracted, tracked across meetings, and resurfaced when due. Nobody else builds this at any price.
- 📖 **Recipes** — shareable Markdown prompt packs (objection miner, board-update extractor…) that run on your local model. Publish them with a PR.
- 📥 **Importers** — one-click migration from Granola, Otter, Fireflies and read.ai exports. Switching costs: deleted.
- 📅 **Calendar-aware** — reads your local calendar (EventKit / ICS / CalDAV cache) to auto-title notes and prompt capture. Google and Outlook treated equally — no account needed.
- ✅ **Action items that travel** — auto-export to Markdown, Obsidian, Notion (local API token), Todoist or clipboard after every meeting.
- 🗂️ **Templates** — product sync, 1:1, sales discovery, interview, standup, board update — or your own Markdown.
- 🔐 **Airlock** — one build flag removes the network stack; the macOS sandbox additionally denies outbound sockets below the process. See [`src-tauri/src/airlock.rs`](src-tauri/src/airlock.rs).
- 🗑️ **Real deletion** — audio dies at transcription by default; retention auto-purge *shreds* notes, transcripts and embeddings (with `VACUUM`, so it's physical).

## Install

Download the latest build for your platform from
[**Releases**](https://github.com/anshuman-pandey/open-granola/releases):

| Platform | Package |
|---|---|
| macOS (Apple Silicon + Intel) | `Open Granola.dmg` |
| Windows | `Open Granola.msi` |
| Linux | `Open Granola.AppImage` / `opengranola.deb` / Flatpak |

On first launch Open Granola offers to fetch the on-device models (~4 GB total: Whisper, Qwen3, Nomic
embed). That model download is **the only network request Open Granola ever makes** — disable Airlock for
one minute to fetch them, or drop the GGUF files into the library folder manually and never open a
socket at all.

### Build from source

```bash
git clone https://github.com/anshuman-pandey/open-granola.git && cd open-granola
npm install
npm run tauri dev        # dev build
npm run tauri build      # release bundles in src-tauri/target/release/bundle
```

Prereqs: Rust ≥ 1.77, Node ≥ 20, and the [Tauri platform deps](https://v2.tauri.app/start/prerequisites/).
On Linux: `libpipewire-0.3-dev`, `libwebkit2gtk-4.1-dev`, `libasound2-dev`.

## How it works

```
mic ──┐                                  ┌─► streaming transcript (UI)
      ├─► mix → 16 kHz mono ring buffer ─┤
system┘   (RAM only — never on disk)     │   whisper.cpp windows (2 s / 500 ms stride)
                                         └─► spectral clustering → speaker labels
stop ─► transcript ─► llama.cpp ─► structured notes (summary · chapters · decisions · actions)
     ─► nomic-embed ─► sqlite-vec index ─► semantic search + chat + live-assist recall
audio ─► shredded (default) or encrypted-at-rest (opt-in)
```

Full details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## The privacy model (the short version)

1. **No network code exists in the app.** CI rejects any PR that adds an HTTP/WebSocket dependency.
2. **The OS enforces it too.** The macOS build ships without the `network.client` entitlement and
   loads a seatbelt profile denying outbound sockets at launch.
3. **Audio is deleted when transcription finishes.** Keeping encrypted local audio is opt-in.
4. **One-click purge** zero-fills the database file before unlinking it.
5. **Apache-2.0** — audit every line, or pay someone to. ([PRIVACY.md](PRIVACY.md))

## Roadmap

- [x] Bot-free capture on macOS / Windows / Linux
- [x] Streaming Whisper + on-device diarization
- [x] Local LLM enhancement, chat, semantic search
- [x] Live assist (recall, facts, follow-ups)
- [x] Pre-meeting Briefs + cross-meeting commitment ledger
- [x] Recipes + Granola/Otter/Fireflies importers
- [ ] Push-to-talk dictation in any app
- [ ] Local speaker identification ("that was Priya", trained on-device)
- [ ] SIEM-friendly signed audit export
- [ ] iOS/Android companion via local Wi-Fi pairing (still no cloud)

## Contributing

We'd love your help — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first issues are labeled, and the
rule is simple: **no PR may add a network dependency, an account system, or telemetry.** Everything
else is negotiable.

## License

[Apache-2.0](LICENSE) © Open Granola contributors. Use it, fork it, ship it in your company, sell support
for it — just keep the license notice.
