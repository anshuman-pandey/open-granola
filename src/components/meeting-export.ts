import type { ActionItem, Meeting } from "../lib/types";
import { fmtTs } from "../hooks/useLiveSession";
import type { Translate } from "../i18n";
import {
  TRANSCRIPT_FORMAT,
  exportTranscript,
  transcriptDate,
} from "../lib/transcript-interchange.mjs";

/** Portable transcript and summary text; intentionally not a full-library backup. */
export function meetingTranscriptJson(meeting: Meeting): string {
  return exportTranscript(
    {
      format: TRANSCRIPT_FORMAT,
      version: 1,
      notes: [
        {
          title: meeting.title,
          created_at: transcriptDate(meeting.date),
          summary: meeting.summary,
          transcript: meeting.transcript.map((segment) => ({
            start: segment.start,
            ...(segment.end === undefined ? {} : { end: segment.end }),
            text: segment.text,
            speaker:
              meeting.participants.find(
                (person) => person.id === segment.speakerId,
              )?.name ?? "Unknown speaker",
          })),
        },
      ],
    },
    "json",
  );
}

export function downloadTranscriptJson(meeting: Meeting) {
  downloadText(
    meetingTranscriptJson(meeting),
    obsidianFilename(meeting).replace(/\.md$/, ".transcript.json"),
    "application/json;charset=utf-8",
  );
}

export function meetingMarkdown(
  meeting: Meeting,
  actions: ActionItem[],
  options: {
    t?: Translate;
    formatDate?: (
      date: Date | string | number,
      options?: Intl.DateTimeFormatOptions,
    ) => string;
  } = {},
): string {
  const t = options.t ?? ((message: string) => message);
  const date = options.formatDate
    ? options.formatDate(meeting.date, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : new Date(meeting.date).toLocaleString();
  const lines = [
    `# ${meeting.title}`,
    "",
    `${t("Date")}: ${date}`,
    `${t("Duration")}: ${meeting.durationMin} ${t("minutes")}`,
    `${t("Participants")}: ${meeting.participants.map((p) => p.name).join(", ") || t("Not recorded")}`,
    "",
    `## ${t("Summary")}`,
    "",
    meeting.summary || t("No summary available."),
    "",
  ];
  if (meeting.processingHistory?.length) {
    lines.push(
      `## ${t("Summary processing history")}`,
      "",
      t(
        "Destinations recorded for summary attempts. Failed attempts may still have sent text. A local endpoint may forward requests according to its own configuration.",
      ),
      "",
    );
    for (const run of meeting.processingHistory) {
      lines.push(
        `- ${run.started_at}: ${run.status}; ${run.provider}; ${t("model")}: ${run.model}; ${t("destination")}: ${run.endpoint || t("Built-in local model")}; ${t(run.off_device ? "remote text processing" : "local processing route")}${run.summary_language ? `; ${t("Summary language")}: ${run.summary_language}` : ""}`,
      );
    }
    lines.push("");
  }
  if (meeting.chapters.length) {
    lines.push(`## ${t("Chapters")}`, "");
    meeting.chapters.forEach((c) =>
      lines.push(`### ${c.timestamp} — ${c.title}`, "", c.body, ""),
    );
  }
  if (meeting.decisions.length)
    lines.push(
      `## ${t("Decisions")}`,
      "",
      ...meeting.decisions.map((d) => `- ${d}`),
      "",
    );
  if (actions.length)
    lines.push(
      `## ${t("Action items")}`,
      "",
      ...actions.map(
        (a) =>
          `- [${a.done ? "x" : " "}] ${a.text} (${a.owner}${a.due ? ` · ${a.due}` : ""})`,
      ),
      "",
    );
  if (meeting.transcript.length) {
    lines.push(`## ${t("Transcript")}`, "");
    meeting.transcript.forEach((segment) => {
      const person = meeting.participants.find(
        (p) => p.id === segment.speakerId,
      );
      lines.push(
        `**${fmtTs(segment.start)} · ${person?.name ?? t("Unknown speaker")}**`,
        "",
        segment.text,
        "",
      );
    });
  }
  return lines.join("\n");
}

type MarkdownOptions = Parameters<typeof meetingMarkdown>[2];

function yamlValue(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u0085\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** JSON-quoted values are valid YAML and cannot introduce frontmatter keys. */
export function obsidianMarkdown(
  meeting: Meeting,
  actions: ActionItem[],
  options: MarkdownOptions = {},
): string {
  const date = new Date(meeting.date);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid meeting date");
  return [
    "---",
    `title: ${yamlValue(meeting.title)}`,
    `date: ${yamlValue(date.toISOString())}`,
    "source: Open Granola",
    `open_granola_id: ${yamlValue(meeting.id)}`,
    `duration_minutes: ${meeting.durationMin}`,
    `participants: ${yamlValue(meeting.participants.map((person) => person.name))}`,
    `tags: ${yamlValue([...new Set(["open-granola", ...meeting.tags.filter((tag) => /^[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(tag) && /[\p{L}_]/u.test(tag))])])}`,
    `open_granola_tags: ${yamlValue(meeting.tags)}`,
    "---",
    "",
    meetingMarkdown(meeting, actions, options),
  ].join("\n");
}

export function obsidianFilename(meeting: Meeting): string {
  const date = new Date(meeting.date);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid meeting date");
  // A stable ID suffix distinguishes meetings with the same date and title.
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(meeting.id)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  }
  const title =
    [
      ...meeting.title
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N} _-]/gu, "")
        .trim(),
    ]
      .slice(0, 40)
      .join("") || "meeting";
  return `${date.toISOString().slice(0, 10)} ${title} ${hash.toString(16).padStart(16, "0")}.md`;
}

export function downloadMarkdown(
  title: string,
  markdown: string,
  filename?: string,
) {
  const name =
    filename ??
    `${
      title
        .replace(/[^\p{L}\p{N} _-]/gu, "")
        .trim()
        .slice(0, 100) || "meeting"
    }.md`;
  downloadText(markdown, name, "text/markdown;charset=utf-8");
}

function downloadText(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
