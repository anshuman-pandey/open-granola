import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import type { SearchHit } from "../lib/backend";

const hit = (id: string): SearchHit => ({
  id,
  kind: "meeting",
  title: `Meeting ${id}`,
  sub: "Saved meeting",
  ref: id,
});

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.useRealTimers());

describe("library search", () => {
  it("ignores a slower response from an older query", async () => {
    let resolveOld!: (hits: SearchHit[]) => void;
    let resolveNew!: (hits: SearchHit[]) => void;
    const searchFn = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<SearchHit[]>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<SearchHit[]>((resolve) => {
            resolveNew = resolve;
          }),
      );
    render(
      <CommandPalette
        meetings={[]}
        onClose={vi.fn()}
        onOpenMeeting={vi.fn()}
        onOpenActions={vi.fn()}
        searchFn={searchFn}
      />,
    );
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "old" } });
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.change(input, { target: { value: "new" } });
    await act(() => vi.advanceTimersByTimeAsync(250));
    await act(async () => resolveNew([hit("new")]));
    expect(
      screen.getByRole("option", { name: /Meeting new/ }),
    ).toBeInTheDocument();
    await act(async () => resolveOld([hit("old")]));
    expect(
      screen.queryByRole("option", { name: /Meeting old/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Meeting new/ }),
    ).toBeInTheDocument();
  });

  it("opens the action view consistently for Enter and pointer selection", () => {
    const onActions = vi.fn();
    const onMeeting = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette
        meetings={[]}
        actionItems={[
          {
            id: "a",
            text: "Send release notes",
            owner: "You",
            done: false,
            meetingId: "m",
            meetingTitle: "Launch",
          },
        ]}
        onClose={onClose}
        onOpenMeeting={onMeeting}
        onOpenActions={onActions}
      />,
    );
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "release" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onActions).toHaveBeenCalledOnce();
    expect(onMeeting).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
