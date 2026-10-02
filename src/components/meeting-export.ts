import type { ActionItem, Meeting } from "../lib/types";
import { fmtTs } from "../hooks/useLiveSession";

export function meetingMarkdown(
  meeting: Meeting,
  actions: ActionItem[],
): string {
  const lines = [
    `# ${meeting.title}`,
    "",
    `Date: ${new Date(meeting.date).toLocaleString()}`,
    `Duration: ${meeting.durationMin} minutes`,
    `Participants: ${meeting.participants.map((p) => p.name).join(", ") || "Not recorded"}`,
    "",
    "## Summary",
    "",
    meeting.summary || "No summary available.",
    "",
  ];
  if (meeting.processingHistory?.length) {
    lines.push("## Summary processing history", "", "Destinations recorded for summary attempts. Failed attempts may still have sent text. A local endpoint may forward requests according to its own configuration.", "");
    for (const run of meeting.processingHistory) {
      lines.push(`- ${run.started_at}: ${run.status}; ${run.provider}; model: ${run.model}; destination: ${run.endpoint || "built-in local model"}; ${run.off_device ? "remote text processing" : "local processing route"}`);
    }
    lines.push("");
  }
  if (meeting.chapters.length) {
    lines.push("## Chapters", "");
    meeting.chapters.forEach((c) =>
      lines.push(`### ${c.timestamp} — ${c.title}`, "", c.body, ""),
    );
  }
  if (meeting.decisions.length)
    lines.push(
      "## Decisions",
      "",
      ...meeting.decisions.map((d) => `- ${d}`),
      "",
    );
  if (actions.length)
    lines.push(
      "## Action items",
      "",
      ...actions.map(
        (a) =>
          `- [${a.done ? "x" : " "}] ${a.text} (${a.owner}${a.due ? ` · ${a.due}` : ""})`,
      ),
      "",
    );
  if (meeting.transcript.length) {
    lines.push("## Transcript", "");
    meeting.transcript.forEach((t) => {
      const person = meeting.participants.find((p) => p.id === t.speakerId);
      lines.push(
        `**${fmtTs(t.start)} · ${person?.name ?? "Unknown speaker"}**`,
        "",
        t.text,
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
