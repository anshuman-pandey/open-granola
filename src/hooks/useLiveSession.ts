import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveSuggestion } from "../lib/types";

export interface LiveLine {
  id: string;
  speaker: string;
  color: string;
  text: string;
  final: boolean;
}

const SCRIPT: { speaker: string; color: string; text: string }[] = [
  { speaker: "You", color: "#E4572E", text: "Alright, let's talk about the onboarding drop-off. Where are people bailing?" },
  { speaker: "Priya Nair", color: "#C25E8A", text: "Step three, the workspace invite screen. Sixty-one percent never get past it." },
  { speaker: "Devon Park", color: "#2E86AB", text: "That screen asks for too much. We could defer invites until after the first project exists." },
  { speaker: "You", color: "#E4572E", text: "Agreed. What does that do to activation if invites move to day two?" },
  { speaker: "Priya Nair", color: "#C25E8A", text: "Based on the beta cohort, activation should rise roughly eight points. Team invites were the friction, not the value prop." },
  { speaker: "Devon Park", color: "#2E86AB", text: "I can have the reordered flow behind a flag by Friday. We'll run it as a fifty-fifty split." },
  { speaker: "You", color: "#E4572E", text: "Perfect. Decision: defer invites, flag-gated rollout Friday, Priya watches the activation dashboard." },
];

const SUGGESTIONS: { at: number; s: Omit<LiveSuggestion, "id"> }[] = [
  {
    at: 2,
    s: {
      kind: "recall",
      title: "From Jul 15 standup",
      body: "Devon flagged onboarding telemetry gaps — the invite screen events shipped Jul 10, so this funnel data is only a week old.",
    },
  },
  {
    at: 4,
    s: {
      kind: "fact",
      title: "Context",
      body: "61% drop-off at step 3 is 3.4× the median step drop-off (18%) across the rest of the funnel.",
    },
  },
  {
    at: 6,
    s: {
      kind: "follow-up",
      title: "Worth asking",
      body: "“Do invited teammates actually activate higher?” — if yes, the fix may be timing, not removal.",
    },
  },
];

export function useLiveSession(onFinish: (lines: LiveLine[]) => void) {
  const [active, setActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lines, setLines] = useState<LiveLine[]>([]);
  const [suggestions, setSuggestions] = useState<LiveSuggestion[]>([]);
  const timers = useRef<number[]>([]);
  const lineCount = useRef(0);

  const clearAll = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const start = useCallback(() => {
    clearAll();
    setLines([]);
    setSuggestions([]);
    setElapsed(0);
    lineCount.current = 0;
    setActive(true);

    let t = 1200;
    SCRIPT.forEach((entry, i) => {
      const id = `live-${i}`;
      timers.current.push(
        window.setTimeout(() => {
          lineCount.current += 1;
          setLines((prev) => [...prev, { id, speaker: entry.speaker, color: entry.color, text: "", final: false }]);
          // stream the line word by word
          const words = entry.text.split(" ");
          words.forEach((_, wi) => {
            timers.current.push(
              window.setTimeout(() => {
                setLines((prev) =>
                  prev.map((l) =>
                    l.id === id ? { ...l, text: words.slice(0, wi + 1).join(" "), final: wi === words.length - 1 } : l,
                  ),
                );
              }, wi * 90),
            );
          });
        }, t),
      );
      t += entry.text.split(" ").length * 90 + 1100;
    });

    SUGGESTIONS.forEach(({ at, s }, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setSuggestions((prev) => [...prev, { ...s, id: `sg-${i}` }]);
        }, at * 2600),
      );
    });
  }, []);

  const stop = useCallback(() => {
    clearAll();
    setActive(false);
    setLines((prev) => {
      const finished = prev.map((l) => ({ ...l, final: true }));
      onFinish(finished);
      return finished;
    });
  }, [onFinish]);

  useEffect(() => {
    if (!active) return;
    const iv = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(iv);
  }, [active]);

  useEffect(() => clearAll, []);

  return { active, elapsed, lines, suggestions, start, stop };
}

export function fmtClock(totalSec: number) {
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function fmtTs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
