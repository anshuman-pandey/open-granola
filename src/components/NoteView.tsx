import {
  CheckCircle2,
  Circle,
  Copy,
  Download,
  ListChecks,
  Mic,
  ScrollText,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ACTION_ITEMS, PEOPLE } from "../lib/data";
import { getBackend } from "../lib/backend";
import { fmtTs } from "../hooks/useLiveSession";
import type { ActionItem, ChatMessage, Meeting } from "../lib/types";
import { Avatar, AvatarStack } from "./Avatar";

interface Props {
  meeting: Meeting;
  onToggleAction: (id: string, done: boolean) => void;
  askFn?: (q: string) => Promise<string>;
}

const CANNED: { match: RegExp; answer: string }[] = [
  {
    match: /budget|bundle|92/i,
    answer:
      "In the Aurora launch plan (14:40), Devon raised the bundle-size regression risk and the team set a hard budget of **92 kB gzipped** for the shell, enforced in CI. Devon owns wiring the check by Jul 24, and Priya backfills the analytics baseline first.",
  },
  {
    match: /vesper|compliance|siem/i,
    answer:
      "On the Vesper discovery call (Jul 11), compliance was the deal-breaker: their legal team rejected all five cloud notetakers on data residency. The pilot is scoped to **40 clinicians**, and a one-click **SIEM audit export** is a hard launch requirement. Budget is confirmed this quarter with a six-week decision window.",
  },
  {
    match: /motion|240/i,
    answer:
      "Amara proposed the spring motion system at 27:05 in the Aurora sync: **240 ms default duration** (180 ms felt twitchy on large panels). It was approved on the condition that reduced-motion fallbacks ship — Devon called those non-negotiable for accessibility sign-off.",
  },
  {
    match: /risk|block|worried/i,
    answer:
      "Two open risks from the Aurora sync: **Figma-to-token sync flakiness** (~1 in 20 runs fail, owner: Amara) and **staggered rollout comms** (owner: Lin). Separately, the tombstone compaction bug in offline sync **blocks the sync GA** — Priya's synthetic repro generator was due Jul 18.",
  },
];

const FALLBACK =
  "I searched the local index of all 4 meetings. The strongest matches are in “Aurora — Q3 launch plan” and the Vesper discovery call — try asking about the **bundle budget**, **motion spec**, **open risks**, or **Vesper's compliance requirements**.";

export function NoteView({ meeting, onToggleAction, askFn }: Props) {
  const [tab, setTab] = useState<"notes" | "transcript">("notes");
  const [items, setItems] = useState<ActionItem[]>(() =>
    ACTION_ITEMS.filter((a) => a.meetingId === meeting.id),
  );
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      id: "c0",
      role: "assistant",
      text: `I've read **${meeting.title}** and the rest of your local library. Ask me anything — answers include the exact moment they came from.`,
    },
  ]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  // Real action items when running on the Rust backend.
  useEffect(() => {
    if (getBackend().mode === "tauri") {
      getBackend()
        .getMeeting(meeting.id)
        .then((r) => setItems(r.actionItems))
        .catch(() => {});
    }
  }, [meeting.id]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, thinking]);

  const streamAnswer = (answer: string) => {
    const aid = `a-${Date.now()}`;
    setChat((c) => [...c, { id: aid, role: "assistant", text: "" }]);
    let i = 0;
    const iv = window.setInterval(() => {
      i += 3;
      setChat((c) => c.map((m) => (m.id === aid ? { ...m, text: answer.slice(0, i) } : m)));
      if (i >= answer.length) {
        window.clearInterval(iv);
        setThinking(false);
      }
    }, 14);
  };

  const send = (text: string) => {
    if (!text.trim() || thinking) return;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text };
    setChat((c) => [...c, userMsg]);
    setDraft("");
    setThinking(true);
    if (askFn) {
      // Real path: RAG + local LLM in the Rust core.
      askFn(text)
        .then((answer) => streamAnswer(answer))
        .catch(() => {
          streamAnswer("The local model isn't ready yet — install one in Settings → On-device models.");
        });
      return;
    }
    // Demo path: canned librarian answers.
    const answer = CANNED.find((c) => c.match.test(text))?.answer ?? FALLBACK;
    setTimeout(() => streamAnswer(answer), 700);
  };

  const renderMd = (t: string) => {
    const parts = t.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith("**") ? (
        <strong key={i} className="font-semibold text-foreground">
          {p.slice(2, -2)}
        </strong>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* header */}
        <div className="border-b border-border bg-card/60 px-7 pb-4 pt-6 backdrop-blur">
          <div className="flex items-center gap-2 text-[11.5px] font-medium text-muted-foreground">
            <span>
              {new Date(meeting.date).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
            <span>·</span>
            <span>{meeting.durationMin} min</span>
            <span>·</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-semibold text-secondary-foreground">
              {meeting.template}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-accent" title="Star">
                <Star size={15} className={meeting.starred ? "fill-accent text-accent" : ""} />
              </button>
              <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary" title="Copy Markdown">
                <Copy size={15} />
              </button>
              <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary" title="Export">
                <Download size={15} />
              </button>
            </span>
          </div>
          <h1 className="font-display mt-1.5 text-[30px] leading-tight">{meeting.title}</h1>
          <div className="mt-2 flex items-center gap-3">
            <AvatarStack people={meeting.participants} max={6} />
            <span className="text-[12px] text-muted-foreground">
              {meeting.participants.map((p) => p.name.split(" ")[0]).join(", ")}
            </span>
          </div>
          {/* tabs */}
          <div className="mt-4 flex gap-1">
            {(
              [
                ["notes", "Enhanced notes", <ListChecks key="n" size={14} />],
                ["transcript", "Transcript", <ScrollText key="t" size={14} />],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  tab === id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* body */}
        <div className="scrollbar-thin flex-1 overflow-y-auto px-7 py-6">
          {tab === "notes" ? (
            <div className="mx-auto max-w-2xl space-y-7 pb-16">
              {/* summary */}
              <section className="animate-rise rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                  <Sparkles size={12} /> Summary
                </h3>
                <p className="mt-2 text-[14.5px] leading-relaxed">{meeting.summary}</p>
              </section>

              {/* chapters */}
              <section className="animate-rise" style={{ animationDelay: "60ms" }}>
                <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Chapters
                </h3>
                <div className="space-y-2.5">
                  {meeting.chapters.map((c, i) => (
                    <div
                      key={i}
                      className="group flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
                    >
                      <button className="font-mono2 mt-0.5 h-fit shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-white">
                        {c.timestamp}
                      </button>
                      <div>
                        <div className="text-[14px] font-semibold">{c.title}</div>
                        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{c.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* decisions */}
              <section className="animate-rise" style={{ animationDelay: "120ms" }}>
                <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Decisions
                </h3>
                <div className="space-y-2">
                  {meeting.decisions.map((d, i) => (
                    <div key={i} className="flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-accent-foreground" />
                      <span className="text-[13.5px] leading-relaxed">{d}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* action items */}
              {items.length > 0 && (
                <section className="animate-rise" style={{ animationDelay: "180ms" }}>
                  <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Action items
                  </h3>
                  <div className="space-y-2">
                    {items.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)));
                          onToggleAction(a.id, !a.done);
                        }}
                        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm"
                      >
                        {a.done ? (
                          <CheckCircle2 size={17} className="shrink-0 text-emerald-600" />
                        ) : (
                          <Circle size={17} className="shrink-0 text-muted-foreground" />
                        )}
                        <span className={`flex-1 text-[13.5px] ${a.done ? "text-muted-foreground line-through" : ""}`}>
                          {a.text}
                        </span>
                        <span className="text-[11.5px] font-medium text-muted-foreground">
                          {a.owner} · {a.due}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-1 pb-16">
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-600/25 bg-emerald-500/10 px-4 py-2.5 text-[12.5px] text-emerald-800 dark:text-emerald-300">
                <Mic size={14} />
                Transcribed on-device with Whisper Large v3 Turbo · speaker labels by local diarization · 99 languages
              </div>
              {meeting.transcript.map((t) => {
                const sp = PEOPLE[t.speakerId];
                return (
                  <div key={t.id} className="group flex gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-card">
                    <button className="font-mono2 mt-1 h-fit shrink-0 text-[11px] text-muted-foreground group-hover:text-primary">
                      {fmtTs(t.start)}
                    </button>
                    <Avatar person={sp} size={24} />
                    <div className="min-w-0">
                      <span className="text-[12px] font-semibold" style={{ color: sp.color }}>
                        {sp.name}
                      </span>
                      <p className="text-[13.5px] leading-relaxed text-foreground/90">{t.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* AI panel */}
      <div className="flex w-[320px] shrink-0 flex-col border-l border-border bg-card/50">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="ember-gradient flex h-6 w-6 items-center justify-center rounded-lg text-white">
            <Sparkles size={12} />
          </div>
          <div>
            <div className="text-[13px] font-semibold">Ask Open Granola</div>
            <div className="text-[10px] text-muted-foreground">Qwen3 4B · on-device · zero retention</div>
          </div>
        </div>
        <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4">
          {chat.map((m) => (
            <div
              key={m.id}
              className={`rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
                m.role === "user"
                  ? "ml-6 bg-foreground text-background"
                  : "mr-4 border border-border bg-card shadow-sm"
              }`}
            >
              {renderMd(m.text)}
            </div>
          ))}
          {thinking && (
            <div className="mr-4 flex items-center gap-1.5 rounded-2xl border border-border bg-card px-3.5 py-3 shadow-sm">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="wave-bar inline-block h-3 w-1 rounded-full bg-primary/70"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          )}
          <div ref={chatEnd} />
        </div>
        <div className="space-y-2 border-t border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {["What was decided?", "Open risks?", "Draft the follow-up email"].map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring/30"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about this meeting…"
              className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground/70"
            />
            <button type="submit" className="text-primary transition-transform hover:scale-110">
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
