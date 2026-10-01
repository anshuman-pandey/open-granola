import {
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  ListChecks,
  MessageCircle,
  ScrollText,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getBackend } from "../lib/backend";
import { fmtTs } from "../hooks/useLiveSession";
import type { ActionItem, ChatMessage, Meeting } from "../lib/types";
import { Avatar, AvatarStack } from "./Avatar";
import { downloadMarkdown, meetingMarkdown } from "./meeting-export";

interface Props {
  meeting: Meeting;
  actionItems?: ActionItem[];
  onToggleAction: (id: string, done: boolean) => Promise<void> | void;
  askFn?: (q: string) => Promise<string>;
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
  const chatEnd = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
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
    if (tab === "transcript" && highlight)
      transcriptRef.current
        ?.querySelector(`[data-segment-id="${CSS.escape(highlight)}"]`)
        ?.scrollIntoView({ behavior: "auto", block: "center" });
  }, [tab, highlight]);

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
            text: "I couldn’t answer this question. Check that a local model is configured in Settings, then try again.",
          },
        ]);
    } finally {
      if (sequence === request.current) setThinking(false);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        className={`${chatOpen ? "hidden xl:flex" : "flex"} min-w-0 flex-1 flex-col overflow-hidden`}
      >
        <header className="border-b border-border bg-card/60 px-5 pb-4 pt-6 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {new Date(meeting.date).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}{" "}
              <span className="mx-1">·</span> {meeting.durationMin} min
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={copy}
                aria-label="Copy meeting as Markdown"
                title="Copy Markdown"
                className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <button
                onClick={() => {
                  downloadMarkdown(
                    meeting.title,
                    meetingMarkdown(meeting, items),
                  );
                  setNotice("Markdown export downloaded.");
                }}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium"
              >
                <Download size={14} />
                Export
              </button>
            </div>
          </div>
          <h1 className="font-display mt-3 text-[28px] leading-tight sm:text-[34px]">
            {meeting.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <AvatarStack people={meeting.participants} max={6} />
            <span className="text-xs text-muted-foreground">
              {meeting.participants.map((p) => p.name).join(", ") ||
                "No participants recorded"}
            </span>
            <span className="rounded-md bg-secondary px-2 py-1 text-[10px] text-secondary-foreground">
              {meeting.template}
            </span>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-1">
            <div
              role="tablist"
              aria-label="Meeting content"
              className="flex gap-1"
            >
              {(
                [
                  ["notes", "Notes", ListChecks],
                  ["transcript", "Transcript", ScrollText],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
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
                    document.getElementById(`tab-${next}`)?.focus();
                  }}
                  aria-controls={`meeting-${id}`}
                  id={`tab-${id}`}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${tab === id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  <Icon size={14} />
                  {label}
                  {id === "transcript" && (
                    <span className="ml-1 opacity-60">
                      {meeting.transcript.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => setChatOpen(true)}
              className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5 xl:hidden"
            >
              <MessageCircle size={14} />
              Ask
            </button>
          </div>
        </header>
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
          className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7"
          role="tabpanel"
          id={`meeting-${tab}`}
          aria-labelledby={`tab-${tab}`}
        >
          {tab === "notes" ? (
            <div className="mx-auto max-w-2xl space-y-7 pb-16">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <Sparkles size={13} />
                  {demo ? "Sample summary" : "Summary"}
                </h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                  {meeting.summary ||
                    "No summary is available for this meeting. You can still read and export the transcript."}
                </p>
              </section>
              {meeting.chapters.length > 0 && (
                <section>
                  <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Conversation chapters
                  </h2>
                  <div className="space-y-3">
                    {meeting.chapters.map((chapter, index) => (
                      <div
                        key={index}
                        className="flex gap-3 rounded-2xl border border-border bg-card p-4"
                      >
                        <button
                          disabled={!meeting.transcript.length}
                          onClick={() => jumpTo(chapter.timestamp)}
                          title="Find this moment in transcript"
                          aria-label={`Find ${chapter.title} at ${chapter.timestamp} in transcript`}
                          className="font-mono2 h-fit shrink-0 rounded-md bg-secondary px-2 py-1 text-[10px] text-secondary-foreground hover:bg-primary hover:text-primary-foreground"
                        >
                          {chapter.timestamp}
                        </button>
                        <div>
                          <h3 className="text-[13px] font-semibold">
                            {chapter.title}
                          </h3>
                          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                            {chapter.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <section>
                <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Decisions{" "}
                  <span className="ml-1">{meeting.decisions.length}</span>
                </h2>
                {meeting.decisions.length ? (
                  <ul className="space-y-2">
                    {meeting.decisions.map((decision, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3"
                      >
                        <CheckCircle2
                          size={16}
                          className="mt-0.5 shrink-0 text-primary"
                        />
                        <span className="text-[13px] leading-relaxed">
                          {decision}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    No decisions recorded in this note.
                  </p>
                )}
              </section>
              <section>
                <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Action items{" "}
                  <span className="ml-1">
                    {items.filter((a) => !a.done).length} open
                  </span>
                </h2>
                {items.length ? (
                  <div className="space-y-2">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        role="checkbox"
                        aria-checked={item.done}
                        disabled={pending.includes(item.id)}
                        onClick={() => void toggle(item)}
                        className="flex w-full items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left"
                      >
                        {item.done ? (
                          <CheckCircle2
                            size={17}
                            className="mt-0.5 shrink-0 text-primary"
                          />
                        ) : (
                          <Circle
                            size={17}
                            className="mt-0.5 shrink-0 text-muted-foreground"
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block text-[13px] leading-relaxed ${item.done ? "text-muted-foreground line-through" : ""}`}
                          >
                            {item.text}
                          </span>
                          <span className="mt-1 block text-[11px] text-muted-foreground">
                            {item.owner}
                            {item.due ? ` · ${item.due}` : ""}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    No action items recorded in this note.
                  </p>
                )}
              </section>
            </div>
          ) : (
            <div
              ref={transcriptRef}
              className="mx-auto max-w-2xl space-y-1 pb-16"
            >
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3">
                <Search size={14} className="text-muted-foreground" />
                <input
                  aria-label="Search this transcript"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find words in this transcript…"
                  className="h-11 min-w-0 flex-1 bg-transparent text-xs outline-none"
                />
                <span className="text-[10px] text-muted-foreground">
                  {shownSegments.length} segments
                </span>
              </div>
              <p className="mb-4 px-1 text-[11px] text-muted-foreground">
                {demo
                  ? "Sample transcript. Speaker labels and timestamps are illustrative."
                  : "Review transcripts for accuracy. Speaker labels may need verification."}
              </p>
              {shownSegments.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {query
                    ? "No matching transcript segments."
                    : "No transcript saved for this meeting."}
                </p>
              )}
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
                    data-segment-id={segment.id}
                    className={`flex gap-3 rounded-xl px-2 py-3 ${highlight === segment.id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-card"}`}
                  >
                    <span className="font-mono2 mt-1 shrink-0 text-[10px] text-muted-foreground">
                      {fmtTs(segment.start)}
                    </span>
                    <Avatar person={person} size={24} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">{person.name}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-foreground/90">
                        {segment.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <aside
        aria-label="Meeting assistant"
        className={`${chatOpen ? "flex" : "hidden xl:flex"} min-h-0 w-full shrink-0 flex-col border-l border-border bg-card/50 xl:w-[310px] 2xl:w-[350px]`}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles size={15} />
          </div>
          <div>
            <h2 className="text-[13px] font-semibold">Meeting assistant</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {demo
                ? "Demo · answers from sample notes"
                : "Answers from your meeting library"}
            </p>
          </div>
          <button
            onClick={() => setChatOpen(false)}
            aria-label="Close meeting assistant"
            className="ml-auto rounded-lg p-2 xl:hidden"
          >
            <X size={17} />
          </button>
        </div>
        <div
          className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
          role="log"
          aria-live="polite"
          aria-label="Assistant conversation"
        >
          <div className="rounded-2xl border border-border bg-card px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
            {demo
              ? "Explore the decisions and action items in this sample meeting. Demo replies use the saved note content."
              : "Ask about your meetings. Verify important details against the source transcript."}
          </div>
          {chat.map((message) => (
            <div
              key={message.id}
              className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-[12px] leading-relaxed ${message.role === "user" ? "ml-5 bg-foreground text-background" : "mr-2 border border-border bg-card"}`}
            >
              <span className="sr-only">
                {message.role === "user" ? "You: " : "Assistant: "}
              </span>
              {message.text}
            </div>
          ))}
          {thinking && (
            <p role="status" className="px-2 text-xs text-muted-foreground">
              Finding an answer…
            </p>
          )}
          <div ref={chatEnd} />
        </div>
        <div className="space-y-3 border-t border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {["What was decided?", "What are the next steps?"].map(
              (question) => (
                <button
                  key={question}
                  disabled={thinking}
                  onClick={() => void send(question)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-primary"
                >
                  {question}
                </button>
              ),
            )}
          </div>
          <form
            className="flex items-center gap-2 rounded-xl border border-border bg-background p-2 pl-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <input
              value={draft}
              maxLength={4000}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Ask the meeting assistant"
              placeholder="Ask about your notes…"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
            <button
              disabled={!draft.trim() || thinking}
              type="submit"
              aria-label="Send question"
              className="rounded-lg bg-primary p-2 text-primary-foreground"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}
