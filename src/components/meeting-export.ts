import type { ActionItem, Meeting } from "../lib/types";
import { fmtTs } from "../hooks/useLiveSession";
import type { Translate } from "../i18n";

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

export function downloadMarkdown(title: string, markdown: string) {
  const url = URL.createObjectURL(
    new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${
    title
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .trim()
      .slice(0, 100) || "meeting"
  }.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
