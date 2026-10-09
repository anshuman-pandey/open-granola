import { describe, expect, it } from "vitest";
import { MEETINGS, ACTION_ITEMS } from "./data";
import { sampleLibraryAnswer } from "./library-answer";
import { translationCatalogs } from "../i18n/locales";

describe("localized sample shortcuts", () => {
  it.each(["ja", "zh-CN", "zh-TW"] as const)(
    "answers both translated suggestion buttons in %s without rewriting sources",
    (locale) => {
      const catalog = translationCatalogs[locale];
      const t = (message: string) => catalog[message] ?? message;
      const decisions = sampleLibraryAnswer(
        t("What did we decide?"),
        MEETINGS,
        ACTION_ITEMS,
        t,
      );
      expect(decisions.sources.length).toBeGreaterThan(0);
      expect(decisions.text).toContain(
        MEETINGS.flatMap((meeting) => meeting.decisions)[0],
      );
      const actions = sampleLibraryAnswer(
        t("What needs a follow-up?"),
        MEETINGS,
        ACTION_ITEMS,
        t,
      );
      expect(actions.text).toContain(t("Open actions in the sample library:"));
      expect(actions.text).toContain(
        ACTION_ITEMS.find((item) => !item.done)!.text,
      );
    },
  );
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
