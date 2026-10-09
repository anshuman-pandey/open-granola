import { describe, expect, it } from "vitest";
import { meetingMarkdown } from "./meeting-export";
import { MEETINGS, ACTION_ITEMS } from "../lib/data";
import { settingsMessages } from "../i18n/messages-settings";
import { workspaceMessages } from "../i18n/messages-workspace";
import { translationCatalogs } from "../i18n/locales";

describe("localized Markdown export", () => {
  it.each(["ja", "zh-CN", "zh-TW"] as const)(
    "exports %s headings without translating meeting text",
    (locale) => {
      const meeting = MEETINGS[0];
      const catalog = translationCatalogs[locale];
      const markdown = meetingMarkdown(meeting, [], {
        t: (message) => catalog[message] ?? message,
        formatDate: () => "2026年10月10日",
      });
      expect(markdown).toContain(`## ${catalog.Summary}`);
      expect(markdown).toContain(`## ${catalog.Transcript}`);
      expect(markdown).toContain(meeting.title);
      expect(markdown).toContain(meeting.summary);
      expect(markdown).toContain(meeting.transcript[0].text);
    },
  );
  it("translates structure and formats dates while preserving the original note", () => {
    const meeting = MEETINGS[0];
    const catalog = { ...workspaceMessages, ...settingsMessages };
    const markdown = meetingMarkdown(
      meeting,
      ACTION_ITEMS.filter((item) => item.meetingId === meeting.id),
      {
        t: (message) => catalog[message]?.es ?? message,
        formatDate: () => "fecha de prueba",
      },
    );
    expect(markdown).toContain("Fecha: fecha de prueba");
    expect(markdown).toContain("## Resumen");
    expect(markdown).toContain(meeting.title);
    expect(markdown).toContain(meeting.summary);
    expect(markdown).toContain(meeting.transcript[0].text);
  });
});
