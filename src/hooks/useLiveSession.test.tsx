import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useLiveSession } from "./useLiveSession";

afterEach(() => vi.useRealTimers());
it("saves a demo once in StrictMode and cancels pending transcript timers", () => {
  vi.useFakeTimers();
  const finish = vi.fn();
  const { result } = renderHook(() => useLiveSession(finish), {
    wrapper: StrictMode,
  });
  act(() => result.current.start());
  act(() => vi.advanceTimersByTime(4000));
  act(() => {
    result.current.stop();
    result.current.stop();
  });
  expect(finish).toHaveBeenCalledTimes(1);
  expect(finish.mock.calls[0][0].length).toBeGreaterThan(0);
  const lines = result.current.lines;
  act(() => vi.advanceTimersByTime(30000));
  expect(result.current.lines).toBe(lines);
});
