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
    expect(screen.getByText("The release is ready.")).toBeInTheDocument();
    expect(screen.getByText("Unknown speaker")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search this transcript" }),
      { target: { value: "confirm" } },
    );
    expect(screen.queryByText("The release is ready.")).not.toBeInTheDocument();
    expect(screen.getByText("Let’s confirm the date.")).toBeInTheDocument();
  });

  it("exports source transcript, participant names, decisions and checkbox state", () => {
    const markdown = meetingMarkdown(meeting, [
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
    expect(markdown).toContain("The release is ready.");
  });
});
