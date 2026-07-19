import { Lightbulb, MessageCircleQuestion, Newspaper, Rewind, Square } from "lucide-react";
import { fmtClock, type LiveLine } from "../hooks/useLiveSession";
import type { LiveSuggestion } from "../lib/types";

interface Props {
  elapsed: number;
  lines: LiveLine[];
  suggestions: LiveSuggestion[];
  onStop: () => void;
}

const S_ICON = {
  recall: <Rewind size={13} />,
  fact: <Newspaper size={13} />,
  "follow-up": <MessageCircleQuestion size={13} />,
  answer: <Lightbulb size={13} />,
} as const;

export function CaptureBar({ elapsed, lines, suggestions, onStop }: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center pb-5">
      <div className="pointer-events-auto animate-rise w-[min(860px,calc(100%-48px))] overflow-hidden rounded-3xl border border-border bg-popover/95 shadow-2xl backdrop-blur-xl">
        {/* status row */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <span className="rec-dot h-2.5 w-2.5 rounded-full bg-destructive" />
          <span className="font-mono2 text-[13px] font-medium tabular-nums">{fmtClock(elapsed)}</span>
          <span className="text-[12px] text-muted-foreground">Aurora checkpoint — capturing system audio + mic</span>
          <div className="mx-2 flex h-5 items-end gap-[3px]">
            {Array.from({ length: 18 }).map((_, i) => (
              <span
                key={i}
                className="wave-bar w-[3px] rounded-full bg-primary"
                style={{
                  height: `${8 + ((i * 7) % 13)}px`,
                  animationDelay: `${(i % 6) * 120}ms`,
                  animationDuration: `${900 + ((i * 137) % 500)}ms`,
                }}
              />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400">
              on-device · no bot
            </span>
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 rounded-xl bg-destructive px-3 py-1.5 text-[12px] font-semibold text-destructive-foreground transition-transform hover:scale-105"
            >
              <Square size={11} fill="currentColor" /> Stop
            </button>
          </div>
        </div>

        <div className="flex max-h-[220px]">
          {/* live transcript */}
          <div className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
            {lines.length === 0 && (
              <p className="text-[12.5px] text-muted-foreground">Listening… transcription appears here in real time.</p>
            )}
            {lines.slice(-4).map((l) => (
              <div key={l.id} className="flex gap-2.5">
                <span className="mt-0.5 shrink-0 text-[11.5px] font-semibold" style={{ color: l.color }}>
                  {l.speaker}
                </span>
                <p className={`text-[13px] leading-relaxed ${l.final ? "text-foreground" : "text-foreground/70"}`}>
                  {l.text}
                  {!l.final && <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-primary align-middle" />}
                </p>
              </div>
            ))}
          </div>

          {/* live suggestions */}
          <div className="scrollbar-thin w-[280px] shrink-0 space-y-2 overflow-y-auto border-l border-border bg-secondary/40 px-4 py-4">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Live assist — only you see this
            </div>
            {suggestions.length === 0 && (
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                Context, facts and follow-ups surface here as the conversation unfolds.
              </p>
            )}
            {suggestions.map((s) => (
              <div key={s.id} className="animate-rise rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-primary">
                  {S_ICON[s.kind]} {s.title}
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-foreground/85">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
