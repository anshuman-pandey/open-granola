import {
  ArrowDownWideNarrow,
  ArrowRight,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  Clock3,
  FileText,
  Flame,
  History,
  Lightbulb,
  Search,
  Sparkles,
  Star,
  Video,
} from "lucide-react";
import { useMemo, useState } from "react";
import { getBackend } from "../lib/backend";
import type { ActionItem, Brief, Meeting } from "../lib/types";
import { AvatarStack } from "./Avatar";

interface Props {
  meetings: Meeting[];
  actionItems?: ActionItem[];
  brief: Brief | null;
  onOpenMeeting: (id: string) => void;
  onRecord: () => void;
  onAsk: (q: string) => void;
  onSearch?: () => void;
  busy?: boolean;
  recording?: boolean;
}

export function HomeView({
  meetings,
  actionItems = [],
  brief,
  onOpenMeeting,
  onRecord,
  onAsk,
  onSearch,
  busy,
  recording,
}: Props) {
  const [question, setQuestion] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "title">("newest");
  const [briefOpen, setBriefOpen] = useState(true);
  const demo = getBackend().mode === "demo";
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12
      ? "Good morning."
      : hour < 18
        ? "Good afternoon."
        : "Good evening.";
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return meetings
      .filter((meeting) =>
        [
          meeting.title,
          meeting.summary,
          meeting.template,
          ...meeting.tags,
          ...meeting.participants.map((person) => person.name),
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
      .sort((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title)
          : sort === "newest"
            ? +new Date(b.date) - +new Date(a.date)
            : +new Date(a.date) - +new Date(b.date),
      );
  }, [meetings, query, sort]);
  const minutes = meetings.reduce(
    (sum, meeting) => sum + meeting.durationMin,
    0,
  );
  const openActions = actionItems.filter((item) => !item.done).length;
  const decisions = meetings.reduce(
    (sum, meeting) => sum + meeting.decisions.length,
    0,
  );
  const ask = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) onAsk(trimmed);
  };

  return (
    <div className="scrollbar-thin paper-texture min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1040px] px-5 pb-20 pt-8 sm:px-8 lg:px-12 lg:pt-10">
        <header className="animate-rise">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
            {now.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <div className="mt-3 flex items-end justify-between gap-5">
            <div>
              <h1 className="font-display text-[40px] leading-[1.08] tracking-[-0.02em] sm:text-[48px]">
                {greeting}
              </h1>
              <p className="mt-2.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                {meetings.length
                  ? "A little context for your next conversation. Pick up where you left off."
                  : "A fresh page for your conversations. Capture a meeting or bring your notes along."}
              </p>
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-1.5 text-[10px] text-muted-foreground sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
              {demo ? "Sample workspace" : "Local workspace"}
            </span>
          </div>
        </header>

        <div className="animate-rise mt-6" style={{ animationDelay: "40ms" }}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask(question);
            }}
            className="group flex items-center gap-2.5 rounded-2xl border border-primary/20 bg-card px-3 py-2.5 shadow-[0_2px_8px_-4px_hsl(var(--foreground)/0.12)] transition-shadow focus-within:border-primary/45 focus-within:ring-4 focus-within:ring-primary/5 sm:gap-3 sm:pl-4"
          >
            <Sparkles size={18} className="shrink-0 text-primary" />
            <input
              aria-label="Ask across your meetings"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={4000}
              placeholder="Ask across your meetings…"
              className="min-h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/80"
            />
            <button
              type="submit"
              disabled={!question.trim() || busy}
              className="button-primary min-h-11 shrink-0 px-3 text-xs sm:px-4 md:min-h-10"
            >
              Ask <ArrowRight size={14} />
            </button>
          </form>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-[10px] text-muted-foreground">
            <span className="hidden sm:inline">Try asking</span>
            {["What needs a follow-up?", "What did we decide?"].map(
              (prompt) => (
                <button
                  key={prompt}
                  disabled={busy}
                  onClick={() => ask(prompt)}
                  className="flex min-h-11 items-center rounded-md border-b border-dashed border-border py-0.5 text-left transition-colors hover:border-primary/50 hover:text-primary md:min-h-0"
                >
                  {prompt}
                </button>
              ),
            )}
            {demo && (
              <span className="ml-auto hidden text-[9px] text-muted-foreground/80 lg:inline">
                Demo answers use sample notes
              </span>
            )}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-3 gap-2.5 sm:gap-3">
          {[
            {
              label: "In your library",
              value: `${meetings.length} ${meetings.length === 1 ? "meeting" : "meetings"}`,
              detail: `${minutes} min`,
              icon: CalendarDays,
            },
            {
              label: "Open action items",
              value: `${openActions} ${openActions === 1 ? "item" : "items"}`,
              detail: "",
              icon: Flame,
            },
            {
              label: "Decisions saved",
              value: `${decisions} ${decisions === 1 ? "decision" : "decisions"}`,
              detail: "",
              icon: CheckCheck,
            },
          ].map(({ label, value, detail, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl border border-border/80 bg-card/75 px-3 py-3 sm:px-4"
            >
              <dt className="flex items-center gap-1.5 min-h-7 text-[10px] font-semibold uppercase tracking-[0.02em] text-muted-foreground sm:min-h-0">
                <Icon
                  size={12}
                  className="hidden shrink-0 text-primary sm:block"
                />
                {label}
              </dt>
              <dd className="mt-2 text-[11px] font-semibold leading-snug sm:text-[13px]">
                {value}
                {detail && (
                  <span className="ml-1 hidden font-normal text-muted-foreground xl:inline">
                    · {detail}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        {brief && (
          <section
            className="animate-rise mt-6 overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.035]"
            style={{ animationDelay: "80ms" }}
            aria-labelledby="brief-heading"
          >
            <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
              <div className="ember-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm">
                <Video size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-primary">
                  {demo ? "A sample meeting brief" : "Before your next meeting"}
                </p>
                <h2
                  id="brief-heading"
                  className="mt-1 text-[14px] font-semibold leading-tight"
                >
                  {brief.meetingTitle}
                </h2>
              </div>
              <span className="hidden text-[10px] text-muted-foreground sm:block">
                {demo ? "Example agenda" : brief.startsIn}
              </span>
              <button
                aria-label={
                  briefOpen ? "Collapse meeting brief" : "Expand meeting brief"
                }
                aria-expanded={briefOpen}
                aria-controls="meeting-brief-content"
                onClick={() => setBriefOpen(!briefOpen)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-primary/5 md:min-h-8 md:min-w-8"
              >
                <ChevronDown
                  size={15}
                  className={`transition-transform ${briefOpen ? "rotate-180" : ""}`}
                />
              </button>
            </div>
            {briefOpen && (
              <div
                id="meeting-brief-content"
                className="border-t border-primary/10"
              >
                <div className="grid gap-5 px-4 py-4 sm:px-5 lg:grid-cols-2 lg:gap-6">
                  <div>
                    <h3 className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      <History size={12} className="text-primary" />
                      Last time
                    </h3>
                    <p className="mt-2 text-[12px] leading-[1.7] text-foreground/85">
                      {brief.lastTime.recap}
                    </p>
                  </div>
                  <div>
                    <h3 className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      <Flame size={12} className="text-primary" />
                      Open commitments{" "}
                      <span className="font-normal">
                        ({brief.openCommitments.length})
                      </span>
                    </h3>
                    {brief.openCommitments.length ? (
                      <ul className="mt-2.5 space-y-2.5">
                        {brief.openCommitments.map((item, index) => (
                          <li
                            key={`${item.owner}-${index}`}
                            className="flex items-start gap-2"
                          >
                            <span
                              className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${item.overdue ? "bg-destructive" : "bg-primary/70"}`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] leading-relaxed">
                                <span className="font-semibold">
                                  {item.owner}
                                </span>
                                <span className="text-muted-foreground">
                                  {" "}
                                  — {item.text}
                                </span>
                              </p>
                            </div>
                            {item.due && (
                              <span
                                className={`mt-0.5 shrink-0 text-[9px] ${item.overdue ? "font-medium text-destructive dark:text-red-400" : "text-muted-foreground"}`}
                              >
                                {item.overdue ? "Overdue · " : ""}
                                {item.due}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        No open commitments in this brief.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-start justify-between gap-3 border-t border-primary/10 px-4 py-3 sm:px-5">
                  {brief.worthRaising.length > 0 && (
                    <details className="group min-w-0 flex-1">
                      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded text-[10px] font-medium text-primary md:min-h-0 [&::-webkit-details-marker]:hidden">
                        <Lightbulb size={12} />
                        {brief.worthRaising.length} topics worth raising
                        <ChevronDown
                          size={12}
                          className="transition-transform group-open:rotate-180"
                        />
                      </summary>
                      <ul className="mt-3 max-w-lg list-disc space-y-2 pl-4 text-[11px] leading-relaxed text-muted-foreground">
                        {brief.worthRaising.map((topic) => (
                          <li key={topic}>{topic}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <AvatarStack people={brief.participants} max={5} />
                </div>
              </div>
            )}
          </section>
        )}

        {!brief && (
          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card/60 p-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[13px] font-semibold">
                Ready for your next conversation?
              </h2>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {demo
                  ? "Try a simulated session to see how notes come together."
                  : "Start a microphone session and keep the notes in your library."}
              </p>
            </div>
            <button
              disabled={busy || recording}
              onClick={onRecord}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-xs font-semibold text-background md:min-h-10"
            >
              <Video size={14} />
              {busy
                ? "Please wait…"
                : recording
                  ? "Session in progress"
                  : demo
                    ? "Try demo"
                    : "Start capture"}
            </button>
          </div>
        )}

        <section className="mt-8" aria-labelledby="library-heading">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-baseline gap-2.5">
              <h2
                id="library-heading"
                className="font-display text-[27px] leading-none"
              >
                Your meeting library
              </h2>
              <span className="text-[10px] text-muted-foreground">
                {shown.length}
                {query ? ` of ${meetings.length}` : " notes"}
              </span>
            </div>
            {onSearch && (
              <button
                onClick={onSearch}
                className="flex min-h-11 items-center gap-1 rounded-lg py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary md:min-h-0"
              >
                Search transcripts <ArrowRight size={12} />
              </button>
            )}
          </div>
          {meetings.length >= 1000 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing the latest 1,000 meetings. Search transcripts to find
              earlier notes.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2.5">
            <div className="flex min-w-[160px] flex-1 items-center gap-2 rounded-xl border border-border bg-card/80 px-3 transition-colors focus-within:border-primary/40">
              <Search size={14} className="shrink-0 text-muted-foreground" />
              <input
                aria-label="Filter meeting library"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a meeting, person, or topic…"
                className="min-h-11 min-w-0 flex-1 bg-transparent text-[12px] outline-none md:min-h-10"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="min-h-11 min-w-11 text-[10px] font-medium text-primary md:min-h-0 md:min-w-0"
                >
                  Clear
                </button>
              )}
            </div>
            <label className="flex items-center gap-1.5 rounded-xl border border-border bg-card/80 px-3">
              <ArrowDownWideNarrow
                size={13}
                className="text-muted-foreground"
              />
              <span className="sr-only">Sort meetings</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
                className="min-h-11 min-w-0 bg-transparent text-[11px] outline-none md:min-h-10"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A–Z</option>
              </select>
            </label>
          </div>
          {shown.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-card/30 px-4 py-12 text-center">
              <FileText
                size={26}
                className="mx-auto text-muted-foreground/60"
              />
              <h3 className="mt-4 text-sm font-semibold">
                {query
                  ? "No matching meetings"
                  : "Room for your first conversation"}
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
                {query
                  ? "Try a different name or topic, or clear your filter."
                  : "Capture a meeting or import your notes from Settings to build your library."}
              </p>
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="mt-4 min-h-11 rounded-lg border border-border px-4 py-2 text-xs font-semibold md:min-h-10"
                >
                  Clear filter
                </button>
              )}
            </div>
          ) : (
            <div className="mt-3.5 grid gap-3.5 lg:grid-cols-2">
              {shown.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => onOpenMeeting(meeting.id)}
                  className="group relative flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 text-left shadow-[0_1px_2px_hsl(var(--foreground)/0.03)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md sm:p-5"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                      {new Date(meeting.date).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="max-w-[45%] truncate rounded-full bg-secondary/75 px-2 py-0.5 text-[9px] text-secondary-foreground">
                      {meeting.template}
                    </span>
                  </div>
                  <h3 className="mt-3 flex items-start gap-1.5 text-[14px] font-semibold leading-snug transition-colors group-hover:text-primary">
                    {meeting.title}
                    {meeting.starred && (
                      <Star
                        size={11}
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 fill-accent text-accent"
                      />
                    )}
                  </h3>
                  {meeting.starred && (
                    <span className="sr-only">Starred meeting</span>
                  )}
                  <p className="mt-2 line-clamp-2 text-[11.5px] leading-[1.7] text-muted-foreground">
                    {meeting.summary ||
                      "Open this meeting to read the transcript and notes."}
                  </p>
                  <div className="mt-auto flex w-full items-center justify-between gap-2 pt-4">
                    <AvatarStack people={meeting.participants} max={4} />
                    <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock3 size={10} />
                        {meeting.durationMin} min
                      </span>
                      {meeting.decisions.length > 0 && (
                        <span>{meeting.decisions.length} decisions</span>
                      )}
                      <ArrowRight
                        size={13}
                        className="text-muted-foreground/60 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary"
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
