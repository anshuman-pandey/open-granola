import {
  ArrowDownWideNarrow,
  ArrowRight,
  CalendarDays,
  FileText,
  Search,
  Video,
} from "lucide-react";
import { useMemo, useState } from "react";
import { getBackend } from "../lib/backend";
import type { Brief, Meeting } from "../lib/types";
import { AvatarStack } from "./Avatar";

interface Props {
  meetings: Meeting[];
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
  brief,
  onOpenMeeting,
  onRecord,
  onSearch,
  busy,
  recording,
}: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "title">("newest");
  const demo = getBackend().mode === "demo";
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return meetings
      .filter((m) =>
        [
          m.title,
          m.summary,
          m.template,
          ...m.tags,
          ...m.participants.map((p) => p.name),
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
  const minutes = meetings.reduce((sum, m) => sum + m.durationMin, 0);
  const decisions = meetings.reduce((sum, m) => sum + m.decisions.length, 0);

  return (
    <div className="scrollbar-thin paper-texture min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 pb-24 pt-8 sm:px-8 lg:px-12 lg:pt-12">
        <div className="animate-rise flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {demo ? "Sample workspace" : "Your local library"}
          </span>
        </div>
        <div className="animate-rise mt-7 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="font-display text-[40px] leading-[1.08] tracking-tight sm:text-[48px]">
              Be present.
              <br />
              <span className="text-primary">Keep the important parts.</span>
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
              {demo
                ? "A space for conversations, decisions, and what comes next. Explore the sample library or try a simulated meeting."
                : "Find your conversations, review decisions, and turn meeting notes into next steps."}
            </p>
          </div>
          <button
            disabled={busy || recording}
            onClick={onRecord}
            className="flex min-h-11 w-fit items-center gap-2 rounded-xl bg-primary px-5 text-[13px] font-semibold text-primary-foreground shadow-sm"
          >
            <Video size={16} />
            {busy
              ? "Please wait…"
              : recording
                ? "Session in progress"
                : demo
                  ? "Try a demo session"
                  : "Capture meeting"}
          </button>
        </div>
        <div className="mt-8 grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-card/70 py-4 sm:py-5">
          {[
            { value: meetings.length, label: "Meetings", icon: FileText },
            { value: minutes, label: "Minutes of notes", icon: CalendarDays },
            { value: decisions, label: "Decisions", icon: ArrowRight },
          ].map(({ value, label, icon: Icon }) => (
            <div key={label} className="px-3 sm:px-5">
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                <Icon size={13} className="hidden sm:block" />
                <span className="text-[10px] sm:text-xs">{label}</span>
              </div>
              <div className="font-display text-[28px] leading-none sm:text-[32px]">
                {value}
              </div>
            </div>
          ))}
        </div>
        {brief && (
          <section className="mt-7 rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-xs font-semibold text-primary">
                <CalendarDays size={15} />
                {demo ? "Sample meeting brief" : "Meeting brief"}
              </h2>
              <span className="text-xs text-muted-foreground">
                {demo ? "Example agenda" : brief.startsIn}
              </span>
            </div>
            <h3 className="mt-3 font-display text-2xl">{brief.meetingTitle}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {brief.lastTime.recap}
            </p>
            {brief.worthRaising.length > 0 && (
              <details className="mt-4 text-[12px]">
                <summary className="w-fit cursor-pointer font-semibold">
                  Topics to bring up
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {brief.worthRaising.map((topic) => (
                    <li key={topic}>{topic}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}
        <section className="mt-9" aria-labelledby="library-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="library-heading" className="font-display text-[26px]">
                Your meeting library
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {demo
                  ? "Sample notes to explore the experience"
                  : meetings.length >= 1000
                    ? "Showing the latest 1,000 meetings. Search transcripts to find earlier notes."
                    : "Your saved conversations in one place"}
              </p>
            </div>
            {onSearch && (
              <button
                onClick={onSearch}
                className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-primary hover:bg-primary/5"
              >
                Search transcripts <ArrowRight size={14} />
              </button>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <div className="flex min-w-[160px] flex-1 items-center gap-2.5 rounded-xl border border-border bg-card px-3">
              <Search size={15} className="shrink-0 text-muted-foreground" />
              <input
                aria-label="Filter meeting library"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a meeting, person, or topic…"
                className="min-h-11 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-xs text-primary"
                >
                  Clear
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs">
              <ArrowDownWideNarrow
                size={14}
                className="text-muted-foreground"
              />
              <span className="sr-only">Sort meetings</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="min-h-11 bg-transparent outline-none"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A–Z</option>
              </select>
            </label>
          </div>
          {shown.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-border py-12 text-center">
              <FileText size={28} className="mx-auto text-muted-foreground" />
              <h3 className="mt-4 text-base font-semibold">
                {query
                  ? "No matching meetings"
                  : "Room for your first conversation"}
              </h3>
              <p className="mx-auto mt-2 max-w-xs px-4 text-sm leading-relaxed text-muted-foreground">
                {query
                  ? "Try a different name or topic, or clear your filter."
                  : "Capture a meeting or import your notes from Settings to build your library."}
              </p>
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="mt-4 rounded-lg border border-border px-4 py-2 text-xs font-semibold"
                >
                  Clear filter
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {shown.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onOpenMeeting(m.id)}
                  className="group flex flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary/40"
                >
                  <div className="flex w-full flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {new Date(m.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      <span className="mx-1">·</span> {m.durationMin} min
                    </span>
                    <span className="rounded-md bg-secondary px-2 py-1 text-[9px] font-medium text-secondary-foreground">
                      {m.template}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[16px] font-semibold leading-snug transition-colors group-hover:text-primary">
                    {m.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                    {m.summary ||
                      "Open this meeting to read the transcript and notes."}
                  </p>
                  <div className="mt-auto flex w-full items-center justify-between pt-5">
                    <AvatarStack people={m.participants} max={4} />
                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      Open notes{" "}
                      <ArrowRight
                        size={12}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
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
