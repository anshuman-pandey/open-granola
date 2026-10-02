import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoteView } from "./NoteView";
import { meetingMarkdown } from "./meeting-export";
import type { Meeting } from "../lib/types";

const meeting: Meeting = {
  id: "meeting",
  title: "Project review",
  date: "2026-09-30T10:00:00Z",
  durationMin: 30,
  participants: [
    { id: "sp-2", name: "Speaker 2", initials: "S2", color: "#333333" },
  ],
  summary: "Discussed the rollout.",
  chapters: [],
  decisions: ["Launch on Friday"],
  tags: [],
  template: "Review",
  transcript: [
    { id: "one", speakerId: "sp-2", start: 60, text: "The release is ready." },
    {
      id: "two",
      speakerId: "missing",
      start: 75,
      text: "Let’s confirm the date.",
    },
  ],
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("meeting details", () => {
  it("renders native speaker IDs and unknown speakers without crashing", () => {
    render(<NoteView meeting={meeting} onToggleAction={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Notes" }), {
      key: "ArrowRight",
    });
    expect(screen.getByRole("tab", { name: /Transcript/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /Transcript/ })).toHaveFocus();
    expect(screen.getByText("The release is ready.")).toBeInTheDocument();
    expect(screen.getByText("Unknown speaker")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search this transcript" }),
      { target: { value: "confirm" } },
    );
    expect(screen.queryByText("The release is ready.")).not.toBeInTheDocument();
    expect(screen.getByText("Let’s confirm the date.")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Clear transcript search" }),
    );
    expect(screen.getByText("The release is ready.")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: /Transcript/ }), {
      key: "Home",
    });
    expect(screen.getByRole("tab", { name: "Notes" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("moves keyboard focus from a chapter to its source transcript segment", () => {
    render(
      <NoteView
        meeting={{
          ...meeting,
          chapters: [
            {
              title: "Release readiness",
              timestamp: "01:00",
              body: "Reviewed the release.",
            },
          ],
        }}
        onToggleAction={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Find Release readiness at 01:00 in transcript",
      }),
    );
    expect(screen.getByRole("tab", { name: /Transcript/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("01:00, Speaker 2")).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("focuses the assistant, submits with Enter, and returns focus on Escape", async () => {
    const ask = vi
      .fn()
      .mockResolvedValue("Launch on Friday, according to this meeting.");
    render(<NoteView meeting={meeting} onToggleAction={vi.fn()} askFn={ask} />);
    const trigger = screen.getByRole("button", { name: "Ask" });
    fireEvent.click(trigger);
    const input = screen.getByRole("textbox", {
      name: "Ask the meeting assistant",
    });
    expect(input).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.change(input, { target: { value: "When do we launch?" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(ask).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(ask).toHaveBeenCalledWith("When do we launch?");
    expect(
      await screen.findByText("Launch on Friday, according to this meeting."),
    ).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("shows a pending action save and preserves the error when it fails", async () => {
    let rejectSave!: (error: Error) => void;
    const save = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    render(
      <NoteView
        meeting={meeting}
        onToggleAction={save}
        actionItems={[
          {
            id: "action",
            text: "Ship release",
            owner: "You",
            done: false,
            meetingId: meeting.id,
            meetingTitle: meeting.title,
          },
        ]}
      />,
    );
    const checkbox = screen.getByRole("checkbox", { name: /Ship release/ });
    fireEvent.click(checkbox);
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(/Saving…/)).toBeInTheDocument();
    rejectSave(new Error("Unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That action item could not be saved.",
    );
    expect(checkbox).not.toBeDisabled();
    expect(checkbox).toHaveAttribute("aria-checked", "false");
  });

  it("exports source transcript, decisions, checkbox state and summary provenance", () => {
    const markdown = meetingMarkdown({
      ...meeting,
      processingHistory: [{
        provider: "lm_studio",
        model: "reviewed-local-model",
        endpoint: "http://127.0.0.1:1234/v1",
        off_device: false,
        status: "completed",
        error: null,
        started_at: "2026-09-30T11:00:00Z",
        completed_at: "2026-09-30T11:00:06Z",
      }],
    }, [
      {
        id: "action",
        text: "Ship release",
        owner: "You",
        done: true,
        due: "Friday",
        meetingId: meeting.id,
        meetingTitle: meeting.title,
      },
    ]);
    expect(markdown).toContain("# Project review");
    expect(markdown).toContain("- Launch on Friday");
    expect(markdown).toContain("- [x] Ship release (You · Friday)");
    expect(markdown).toContain("01:00 · Speaker 2");
    expect(markdown).toContain("01:15 · Unknown speaker");
    expect(markdown).toContain("- 2026-09-30T11:00:00Z: completed; lm_studio; model: reviewed-local-model; destination: http://127.0.0.1:1234/v1; local processing route");
    expect(markdown).toContain("The release is ready.");
  });
});
