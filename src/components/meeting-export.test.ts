import { describe, expect, it } from "vitest";
import {
  meetingMarkdown,
  obsidianFilename,
  obsidianMarkdown,
} from "./meeting-export";
import { parseDocument } from "yaml";
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

describe("Obsidian export", () => {
  it("parses as YAML properties and preserves content, tasks and original tags", () => {
    const meeting = {
      ...MEETINGS[0],
      title: '设计レビュー: "Launch"\n---\nattacker: true\u2028次の行',
      tags: [
        "project/review",
        "project/review",
        "123",
        "two words",
        "bad//tag",
      ],
    };
    const actions = ACTION_ITEMS.filter(
      (item) => item.meetingId === meeting.id,
    );
    const exportText = obsidianMarkdown(meeting, actions);
    const [, frontmatter, body] = exportText.match(
      /^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/,
    )!;
    const properties = parseDocument(frontmatter);
    expect(properties.errors).toEqual([]);
    expect(properties.toJS()).toEqual({
      title: meeting.title,
      date: new Date(meeting.date).toISOString(),
      source: "Open Granola",
      open_granola_id: meeting.id,
      duration_minutes: meeting.durationMin,
      participants: meeting.participants.map((person) => person.name),
      tags: ["open-granola", "project/review"],
      open_granola_tags: meeting.tags,
    });
    expect(body.trim()).toBe(meetingMarkdown(meeting, actions).trim());
    expect(exportText).toContain(meeting.transcript[0].text);
    for (const action of actions) {
      expect(exportText).toContain(
        `- [${action.done ? "x" : " "}] ${action.text}`,
      );
    }
  });

  it.each(["hi", "es", "ja", "zh-CN", "zh-TW"] as const)(
    "keeps property names stable and localizes the note in %s",
    (locale) => {
      const meeting = MEETINGS[0];
      const text = obsidianMarkdown(meeting, [], {
        t: (message) => translationCatalogs[locale][message] ?? message,
        formatDate: () => "localized date",
      });
      expect(text).toContain(`open_granola_id: "${meeting.id}"`);
      expect(text).toContain(`## ${translationCatalogs[locale].Summary}`);
      expect(text).toContain(meeting.summary);
    },
  );

  it("creates stable, portable names and distinguishes same-title meetings", () => {
    const meeting = {
      ...MEETINGS[0],
      title: '../CON: [设计] ".md"'.repeat(100),
    };
    const filename = obsidianFilename(meeting);
    expect(filename).toBe(obsidianFilename(meeting));
    expect(filename).not.toBe(
      obsidianFilename({ ...meeting, id: `${meeting.id}-other` }),
    );
    expect(filename).toMatch(/^\d{4}-\d{2}-\d{2} .+ [a-f0-9]{16}\.md$/);
    expect(filename.slice(0, -3)).not.toMatch(/[./\\:*?"<>|]/);
    expect(new TextEncoder().encode(filename).length).toBeLessThan(255);
    expect(() => obsidianMarkdown({ ...meeting, date: "invalid" }, [])).toThrow(
      "Invalid meeting date",
    );
    expect(() => obsidianFilename({ ...meeting, date: "invalid" })).toThrow(
      "Invalid meeting date",
    );
  });
});
