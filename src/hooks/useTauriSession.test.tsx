import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveSegment } from "../lib/backend";
import { useTauriSession } from "./useTauriSession";

const backend = vi.hoisted(() => ({
  onSegment: vi.fn(),
  onCaptureError: vi.fn(),
  startCapture: vi.fn(),
  stopCapture: vi.fn(),
  cancelCapture: vi.fn(),
}));
vi.mock("../lib/backend", () => ({ getBackend: () => backend }));

let emit: (segment: LiveSegment) => void;
let unsubscribe: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  unsubscribe = vi.fn();
  backend.onSegment.mockImplementation(async (callback) => {
    emit = callback;
    return unsubscribe;
  });
  backend.onCaptureError.mockResolvedValue(vi.fn());
  backend.startCapture.mockResolvedValue(undefined);
  backend.stopCapture.mockResolvedValue("saved-note");
  backend.cancelCapture.mockResolvedValue(undefined);
});

describe("desktop capture lifecycle", () => {
  it("reports startup failures and removes subscriptions", async () => {
    backend.startCapture.mockRejectedValue(
      new Error("Microphone permission denied"),
    );
    const { result } = renderHook(() => useTauriSession(vi.fn()));
    await act(() => result.current.start());
    expect(result.current.active).toBe(false);
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toContain("Microphone permission denied");
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
  it("stops empty recordings and invokes save completion exactly once", async () => {
    const finish = vi.fn();
    const { result } = renderHook(() => useTauriSession(finish));
    await act(async () => {
      await Promise.all([result.current.start(), result.current.start()]);
    });
    expect(backend.startCapture).toHaveBeenCalledTimes(1);
    await act(async () => {
      await Promise.all([result.current.stop(), result.current.stop()]);
    });
    expect(backend.stopCapture).toHaveBeenCalledExactlyOnceWith(
      [],
      "Meeting notes",
    );
    expect(finish).toHaveBeenCalledExactlyOnceWith("saved-note");
    expect(result.current.active).toBe(false);
  });
  it("preserves timestamps and replaces refined transcript segments", async () => {
    const { result } = renderHook(() => useTauriSession(vi.fn()));
    await act(() => result.current.start());
    act(() => {
      emit({
        start_ms: 17430,
        end_ms: 19380,
        speaker: 2,
        text: "first",
        final_: false,
      });
      emit({
        start_ms: 17430,
        end_ms: 19990,
        speaker: 2,
        text: "refined",
        final_: true,
      });
    });
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]).toMatchObject({
      text: "refined",
      startMs: 17430,
      endMs: 19990,
      speakerId: 2,
    });
  });
  it("retains a failed save for retry and prevents a new recording", async () => {
    backend.stopCapture.mockRejectedValueOnce(new Error("Disk full"));
    const finish = vi.fn();
    const { result } = renderHook(() => useTauriSession(finish));
    await act(() => result.current.start());
    await act(() => result.current.stop());
    expect(result.current.canRetry).toBe(true);
    expect(result.current.lines).toEqual([]);
    expect(result.current.error).toBe("Disk full");
    await act(() => result.current.start());
    expect(backend.startCapture).toHaveBeenCalledTimes(1);
    await act(() => result.current.stop());
    expect(result.current.canRetry).toBe(false);
    expect(finish).toHaveBeenCalledExactlyOnceWith("saved-note");
  });
  it("does not retry a saved note when refreshing the library fails", async () => {
    const finish = vi.fn().mockRejectedValue(new Error("Refresh failed"));
    const { result } = renderHook(() => useTauriSession(finish));
    await act(() => result.current.start());
    await act(() => result.current.stop());
    expect(result.current.canRetry).toBe(false);
    expect(result.current.error).toBe("Refresh failed");
  });
  it("stops the microphone on unmount", async () => {
    const { result, unmount } = renderHook(() => useTauriSession(vi.fn()));
    await act(() => result.current.start());
    unmount();
    expect(backend.cancelCapture).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
  it("cleans up a start that finishes after unmount", async () => {
    let ready!: () => void;
    backend.startCapture.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          ready = resolve;
        }),
    );
    const { result, unmount } = renderHook(() => useTauriSession(vi.fn()));
    let starting!: Promise<void>;
    await act(async () => {
      starting = result.current.start();
      await Promise.resolve();
    });
    unmount();
    await act(async () => {
      ready();
      await starting;
    });
    expect(backend.cancelCapture).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
