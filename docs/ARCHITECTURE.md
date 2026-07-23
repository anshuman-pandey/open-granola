# Open Granola Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                          React frontend                            │
│  Home · NoteView (notes/transcript/chat) · CaptureBar · Settings   │
│  CSP: connect-src 'self' ipc: — the UI cannot reach the internet   │
└───────────────────────────────┬────────────────────────────────────┘
                                │ Tauri IPC (commands.rs)
┌───────────────────────────────▼────────────────────────────────────┐
│                            Rust core                               │
│                                                                    │
│  audio/          transcribe.rs        llm.rs          storage.rs   │
│  ├ mic (cpal)    ├ whisper.cpp        ├ enhance       ├ SQLite     │
│  ├ loopback      │  (streaming)       ├ live assist   ├ sqlite-vec │
│  │ ├ mac: tap    ├ spectral diarize   ├ chat (RAG)    ├ FTS5       │
│  │ ├ win: WASAPI └ vocab prompting    └ embeddings    ├ retention  │
│  │ └ linux: PW                                        └ purge      │
│  └ 16 kHz mono ring buffer (RAM only)                              │
│                                                                    │
│  airlock.rs — seatbelt/WFP/Flatpak: kernel-level outbound denial   │
│  calendar.rs — EventKit / ICS / CalDAV cache (read-only, local)    │
└────────────────────────────────────────────────────────────────────┘
```

## Data flow for one meeting

1. **Capture.** Mic (cpal) and system loopback are mixed, resampled to 16 kHz mono with rubato, and
   pushed into a lock-free ring buffer sized for 4 minutes (drained continuously, so steady-state
   usage is ~2 seconds of audio ≈ 64 kB). **Audio never touches disk in default mode.**
2. **Transcribe.** A worker drains the buffer in 2 s windows / 500 ms stride through whisper.cpp.
   Each segment gets a speaker label from online clustering of spectral embeddings (40-bin log
   envelopes, cosine threshold 0.78, EMA centroid updates). Partial results stream to the UI as
   `segment` events. A vocabulary prompt built from the user's custom dictionary biases decoding
   toward correct names and numbers.
3. **Live assist.** Every ~8 s the rolling window plus top-3 recalled snippets (sqlite-vec cosine
   over the local embedding index) go to the local LLM, which returns ≤2 suggestions as strict JSON.
4. **Enhance.** On Stop, the full transcript + the selected Markdown template go to the LLM with a
   schema-constrained prompt → summary, chapters, decisions, action items (owner/due). The JSON is
   peeled with `extract_json` and validated; a failed parse retries with temperature 0.
5. **Persist.** Meeting, segments, action items in SQLite; segment embeddings (nomic-embed via
   llama.cpp pooling) into sqlite-vec; full-text index in FTS5. Retention policy sets `expires_at`;
   enforcement deletes + `VACUUM`s.
6. **Destroy.** Purge zero-fills the DB file before unlink. Opt-in audio files are AES-256-GCM with
   the key in the OS keychain, so deleting the key is cryptographic erasure.

## Why these choices

- **Tauri over Electron** — ~15 MB installer vs ~200 MB, Rust audio stack without Node FFI pain,
  and a CSP/sandbox model that makes the Airlock claim enforceable in the UI layer too.
- **whisper.cpp + llama.cpp over hosted APIs** — the only way "nothing leaves your machine" is a
  fact rather than a policy. Apple Silicon / CUDA acceleration makes Large-v3-Turbo realtime on
  anything from an M1 up; Parakeet is offered for CUDA boxes.
- **Spectral diarization over pyannote** — pyannote needs PyTorch (GBs, Python). A model-free
  spectral-clustering diarizer is ~150 lines of Rust, runs in real time on CPU, and is good enough
  for ≤6 speakers. A candle-based embedding model is a planned upgrade behind the same interface.
- **SQLite + sqlite-vec over a vector DB** — one file, zero services, trivially inspectable and
  truly deletable.

## Threat model (what Airlock defends)

| Threat | Mitigation |
|---|---|
| App phones home (compromise or malicious PR) | No network stack in deps; CI grep; seatbelt `(deny network*)` |
| UI layer exfiltration (XSS → fetch) | CSP `connect-src 'self' ipc:`; no remote content |
| Forensic recovery of audio | RAM-only capture; zero-fill + VACUUM on purge; opt-in audio encrypted, keychain-held key |
| Malicious model file | Models are GGUF (data, not code); SHA-256 manifest checked at load |
| "Anonymous analytics" creep | Banned by CONTRIBUTING law #1; airlock.yml CI gate |

## Performance targets (M2 Air, 16 GB)

| Metric | Target |
|---|---|
| Cold start → ready | < 2.5 s (models lazy-loaded) |
| Transcription latency | < 1.5 s behind speech (Whisper Turbo) |
| Enhancement after Stop (45 min meeting) | < 20 s |
| Idle RAM | < 500 MB; < 7 GB during inference |
| Search over 1,000 meetings | < 150 ms |
