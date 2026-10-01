import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { MEETINGS } from "./lib/data";

const backend = vi.hoisted(() => ({
  mode: "tauri",
  listMeetings: vi.fn(),
  listActionItems: vi.fn(),
  onLibraryChanged: vi.fn(),
  getBrief: vi.fn(),
  getMeeting: vi.fn(),
  modelStatus: vi.fn(),
  onSegment: vi.fn(),
  onCaptureError: vi.fn(),
  startCapture: vi.fn(),
  stopCapture: vi.fn(),
  cancelCapture: vi.fn(),
  listCommitments: vi.fn(),
  toggleAction: vi.fn(),
  search: vi.fn(),
  ask: vi.fn(),
}));
vi.mock("./lib/backend", () => ({ getBackend: () => backend }));

beforeEach(() => {
  vi.clearAllMocks();
  backend.listMeetings.mockResolvedValue([]);
  backend.listActionItems.mockResolvedValue([]);
  backend.onLibraryChanged.mockResolvedValue(vi.fn());
  backend.getBrief.mockResolvedValue(null);
  backend.modelStatus.mockResolvedValue({
    recording: false,
    pending_capture: false,
  });
  backend.listCommitments.mockResolvedValue([]);
  Element.prototype.scrollIntoView = vi.fn();
});

describe("desktop library isolation", () => {
  it("never substitutes demo meetings for an empty desktop library", async () => {
    render(<App />);
    await waitFor(() =>
      expect(
        screen.queryByText("Loading your library…"),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText("Room for your first conversation"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Aurora — Q3 launch plan"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Interactive demo")).not.toBeInTheDocument();
    expect(backend.getMeeting).not.toHaveBeenCalled();
  });
  it("shows a load failure and supports retry without leaking sample actions", async () => {
    backend.listMeetings.mockRejectedValueOnce(new Error("Database locked"));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Database locked",
    );
    expect(
      screen.queryByText("Aurora — Q3 launch plan"),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(backend.listMeetings).toHaveBeenCalledTimes(2);
  });
  it("loads transcript detail only after a meeting is opened", async () => {
    const meeting = {
      ...MEETINGS[0],
      id: "real-note",
      title: "Saved local conversation",
    };
    backend.listMeetings.mockResolvedValue([{ ...meeting, transcript: [] }]);
    backend.getMeeting.mockResolvedValue({ meeting, actionItems: [] });
    render(<App />);
    await screen.findByRole("heading", { name: meeting.title });
    expect(backend.getMeeting).not.toHaveBeenCalled();
    const card = screen
      .getByRole("heading", { name: meeting.title })
      .closest("button")!;
    await userEvent.click(card);
    await waitFor(() =>
      expect(backend.getMeeting).toHaveBeenCalledExactlyOnceWith("real-note"),
    );
    expect(
      await screen.findByRole("heading", { name: meeting.title, level: 1 }),
    ).toBeInTheDocument();
  });
  it("does not restore deleted notes from a stale library response", async () => {
    let resolveOld!: (meetings: typeof MEETINGS) => void;
    backend.listMeetings.mockReturnValueOnce(
      new Promise<typeof MEETINGS>((resolve) => {
        resolveOld = resolve;
      }),
    );
    let changed!: () => void;
    backend.onLibraryChanged.mockImplementationOnce(
      async (callback: () => void) => {
        changed = callback;
        return vi.fn();
      },
    );
    render(<App />);
    await waitFor(() =>
      expect(backend.onLibraryChanged).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      changed();
    });
    await act(async () => {
      resolveOld(MEETINGS);
    });
    expect(
      screen.queryByText("Aurora — Q3 launch plan"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Room for your first conversation"),
    ).toBeInTheDocument();
  });

  it("recovers a pending recording after the webview remounts", async () => {
    backend.modelStatus.mockResolvedValue({
      recording: false,
      pending_capture: true,
    });
    backend.stopCapture.mockResolvedValue("saved-note");
    backend.getMeeting.mockResolvedValue({
      meeting: { ...MEETINGS[0], id: "saved-note" },
      actionItems: [],
    });
    render(<App />);
    await screen.findByRole("button", { name: "Retry saving" });
    await act(async () => {
      await userEvent.click(
        screen.getByRole("button", { name: "Retry saving" }),
      );
    });
    expect(backend.stopCapture).toHaveBeenCalledExactlyOnceWith(
      [],
      "Meeting notes",
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Retry saving" }),
      ).not.toBeInTheDocument(),
    );
  });
});
