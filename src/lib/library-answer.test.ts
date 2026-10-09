import { describe, expect, it } from "vitest";
import { MEETINGS, ACTION_ITEMS } from "./data";
import { sampleLibraryAnswer } from "./library-answer";

describe("localized sample shortcuts", () => {
  it.each(["¿Qué decidimos?", "क्या फ़ैसले लिए गए?"])(
    "finds original decisions for %s",
    (question) => {
      const result = sampleLibraryAnswer(question, MEETINGS, ACTION_ITEMS);
      expect(result.sources.length).toBeGreaterThan(0);
      const decisions = MEETINGS.flatMap((meeting) => meeting.decisions);
      expect(decisions.some((decision) => result.text.includes(decision))).toBe(
        true,
      );
    },
  );
  it.each(["¿Qué necesita seguimiento?", "किस पर आगे ध्यान देना है?"])(
    "finds original actions for %s",
    (question) => {
      const result = sampleLibraryAnswer(
        question,
        MEETINGS,
        ACTION_ITEMS,
        (message) =>
          message === "Open actions in the sample library:"
            ? "Translated heading"
            : message,
      );
      expect(result.text).toContain("Translated heading");
      expect(result.text).toContain(
        ACTION_ITEMS.find((item) => !item.done)!.text,
      );
    },
  );
});
