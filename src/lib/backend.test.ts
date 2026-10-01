import { describe, expect, it } from "vitest";
import { adaptMeeting, normalizeDatabaseDate } from "./backend";

const row = {
  title: "Design review",
  started_at: "2026-09-30 15:12:13",
  duration_s: 120,
  summary: null,
  chapters: null,
  decisions: null,
  template: null,
  starred: 0,
};

describe("meeting IPC adaptation", () => {
  it("treats SQLite dates as UTC without rewriting explicit offsets", () => {
    expect(normalizeDatabaseDate(row.started_at)).toBe("2026-09-30T15:12:13Z");
    expect(normalizeDatabaseDate("2026-09-30T15:12:13+01:00")).toBe(
      "2026-09-30T15:12:13+01:00",
    );
    expect(normalizeDatabaseDate("2026-09-30T15:12:13Z")).toBe(
      "2026-09-30T15:12:13Z",
    );
  });
  it("keeps valid fields and transcripts when legacy JSON is malformed", () => {
    const meeting = adaptMeeting(
      "meeting-1",
      { ...row, chapters: "{broken", decisions: '["Approved", null, 9]' },
      [
        {
          id: "s",
          start_ms: 73500,
          end_ms: 75500,
          speaker: 3,
          text: "Keep the source.",
        },
      ],
    );
    expect(meeting.chapters).toEqual([]);
    expect(meeting.decisions).toEqual(["Approved"]);
    expect(meeting.transcript[0]).toMatchObject({
      start: 74,
      text: "Keep the source.",
      speakerId: "sp-3",
    });
  });
  it("rejects non-array and invalid chapter data without inventing participants", () => {
    expect(
      adaptMeeting(
        "a",
        { ...row, chapters: '{"title":"bad"}', decisions: '"bad"' },
        [],
      ).chapters,
    ).toEqual([]);
    const meeting = adaptMeeting(
      "a",
      {
        ...row,
        chapters:
          '[null,{}, {"title":"Topic","timestamp":"00:10","body":"Detail"}]',
      },
      [],
    );
    expect(meeting.chapters).toHaveLength(1);
    expect(meeting.participants).toEqual([]);
  });
});
