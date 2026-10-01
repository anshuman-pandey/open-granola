import { Lightbulb, Square } from "lucide-react";
import { getBackend } from "../lib/backend";
import { fmtClock, type LiveLine } from "../hooks/useLiveSession";
import type { LiveSuggestion } from "../lib/types";

interface Props {
  elapsed: number;
  lines: LiveLine[];
  suggestions: LiveSuggestion[];
  onStop: () => void;
  busy?: boolean;
}

export function CaptureBar({
  elapsed,
  lines,
  suggestions,
  onStop,
  busy,
}: Props) {
  const demo = getBackend().mode === "demo";
  return (
    <section
      aria-label={demo ? "Demo session" : "Active capture"}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center p-3 sm:pb-5"
    >
      <div className="pointer-events-auto w-full max-w-[860px] overflow-hidden rounded-2xl border border-border bg-popover/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span
            className="rec-dot h-2.5 w-2.5 shrink-0 rounded-full bg-destructive"
            aria-hidden="true"
          />
          <span
            className="font-mono2 text-xs font-medium tabular-nums"
            aria-label="Session duration"
          >
            {fmtClock(elapsed)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">
              {demo ? "Simulated meeting" : "Meeting capture"}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {demo
                ? "Sample transcript · no audio recorded"
                : "Live transcript · review before sharing"}
            </p>
          </div>
          <button
            disabled={busy}
            onClick={onStop}
            className="flex items-center gap-1.5 rounded-xl bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground"
          >
            <Square size={11} fill="currentColor" />
            {busy ? "Saving…" : "Finish"}
          </button>
        </div>
        <div className="flex max-h-[min(180px,25dvh)]">
          <div
            className="scrollbar-thin min-w-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
            aria-live="polite"
          >
            {lines.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {demo
                  ? "Starting the sample conversation…"
                  : "Waiting for transcript segments…"}
              </p>
            )}
            {lines.slice(-3).map((line) => (
              <div key={line.id} className="flex gap-2.5">
                <span className="mt-0.5 shrink-0 text-[10px] font-semibold text-primary">
                  {line.speaker}
                </span>
                <p
                  className={`text-xs leading-relaxed ${line.final ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {line.text}
                </p>
              </div>
            ))}
          </div>
          {suggestions.length > 0 && (
            <div className="scrollbar-thin hidden w-[260px] shrink-0 space-y-2 overflow-y-auto border-l border-border bg-secondary/40 px-4 py-3 sm:block">
              {suggestions.slice(-2).map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <h3 className="flex items-center gap-1.5 text-[10px] font-semibold text-primary">
                    <Lightbulb size={12} />
                    {demo ? "Sample suggestion" : suggestion.title}
                  </h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {suggestion.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
