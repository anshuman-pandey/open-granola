import {
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Copy,
  Download,
  ListChecks,
  MessageCircle,
  ScrollText,
  Search,
  Send,
  Sparkles,
  ArrowUpRight,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { getBackend } from "../lib/backend";
import { fmtTs } from "../hooks/useLiveSession";
import type { ActionItem, ChatMessage, Meeting } from "../lib/types";
import { ProcessingHistory } from "./ProcessingHistory";
import { Avatar, AvatarStack } from "./Avatar";
import { downloadMarkdown, meetingMarkdown } from "./meeting-export";

interface Props {
  meeting: Meeting;
  actionItems?: ActionItem[];
  onToggleAction: (id: string, done: boolean) => Promise<void> | void;
  askFn?: (q: string) => Promise<string>;
  onSummaryAttempt?: () => Promise<void>;
}

function demoAnswer(question: string, meeting: Meeting, items: ActionItem[]) {
  if (/action|next|follow.up|owner/i.test(question))
    return `Sample meeting action items:\n\n${
      items
        .filter((a) => !a.done)
        .map((a) => `• ${a.text} — ${a.owner}`)
        .join("\n") || "No open action items in this note."
    }`;
  if (/decid|decision/i.test(question))
    return `Decisions recorded in this sample note:\n\n${meeting.decisions.map((d) => `• ${d}`).join("\n") || "No decisions recorded."}`;
  return `Sample note summary:\n\n${meeting.summary || "No summary recorded."}\n\nThis browser preview displays the saved note content. Free-form AI answers require a configured desktop model.`;
}

export function NoteView({
  meeting,
  actionItems = [],
  onToggleAction,
  askFn,
  onSummaryAttempt,
}: Props) {
  const demo = getBackend().mode === "demo";
  const [tab, setTab] = useState<"notes" | "transcript">("notes");
  const [chatOpen, setChatOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const request = useRef(0);
  const viewId = useId();
  const chatEnd = useRef<HTMLDivElement>(null);
  const assistantInput = useRef<HTMLTextAreaElement>(null);
  const assistantTrigger = useRef<HTMLButtonElement>(null);
  const wasChatOpen = useRef(false);
  const tabButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const segmentElements = useRef(new Map<string, HTMLDivElement>());
  const items = actionItems.filter((a) => a.meetingId === meeting.id);
  const shownSegments = meeting.transcript.filter((t) =>
    t.text.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "auto", block: "nearest" });
  }, [chat, thinking]);
  useEffect(() => {
    if (tab === "transcript" && highlight) {
      const segment = segmentElements.current.get(highlight);
      segment?.scrollIntoView({ behavior: "auto", block: "center" });
      segment?.focus({ preventScroll: true });
    }
  }, [tab, highlight]);
  useEffect(() => {
    if (chatOpen) assistantInput.current?.focus();
    else if (wasChatOpen.current) assistantTrigger.current?.focus();
    wasChatOpen.current = chatOpen;
  }, [chatOpen]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(meetingMarkdown(meeting, items));
      setCopied(true);
      setNotice("Meeting copied as Markdown.");
      setError("");
    } catch {
      setError(
        "Clipboard access was unavailable. Use Export to save the Markdown file.",
      );
    }
  };
  const toggle = async (item: ActionItem) => {
    setPending((prev) => [...prev, item.id]);
    setError("");
    try {
      await onToggleAction(item.id, !item.done);
    } catch {
      setError("That action item could not be saved. Please try again.");
    } finally {
      setPending((prev) => prev.filter((id) => id !== item.id));
    }
  };
  const jumpTo = (timestamp: string) => {
    const seconds = timestamp
      .split(":")
      .reduce((sum, part) => sum * 60 + Number(part), 0);
    const nearest = [...meeting.transcript].sort(
      (a, b) => Math.abs(a.start - seconds) - Math.abs(b.start - seconds),
    )[0];
    setQuery("");
    setHighlight(nearest?.id ?? null);
    setTab("transcript");
  };
  const send = async (text: string) => {
    if (!text.trim() || thinking) return;
    const sequence = ++request.current;
    setChat((prev) => [
      ...prev,
      { id: `q-${sequence}`, role: "user", text: text.trim() },
    ]);
    setDraft("");
    setThinking(true);
    setError("");
    try {
      const answer = askFn
        ? await askFn(text.trim())
        : demo
          ? demoAnswer(text, meeting, items)
          : "The meeting assistant is unavailable. Check your model configuration in Settings.";
      if (sequence === request.current)
        setChat((prev) => [
          ...prev,
          { id: `a-${sequence}`, role: "assistant", text: answer },
        ]);
    } catch {
      if (sequence === request.current)
        setChat((prev) => [
          ...prev,
          {
            id: `a-${sequence}`,
            role: "assistant",
            text: "I couldn’t answer this question. Check the selected model provider in Settings, then try again.",
          },
        ]);
    } finally {
      if (sequence === request.current) setThinking(false);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden [overflow-wrap:anywhere]">
      <div
        className={`${chatOpen ? "hidden xl:flex" : "flex"} min-w-0 flex-1 flex-col overflow-hidden`}
      >
        <header className="shrink-0 border-b border-border/80 bg-card/45 px-5 pb-4 pt-6 sm:px-8 sm:pt-8 lg:px-10">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
              <time dateTime={meeting.date}>
                {new Date(meeting.date).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
              <span className="flex items-center gap-1.5">
                <Clock3 size={12} aria-hidden="true" />
                {meeting.durationMin} min
              </span>
              <span className="rounded-full border border-border/70 bg-secondary/60 px-2.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                {meeting.template}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={copy}
                aria-label="Copy meeting as Markdown"
                title="Copy Markdown"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:min-h-0 sm:min-w-0"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
              <button
                onClick={() => {
                  downloadMarkdown(
                    meeting.title,
                    meetingMarkdown(meeting, items),
                  );
                  setNotice("Markdown export downloaded.");
                }}
                className="flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-medium sm:min-h-0 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Download size={14} />
                Export
              </button>
            </div>
          </div>
          <h1 className="font-display mt-4 max-w-3xl text-[34px] leading-[1.08] tracking-[-0.025em] sm:text-[42px]">
            {meeting.title}
          </h1>
          <div className="mt-4 flex items-start gap-3">
            {meeting.participants.length > 0 && (
              <div className="pt-0.5">
                <AvatarStack people={meeting.participants} max={5} />
              </div>
            )}
            <p className="min-w-0 text-[12px] leading-6 text-muted-foreground">
              {meeting.participants.map((p) => p.name).join(", ") ||
                "No participants recorded"}
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Meeting content"
              className="flex rounded-xl border border-border/60 bg-secondary/55 p-1"
            >
              {(
                [
                  ["notes", "Notes", ListChecks],
                  ["transcript", "Transcript", ScrollText],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  ref={(element) => {
                    tabButtons.current[id] = element;
                  }}
                  role="tab"
                  aria-selected={tab === id}
                  tabIndex={tab === id ? 0 : -1}
                  onKeyDown={(event) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? "notes"
                        : event.key === "End"
                          ? "transcript"
                          : tab === "notes"
                            ? "transcript"
                            : "notes";
                    setTab(next);
                    tabButtons.current[next]?.focus();
                  }}
                  aria-controls={`${viewId}-meeting-${id}`}
                  id={`${viewId}-tab-${id}`}
                  onClick={() => setTab(id)}
                  className={`flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium sm:min-h-0 transition-colors ${tab === id ? "bg-card text-foreground shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon size={14} aria-hidden="true" />
                  {label}
                  {id === "transcript" && (
                    <span className="font-mono2 ml-1 text-[9px] text-muted-foreground">
                      {meeting.transcript.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              ref={assistantTrigger}
              onClick={() => setChatOpen(true)}
              aria-expanded={chatOpen}
              aria-controls={`${viewId}-assistant`}
              className="ml-auto flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/5 xl:hidden"
            >
              <MessageCircle size={14} aria-hidden="true" />
              Ask
            </button>
          </div>
        </header>
        <ProcessingHistory meeting={meeting} onAttempt={onSummaryAttempt} />
        {error && (
          <div
            role="alert"
            className="border-b border-destructive/20 bg-destructive/5 px-5 py-3 text-xs text-destructive"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="border-b border-border bg-secondary/60 px-5 py-2 text-xs text-muted-foreground"
          >
            {notice}
          </div>
        )}
        <div
          className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-7 sm:px-8 sm:py-9 lg:px-10"
          role="tabpanel"
          tabIndex={0}
          id={`${viewId}-meeting-${tab}`}
          aria-labelledby={`${viewId}-tab-${tab}`}
        >
          {tab === "notes" ? (
            <div className="mx-auto max-w-[720px] space-y-9 pb-16">
              <section className="relative overflow-hidden rounded-2xl border border-border/80 bg-card px-5 py-6 shadow-[0_2px_6px_hsl(var(--foreground)/0.025)] sm:px-6">
                <div
                  className="absolute inset-y-6 left-0 w-[3px] rounded-r bg-primary/70"
                  aria-hidden="true"
                />
                <h2 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                  <Sparkles size={13} aria-hidden="true" />
                  {demo ? "Sample summary" : "At a glance"}
                </h2>
                <p className="mt-4 whitespace-pre-wrap text-[14px] leading-[1.85] text-foreground/90 sm:text-[15px]">
                  {meeting.summary ||
                    "No summary is available for this meeting. You can still read and export the transcript."}
                </p>
              </section>
              {meeting.chapters.length > 0 && (
                <section>
                  <div className="mb-4 flex items-baseline justify-between gap-3">
                    <h2 className="font-display text-[25px] leading-tight">
                      The conversation
                    </h2>
                    <span className="text-[10px] text-muted-foreground">
                      Jump to a moment
                    </span>
                  </div>
                  <div className="divide-y divide-border/75 rounded-2xl border border-border/80 bg-card/65 px-4 sm:px-5">
                    {meeting.chapters.map((chapter, index) => (
                      <div
                        key={index}
                        className="flex flex-col gap-2.5 py-5 sm:flex-row sm:gap-4"
                      >
                        <button
                          disabled={!meeting.transcript.length}
                          onClick={() => jumpTo(chapter.timestamp)}
                          title="Find this moment in transcript"
                          aria-label={`Find ${chapter.title} at ${chapter.timestamp} in transcript`}
                          className="font-mono2 flex h-fit min-h-11 w-fit shrink-0 sm:min-h-0 items-center gap-1 rounded-md bg-secondary/80 px-2 py-1 text-[10px] text-secondary-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          {chapter.timestamp}
                          <ArrowUpRight size={10} aria-hidden="true" />
                        </button>
                        <div className="min-w-0">
                          <h3 className="text-[13px] font-semibold leading-relaxed">
                            {chapter.title}
                          </h3>
                          <p className="mt-1.5 text-[13px] leading-[1.8] text-muted-foreground">
                            {chapter.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <section>
                <div className="mb-4 flex items-baseline gap-3">
                  <h2 className="font-display text-[25px] leading-tight">
                    Decisions
                  </h2>
                  <span className="text-[10px] text-muted-foreground">
                    {meeting.decisions.length} recorded
                  </span>
                </div>
                {meeting.decisions.length ? (
                  <ul className="space-y-2">
                    {meeting.decisions.map((decision, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-3 rounded-xl border border-primary/10 bg-primary/[0.035] px-4 py-3.5"
                      >
                        <CheckCircle2
                          size={16}
                          className="mt-1 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span className="text-[13px] leading-[1.8]">
                          {decision}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    No decisions recorded in this note.
                  </p>
                )}
              </section>
              <section>
                <div className="mb-4 flex items-baseline gap-3">
                  <h2 className="font-display text-[25px] leading-tight">
                    Next steps
                  </h2>
                  <span className="text-[10px] text-muted-foreground">
                    {items.filter((a) => !a.done).length} open action items
                  </span>
                </div>
                {items.length ? (
                  <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/65">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        role="checkbox"
                        aria-checked={item.done}
                        aria-busy={pending.includes(item.id)}
                        disabled={pending.includes(item.id)}
                        onClick={() => void toggle(item)}
                        className="flex w-full items-start gap-3 border-b border-border/60 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-secondary/40 sm:px-5"
                      >
                        {item.done ? (
                          <CheckCircle2
                            size={17}
                            className="mt-1 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                        ) : (
                          <Circle
                            size={17}
                            className="mt-1 shrink-0 text-muted-foreground/70"
                            aria-hidden="true"
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block text-[13px] leading-[1.8] ${item.done ? "text-muted-foreground line-through" : ""}`}
                          >
                            {item.text}
                          </span>
                          <span className="mt-1.5 block text-[11px] text-muted-foreground">
                            {item.owner}
                            {item.due ? ` · ${item.due}` : ""}
                            {pending.includes(item.id) && (
                              <span className="text-primary"> · Saving…</span>
                            )}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    No action items recorded in this note.
                  </p>
                )}
              </section>
              <p className="flex items-center gap-2 border-t border-border/70 pt-5 text-[10px] leading-relaxed text-muted-foreground">
                <ScrollText size={13} className="shrink-0" aria-hidden="true" />
                {demo
                  ? "Sample meeting · explore the transcript for context."
                  : "Keep the transcript close. Review important details before sharing."}
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-[720px] pb-16">
              <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 focus-within:border-primary/40">
                <Search
                  size={15}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  aria-label="Search this transcript"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setHighlight(null);
                  }}
                  placeholder="Find a word or phrase…"
                  className="h-11 min-w-0 flex-1 bg-transparent text-[12px] outline-none"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label="Clear transcript search"
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-secondary sm:min-h-0 sm:min-w-0"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="mb-6 flex flex-wrap justify-between gap-2 text-[10px] leading-relaxed text-muted-foreground">
                <p>
                  {demo
                    ? "Sample speakers and timestamps are illustrative."
                    : "Review transcripts for accuracy. Speaker labels may need verification."}
                </p>
                <p role="status">
                  {shownSegments.length}{" "}
                  {query ? "matching segments" : "segments"}
                </p>
              </div>
              {shownSegments.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
                  <ScrollText
                    size={23}
                    className="mx-auto mb-3 text-muted-foreground/60"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-muted-foreground">
                    {query
                      ? "No matching transcript segments."
                      : "No transcript saved for this meeting."}
                  </p>
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      className="mt-3 text-xs font-medium text-primary"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              )}
              <div className="space-y-1">
                {shownSegments.map((segment) => {
                  const person = meeting.participants.find(
                    (p) => p.id === segment.speakerId,
                  ) ?? {
                    id: segment.speakerId,
                    name: "Unknown speaker",
                    initials: "?",
                    color: "#777777",
                  };
                  return (
                    <div
                      key={segment.id}
                      ref={(element) => {
                        if (element)
                          segmentElements.current.set(segment.id, element);
                        else segmentElements.current.delete(segment.id);
                      }}
                      tabIndex={-1}
                      data-segment-id={segment.id}
                      aria-label={`${fmtTs(segment.start)}, ${person.name}`}
                      className={`group flex gap-3 rounded-xl px-2 py-4 outline-offset-2 sm:gap-4 sm:px-3 ${highlight === segment.id ? "bg-primary/[0.06] ring-1 ring-primary/25" : "hover:bg-card/70"}`}
                    >
                      <div className="hidden pt-0.5 sm:block">
                        <Avatar person={person} size={27} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <p className="text-[12px] font-semibold">
                            {person.name}
                          </p>
                          <span className="font-mono2 shrink-0 text-[10px] text-muted-foreground">
                            {fmtTs(segment.start)}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.85] text-foreground/85">
                          {segment.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      <aside
        id={`${viewId}-assistant`}
        aria-label="Meeting assistant"
        onKeyDown={(event) => {
          if (event.key === "Escape" && chatOpen) {
            event.preventDefault();
            setChatOpen(false);
          }
        }}
        className={`${chatOpen ? "flex" : "hidden xl:flex"} min-h-0 w-full shrink-0 flex-col border-l border-border/80 bg-card/60 xl:w-[310px] 2xl:w-[330px]`}
      >
        <div className="flex items-center gap-2.5 border-b border-border/80 px-5 py-5">
          <div className="ember-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-sm">
            <Sparkles size={15} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[12px] font-semibold">Ask this meeting</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {demo
                ? "Demo · saved sample content"
                : "Local answers · this meeting"}
            </p>
          </div>
          <button
            onClick={() => setChatOpen(false)}
            aria-label="Close meeting assistant"
            className="ml-auto flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-secondary xl:hidden"
          >
            <X size={17} />
          </button>
        </div>
        <div
          className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-6"
          role="log"
          aria-live="polite"
          aria-label="Assistant conversation"
        >
          {chat.length === 0 ? (
            <div className="pt-3">
              <p className="font-display text-[28px] leading-[1.2] tracking-[-0.02em]">
                A little clarity,
                <br />
                <span className="text-muted-foreground">
                  whenever you need it.
                </span>
              </p>
              <p className="mt-4 text-[12px] leading-[1.8] text-muted-foreground">
                {demo
                  ? "Revisit the decisions and next steps in this sample meeting. Replies use its saved note content."
                  : "Ask a question about this meeting. Check important details against the source transcript."}
              </p>
              <div className="mt-6 space-y-2">
                {["What was decided?", "What are the next steps?"].map(
                  (question) => (
                    <button
                      key={question}
                      disabled={thinking}
                      onClick={() => void send(question)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-3.5 py-3 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      {question}
                      <ArrowUpRight
                        size={13}
                        className="shrink-0"
                        aria-hidden="true"
                      />
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {chat.map((message) => (
                <div key={message.id}>
                  <p
                    className={`mb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground ${message.role === "user" ? "text-right" : ""}`}
                  >
                    {message.role === "user" ? "You" : "Open Granola"}
                  </p>
                  <div
                    className={`whitespace-pre-wrap rounded-2xl px-4 py-3.5 text-[12px] leading-[1.8] ${message.role === "user" ? "ml-4 rounded-tr-md bg-secondary/80" : "rounded-tl-md border border-border/80 bg-card"}`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
            </div>
          )}
          {thinking && (
            <p
              role="status"
              className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span
                className="h-1.5 w-1.5 rounded-full bg-primary"
                aria-hidden="true"
              />
              Reading this meeting…
            </p>
          )}
          <div ref={chatEnd} />
        </div>
        <div className="border-t border-border/80 p-4">
          <form
            className="rounded-xl border border-border bg-card p-3 shadow-sm focus-within:border-primary/40"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <textarea
              ref={assistantInput}
              value={draft}
              maxLength={4000}
              rows={2}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              aria-label="Ask the meeting assistant"
              placeholder="Ask about this meeting…"
              className="block max-h-40 min-h-12 w-full resize-y bg-transparent text-[12px] leading-relaxed outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[9px] text-muted-foreground">
                {demo ? "Sample note replies" : "Processed on this device"}
              </span>
              <button
                disabled={!draft.trim() || thinking}
                type="submit"
                aria-label="Send question"
                className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary sm:h-8 sm:w-8 text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Send size={13} />
              </button>
            </div>
          </form>
          <p className="mt-2.5 text-center text-[9px] leading-relaxed text-muted-foreground">
            {demo
              ? "Free-form answers need a desktop model."
              : "Answers can be imperfect. Review the source."}
          </p>
        </div>
      </aside>
    </div>
  );
}
