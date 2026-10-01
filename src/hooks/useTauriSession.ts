import { useCallback, useEffect, useRef, useState } from "react";
import { getBackend, type LiveSegment } from "../lib/backend";
import type { LiveLine } from "./useLiveSession";
import type { LiveSuggestion } from "../lib/types";

const SPEAKER_COLORS = [
  "#E4572E",
  "#2E86AB",
  "#3D9B6C",
  "#C25E8A",
  "#B07A2A",
  "#7C5CBF",
];
type Phase =
  "idle" | "starting" | "recording" | "saving" | "save_failed" | "discarding";

/** Rust owns the final transcript and drains pending audio before saving. */
export function useTauriSession(
  onFinish: (meetingId: string) => Promise<void> | void,
) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [lines, setLines] = useState<LiveLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const subscriptions = useRef<(() => void)[]>([]);
  const mounted = useRef(true);
  const startedAt = useRef(0);
  const backend = getBackend();

  const cleanup = useCallback(() => {
    subscriptions.current.splice(0).forEach((unsubscribe) => unsubscribe());
  }, []);

  const subscribe = useCallback(async () => {
    const unsubscribe = await backend.onSegment((segment: LiveSegment) => {
      if (!mounted.current) return;
      const id = `seg-${segment.start_ms}`;
      const line: LiveLine = {
        id,
        speaker: segment.speaker === 0 ? "Microphone" : `Speaker ${segment.speaker}`,
        color:
          SPEAKER_COLORS[Math.abs(segment.speaker) % SPEAKER_COLORS.length],
        text: segment.text,
        final: segment.final_,
        startMs: segment.start_ms,
        endMs: segment.end_ms,
        speakerId: segment.speaker,
      };
      setLines((previous) => {
        const index = previous.findIndex((item) => item.id === id);
        if (index < 0) return [...previous, line];
        return previous.map((item, i) => (i === index ? line : item));
      });
    });
    subscriptions.current.push(unsubscribe);
    subscriptions.current.push(
      await backend.onCaptureError((message) => {
        if (mounted.current) setError(message);
      }),
    );
  }, [backend]);

  const start = useCallback(async () => {
    // The ref protects against double clicks before React renders the disabled button.
    if (phaseRef.current !== "idle") return;
    phaseRef.current = "starting";
    setPhase("starting");
    setError(null);
    setLines([]);
    setElapsed(0);
    try {
      await subscribe();
      if (!mounted.current) {
        cleanup();
        return;
      }
      await backend.startCapture();
      if (!mounted.current) {
        await backend.cancelCapture();
        cleanup();
        return;
      }
      startedAt.current = Date.now();
      phaseRef.current = "recording";
      setPhase("recording");
    } catch (cause) {
      cleanup();
      phaseRef.current = "idle";
      if (mounted.current) {
        setPhase("idle");
        setError(String(cause instanceof Error ? cause.message : cause));
      }
    }
  }, [backend, cleanup, subscribe]);

  const stop = useCallback(async () => {
    if (phaseRef.current !== "recording" && phaseRef.current !== "save_failed")
      return;
    phaseRef.current = "saving";
    setPhase("saving");
    setError(null);
    let saved = false;
    try {
      // Always stop, including an empty session. Never reconstruct timestamps in JS.
      const id = await backend.stopCapture([], "Meeting notes");
      saved = true;
      if (mounted.current) {
        setLines([]);
        await onFinish(id);
      }
    } catch (cause) {
      if (mounted.current)
        setError(String(cause instanceof Error ? cause.message : cause));
    } finally {
      cleanup();
      phaseRef.current = saved ? "idle" : "save_failed";
      if (mounted.current) setPhase(phaseRef.current);
    }
  }, [backend, cleanup, onFinish]);

  const discard = useCallback(async () => {
    if (phaseRef.current !== "save_failed") return;
    phaseRef.current = "discarding";
    setPhase("discarding");
    try {
      await backend.cancelCapture();
      phaseRef.current = "idle";
      setPhase("idle");
      setLines([]);
      setError(null);
    } catch (cause) {
      phaseRef.current = "save_failed";
      setPhase("save_failed");
      setError(String(cause instanceof Error ? cause.message : cause));
    }
  }, [backend]);

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (backend.mode !== "tauri") return;
    let disposed = false;
    backend
      .modelStatus()
      .then(async (status) => {
        if (disposed || phaseRef.current !== "idle") return;
        if (status.pending_capture === true) {
          phaseRef.current = "save_failed";
          setPhase("save_failed");
          setError(
            "An unsaved recording is waiting in memory. Retry saving or discard it.",
          );
        } else if (status.recording === true) {
          phaseRef.current = "recording";
          startedAt.current = Date.now();
          setPhase("recording");
          try {
            await subscribe();
          } catch {
            setError(
              "Live transcript events could not reconnect. Stop to save the recording.",
            );
          }
          if (disposed) cleanup();
        }
      })
      .catch(() => {
        /* Model status is also available in Settings. */
      });
    return () => {
      disposed = true;
    };
  }, [backend, cleanup, subscribe]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cleanup();
      if (phaseRef.current === "recording")
        void backend.cancelCapture().catch(() => {});
    };
  }, [backend, cleanup]);

  return {
    active: phase === "recording",
    busy: phase === "starting" || phase === "saving" || phase === "discarding",
    phase,
    elapsed,
    lines,
    suggestions: [] as LiveSuggestion[],
    error,
    canRetry: phase === "save_failed",
    discard,
    clearError: () => setError(null),
    start,
    stop,
  };
}
