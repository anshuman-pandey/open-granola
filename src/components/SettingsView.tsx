import { Download, FileUp, HardDrive, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { MODELS } from "../lib/data";

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative h-5.5 w-10 rounded-full transition-colors ${on ? "bg-primary" : "bg-input"}`}
      style={{ height: 22 }}
    >
      <span
        className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all"
        style={{ left: on ? 20 : 2 }}
      />
    </button>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div>
        <div className="text-[13.5px] font-semibold">{title}</div>
        <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{desc}</div>
      </div>
      {children}
    </div>
  );
}

export function SettingsView() {
  const [airlock, setAirlock] = useState(true);
  const [audioCache, setAudioCache] = useState(false);
  const [purge, setPurge] = useState(true);
  const [crashReports, setCrashReports] = useState(false);

  return (
    <div className="scrollbar-thin paper-texture flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 px-8 pb-16 pt-10">
        <div>
          <h1 className="font-display text-[32px]">Settings</h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">Everything runs here. Nothing leaves here.</p>
        </div>

        {/* Airlock */}
        <section className="animate-rise overflow-hidden rounded-2xl border border-emerald-600/30 bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-emerald-600/20 bg-emerald-500/10 px-5 py-4">
            <ShieldCheck size={20} className="text-emerald-700 dark:text-emerald-400" />
            <div>
              <div className="text-[14px] font-bold text-emerald-800 dark:text-emerald-300">Airlock</div>
              <div className="text-[12px] text-emerald-700/80 dark:text-emerald-400/80">
                Sotto's network stack is physically disabled — verify it in the source, it's one build flag.
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="font-mono2 text-[11px] text-emerald-700 dark:text-emerald-400">0 bytes sent · 0 connections</div>
              <div className="font-mono2 text-[11px] text-emerald-700 dark:text-emerald-400">since install</div>
            </div>
          </div>
          <div className="divide-y divide-border">
            <Row title="Airlock (offline mode)" desc="Blocks every outbound connection at the OS level. With it on, Sotto works fully offline, forever.">
              <Toggle on={airlock} onChange={() => setAirlock(!airlock)} />
            </Row>
            <Row title="Anonymous crash reports" desc="Off by default. Even on, reports are stored locally for you to inspect and send manually.">
              <Toggle on={crashReports} onChange={() => setCrashReports(!crashReports)} />
            </Row>
          </div>
        </section>

        {/* Storage & retention */}
        <section className="animate-rise rounded-2xl border border-border bg-card shadow-sm" style={{ animationDelay: "60ms" }}>
          <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
            <HardDrive size={15} className="text-primary" />
            <span className="text-[14px] font-bold">Storage & retention</span>
            <span className="ml-auto font-mono2 text-[11px] text-muted-foreground">1.9 GB used · ~/Library/Sotto</span>
          </div>
          <div className="divide-y divide-border">
            <Row title="Keep raw audio" desc="Off by default: audio is deleted the moment transcription finishes. Enable to keep encrypted local audio you can play back and verify against.">
              <Toggle on={audioCache} onChange={() => setAudioCache(!audioCache)} />
            </Row>
            <Row title="Auto-purge notes older than 90 days" desc="Your retention policy, enforced locally. Notes, transcripts and embeddings are shredded — not just hidden.">
              <Toggle on={purge} onChange={() => setPurge(!purge)} />
            </Row>
            <Row title="Delete everything" desc="One click wipes every note, transcript, embedding and model cache from this device.">
              <button className="flex items-center gap-1.5 rounded-xl border border-destructive/40 px-3 py-1.5 text-[12px] font-semibold text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground">
                <Trash2 size={13} /> Purge library
              </button>
            </Row>
          </div>
        </section>

        {/* Models */}
        <section className="animate-rise rounded-2xl border border-border bg-card shadow-sm" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
            <Download size={15} className="text-primary" />
            <span className="text-[14px] font-bold">On-device models</span>
            <span className="ml-auto text-[11.5px] text-muted-foreground">downloaded once, used offline forever</span>
          </div>
          <div className="divide-y divide-border">
            {MODELS.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold">{m.name}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                      {m.kind}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {m.size} · {m.note}
                  </div>
                </div>
                {m.status === "installed" ? (
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Ready
                  </span>
                ) : (
                  <button className="rounded-xl border border-border px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-secondary">
                    Download
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Import */}
        <section className="animate-rise rounded-2xl border border-border bg-card shadow-sm" style={{ animationDelay: "160ms" }}>
          <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
            <FileUp size={15} className="text-primary" />
            <span className="text-[14px] font-bold">Import from another notetaker</span>
          </div>
          <div className="divide-y divide-border">
            <Row title="Granola" desc="Bring your history with you: drop Granola's export (Settings → Data → Export, or their API) and Sotto converts notes, transcripts and dates into local meetings. The file is read once, then forgotten.">
              <button className="rounded-xl border border-border px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-secondary">
                Choose export…
              </button>
            </Row>
            <Row title="Otter / Fireflies / read.ai" desc="Same trick for the other clouds — CSV or JSON exports become fully local, fully searchable Sotto notes.">
              <button className="rounded-xl border border-border px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-secondary">
                Choose export…
              </button>
            </Row>
          </div>
        </section>

        <p className="text-center font-mono2 text-[11px] text-muted-foreground">
          sotto 0.1.0 · apache-2.0 · built with tauri + whisper.cpp + llama.cpp
        </p>
      </div>
    </div>
  );
}
