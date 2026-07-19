import { useCallback, useEffect, useRef, useState } from "react";
import { getBackend, type LiveSegment } from "../lib/backend";
import type { LiveLine } from "./useLiveSession";

const SPEAKER_COLORS = ["#E4572E", "#2E86AB", "#3D9B6C", "#C25E8A", "#B07A2A", "#7C5CBF"];

function speakerName(s: number) {
  return s === 0 ? "You" : `Speaker ${s}`;
}

/**
 * Real-capture session: drives the Rust pipeline (audio → whisper → segment
 * events) instead of the demo's scripted simulation. Same interface as
 * useLiveSession so the UI doesn't care which one it's holding.
 */
export function useTauriSession(onFinish: (lines: LiveLine[]) => void) {
  const [active, setActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lines, setLines] = useState<LiveLine[]>([]);
  const unlisten = useRef<(() => void) | null>(null);
  const backend = getBackend();

  const start = useCallback(async () => {
    setLines([]);
    setElapsed(0);
    setActive(true);
    // Subscribe before starting so no segments are missed.
    unlisten.current = await backend.onSegment((seg: LiveSegment) => {
      setLines((prev) => {
        const id = `seg-${seg.start_ms}`;
        const line: LiveLine = {
          id,
          speaker: speakerName(seg.speaker),
          color: SPEAKER_COLORS[seg.speaker % SPEAKER_COLORS.length],
          text: seg.text,
          final: seg.final_,
        };
        // Whisper windows can re-emit a refined segment — replace by start_ms.
        const idx = prev.findIndex((l) => l.id === id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = line;
          return next;
        }
        return [...prev, line];
      });
    });
    await backend.startCapture();
  }, [backend]);

  const stop = useCallback(async () => {
    unlisten.current?.();
    unlisten.current = null;
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

  useEffect(
    () => () => {
      unlisten.current?.();
    },
    [],
  );

  // Live assist comes from the Rust side in a later iteration; the panel
  // renders empty-state honestly until then.
  return { active, elapsed, lines, suggestions: [], start, stop };
}
