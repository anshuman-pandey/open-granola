import { ArrowRight, Calendar, Flame, Lock, Sparkles, Video } from "lucide-react";
import { useState } from "react";
import { ACTION_ITEMS, MEETINGS } from "../lib/data";
import type { Meeting } from "../lib/types";
import { AvatarStack } from "./Avatar";

interface Props {
  meetings: Meeting[];
  onOpenMeeting: (id: string) => void;
  onRecord: () => void;
  onAsk: (q: string) => void;
}

export function HomeView({ meetings, onOpenMeeting, onRecord, onAsk }: Props) {
  const [q, setQ] = useState("");
  const open = ACTION_ITEMS.filter((a) => !a.done).length;
  const weekMins = MEETINGS.reduce((s, m) => s + m.durationMin, 0);

  return (
    <div className="scrollbar-thin paper-texture flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 pb-16 pt-12">
        {/* hero */}
        <div className="animate-rise">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-primary">Sunday, July 19</p>
          <h1 className="font-display mt-2 text-[44px] leading-[1.05]">
            Good morning.
            <br />
            <span className="ember-gradient-text">Four meetings</span> this week, all remembered.
          </h1>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            Everything below was transcribed, enhanced, and indexed on this device. Nothing was uploaded, retained, or
            trained on — anywhere else.
          </p>
        </div>

        {/* ask bar */}
        <form
          className="animate-rise mt-7"
          style={{ animationDelay: "60ms" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) onAsk(q);
          }}
        >
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2 pl-4 shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-2 focus-within:ring-ring/30">
            <Sparkles size={17} className="shrink-0 text-primary" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask across every meeting… “What did Vesper say about compliance?”"
              className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/70"
            />
            <button
              type="submit"
              className="ember-gradient flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white"
            >
              Ask <ArrowRight size={14} />
            </button>
          </div>
        </form>

        {/* stats */}
        <div className="animate-rise mt-6 grid grid-cols-3 gap-3" style={{ animationDelay: "120ms" }}>
          {[
            { icon: <Calendar size={15} />, label: "This week", value: `${meetings.length} meetings · ${weekMins} min` },
            { icon: <Flame size={15} />, label: "Open action items", value: `${open} across ${meetings.length} notes` },
            { icon: <Lock size={15} />, label: "Data that left this Mac", value: "0 bytes — ever" },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="text-primary">{s.icon}</span> {s.label}
              </div>
              <div className="mt-1.5 text-[15px] font-semibold">{s.value}</div>
            </div>
          ))}
        </div>

        {/* upcoming / record CTA */}
        <div
          className="animate-rise mt-6 flex items-center gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4"
          style={{ animationDelay: "180ms" }}
        >
          <div className="ember-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white">
            <Video size={18} />
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-semibold">Next up: Aurora checkpoint — in 2h 14m</div>
            <div className="text-[12.5px] text-muted-foreground">
              Sotto noticed it on your local calendar and can capture it with one click.
            </div>
          </div>
          <button
            onClick={onRecord}
            className="rounded-xl bg-foreground px-3.5 py-2 text-[13px] font-semibold text-background transition-transform hover:scale-[1.02]"
          >
            Start capture
          </button>
        </div>

        {/* recent meetings */}
        <div className="animate-rise mt-8" style={{ animationDelay: "240ms" }}>
          <h2 className="font-display text-[22px]">Recent notes</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {meetings.map((m) => (
              <button
                key={m.id}
                onClick={() => onOpenMeeting(m.id)}
                className="group rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {new Date(m.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ·{" "}
                    {m.durationMin}m
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                    {m.template}
                  </span>
                </div>
                <div className="mt-1.5 text-[15px] font-semibold leading-snug group-hover:text-primary">
                  {m.title} {m.starred && <span className="text-accent">★</span>}
                </div>
                <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">{m.summary}</p>
                <div className="mt-3 flex items-center justify-between">
                  <AvatarStack people={m.participants} />
                  <span className="text-[11px] text-muted-foreground">
                    {m.decisions.length} decisions · {m.chapters.length} chapters
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
