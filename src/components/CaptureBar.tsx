import { useI18n } from "../i18n";
import { ArrowDown, Lightbulb, Mic, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import { getBackend } from "../lib/backend";
import { fmtClock, fmtTs, type LiveLine } from "../hooks/useLiveSession";
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
  const { t } = useI18n();
  const demo = getBackend().mode === "demo";
  const transcript = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  useEffect(() => {
    const element = transcript.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [lines]);

  const latest = () => {
    following.current = true;
    const element = transcript.current;
    if (element) element.scrollTop = element.scrollHeight;
  };

  return (
    <section
      aria-label={demo ? t("Demo session") : t("Active capture")}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 pt-2 sm:px-5 sm:pb-5"
    >
      <div className="pointer-events-auto w-full max-w-[890px] overflow-hidden rounded-[22px] border border-border bg-popover shadow-[0_14px_60px_-12px_hsl(var(--foreground)/0.25),0_3px_12px_hsl(var(--foreground)/0.06)] [overflow-wrap:anywhere]">
        <div className="flex items-center gap-3 border-b border-border/80 px-4 py-3.5 sm:px-5">
          <div className="flex shrink-0 items-center gap-2.5">
            <span
              className={`${busy ? "bg-muted-foreground" : "rec-dot bg-destructive"} h-2 w-2 shrink-0 rounded-full`}
              aria-hidden="true"
            />
            <span
              className="font-mono2 text-[11px] font-medium tabular-nums"
              aria-label={t("Session duration")}
            >
              {fmtClock(elapsed)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold">
              {busy
                ? t("Saving your meeting")
                : demo
                  ? t("Sample conversation")
                  : t("Meeting capture")}
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              {demo
                ? t("Demo · no audio recorded")
                : busy
                  ? t("Keeping your transcript on this device")
                  : t("Microphone · transcribing on this device")}
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-secondary/60 px-2.5 py-1 text-[9px] font-medium text-muted-foreground md:flex">
            <Mic size={11} aria-hidden="true" />
            {demo ? t("Simulated session") : t("Microphone only")}
          </span>
          <button
            disabled={busy}
            onClick={onStop}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full sm:min-h-0 bg-destructive px-3.5 py-2 text-[11px] font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
          >
            <Square size={10} fill="currentColor" aria-hidden="true" />
            {busy ? t("Saving…") : t("Finish")}
          </button>
        </div>
        <div className="flex h-[min(178px,25dvh)] min-h-[105px]">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-1.5 pt-3 sm:px-5">
              <h2 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {demo ? t("Sample transcript") : t("Live transcript")}
              </h2>
              {lines.length > 0 && (
                <button
                  onClick={latest}
                  className="flex items-center gap-1 rounded px-1 py-0.5 text-[9px] text-muted-foreground hover:text-primary"
                >
                  {t("Latest")}
                  <ArrowDown size={10} aria-hidden="true" />
                </button>
              )}
            </div>
            <div
              ref={transcript}
              className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-1 sm:px-5"
              role="log"
              aria-live="polite"
              aria-label={
                demo
                  ? t("Sample conversation transcript")
                  : t("Live microphone transcript")
              }
              tabIndex={0}
              onScroll={(event) => {
                const element = event.currentTarget;
                following.current =
                  element.scrollHeight -
                    element.scrollTop -
                    element.clientHeight <
                  32;
              }}
            >
              {lines.length === 0 && (
                <p className="py-3 text-[12px] leading-relaxed text-muted-foreground">
                  {demo
                    ? t("The sample conversation will appear here shortly.")
                    : t("Your transcript will appear here as you speak.")}
                </p>
              )}
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="flex flex-col gap-1 sm:flex-row sm:gap-3"
                >
                  <div className="flex shrink-0 items-baseline gap-2 sm:w-[108px] sm:flex-col sm:gap-0.5">
                    <span className="text-[10px] font-semibold leading-relaxed text-primary">
                      {line.speaker}
                    </span>
                    {line.startMs !== undefined && (
                      <span className="font-mono2 text-[9px] text-muted-foreground">
                        {fmtTs(line.startMs / 1000)}
                      </span>
                    )}
                  </div>
                  <p
                    className={`min-w-0 text-[12px] leading-[1.75] ${line.final ? "text-foreground/90" : "text-muted-foreground"}`}
                  >
                    {line.text || "…"}
                  </p>
                </div>
              ))}
            </div>
          </div>
          {demo && suggestions.length > 0 && (
            <div className="scrollbar-thin hidden w-[260px] shrink-0 space-y-2 overflow-y-auto border-l border-border/80 bg-secondary/25 px-4 py-3 sm:block">
              <h2 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {t("Sample context")}
              </h2>
              {suggestions.slice(-2).map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="rounded-xl border border-border/80 bg-card p-3"
                >
                  <h3 className="flex items-start gap-1.5 text-[10px] font-semibold leading-relaxed text-primary">
                    <Lightbulb
                      size={12}
                      className="mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                    {suggestion.title}
                  </h3>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
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
