import type { ActionItem, Meeting } from "./types";

export interface LibraryAnswer {
  text: string;
  sources: { id: string; title: string }[];
}

/** The browser preview quotes saved sample content; it does not simulate an LLM. */
export function sampleLibraryAnswer(
  question: string,
  meetings: Meeting[],
  actions: ActionItem[],
): LibraryAnswer {
  if (/action|follow.up|next step|\bdue\b|\bowe\b/i.test(question)) {
    const open = actions.filter((item) => !item.done);
    const ids = new Set(open.map((item) => item.meetingId));
    return {
      text: open.length
        ? `Open actions in the sample library:\n\n${open.map((item) => `• ${item.text}\n  ${item.owner}${item.due ? ` · ${item.due}` : ""}`).join("\n\n")}`
        : "There are no open actions in this sample library.",
      sources: meetings.filter((meeting) => ids.has(meeting.id)),
    };
  }
  const terms =
    question
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter(
        (term) =>
          term.length > 2 &&
          !new Set([
            "what",
            "were",
            "the",
            "our",
            "about",
            "across",
            "meetings",
            "are",
            "did",
            "any",
            "and",
            "from",
            "with",
            "tell",
            "show",
            "have",
            "does",
          ]).has(term),
      ) ?? [];
  const matches = meetings
    .map((meeting) => {
      const content = [
        meeting.title,
        meeting.summary,
        ...meeting.transcript.map((segment) => segment.text),
      ]
        .join(" ")
        .toLowerCase();
      return {
        meeting,
        score: terms.filter((term) => content.includes(term)).length,
      };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ meeting }) => meeting);
  const selected =
    /decisi|decid/i.test(question) && matches.length === 0 ? meetings : matches;
  return {
    text: selected.length
      ? selected
          .map(
            (meeting) =>
              `${meeting.title}\n${/decisi|decid/i.test(question) ? meeting.decisions.map((decision) => `• ${decision}`).join("\n") || "No decisions saved." : meeting.summary || "Open the note to read its transcript."}`,
          )
          .join("\n\n")
      : "No matching sample notes found. Try a meeting name or ask about open action items. The desktop app uses your local model to answer free-form questions.",
    sources: selected,
  };
}
