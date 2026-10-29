// Shared by the desktop importer and the dependency-free Node CLI.
export const TRANSCRIPT_FORMAT = "open-granola.transcript";
export const MAX_TRANSCRIPT_BYTES = 20 * 1024 * 1024;
const maxSeconds = 7 * 24 * 60 * 60;
const bytes = (value) => new TextEncoder().encode(value).length;

function text(value, limit, label, allowEmpty = false) {
  if (
    typeof value !== "string" ||
    (!allowEmpty && !value.trim()) ||
    bytes(value) > limit ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${label} must be text within its documented size limit`);
  }
  return value;
}

function object(value, keys, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new Error(`${label} contains unsupported fields or is not an object`);
  }
}

export function transcriptDate(raw) {
  if (typeof raw !== "string")
    throw new Error("A date with an explicit time zone is required");
  const value = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match)
    throw new Error("Use an ISO date or date-time with an explicit time zone");
  const [, y, m, d, h, min, sec, zone] = match;
  const year = Number(y),
    month = Number(m),
    day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1] ||
    Number(h) > 23 ||
    Number(min) > 59 ||
    Number(sec) > 59 ||
    (zone !== "Z" &&
      (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))
  ) {
    throw new Error("Invalid calendar date or time");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(+parsed)) throw new Error("Invalid date");
  return parsed.toISOString();
}

function seconds(value, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maxSeconds
  ) {
    throw new Error(`${label} must be seconds between 0 and 7 days`);
  }
  return value;
}

/** Validate the whole document before returning a normalized value. Never writes. */
export function validateTranscriptDocument(value) {
  object(value, ["format", "version", "notes"], "Document");
  if (value.format !== TRANSCRIPT_FORMAT || value.version !== 1) {
    throw new Error(
      "Unsupported transcript format or version; expected open-granola.transcript version 1",
    );
  }
  if (
    !Array.isArray(value.notes) ||
    value.notes.length < 1 ||
    value.notes.length > 1000
  ) {
    throw new Error("Document must contain 1 to 1,000 notes");
  }
  const notes = value.notes.map((note, index) => {
    const label = `Note ${index + 1}`;
    object(note, ["title", "created_at", "summary", "transcript"], label);
    const title = text(note.title, 500, `${label} title`).trim();
    if (/[\r\n]/.test(title))
      throw new Error(`${label} title must be a single line`);
    if (typeof note.created_at !== "string" || !note.created_at.includes("T"))
      throw new Error(
        `${label} created_at must be a date-time with a time zone`,
      );
    const created_at = transcriptDate(note.created_at);
    const summary = text(
      note.summary ?? "",
      1_000_000,
      `${label} summary`,
      true,
    );
    if (!Array.isArray(note.transcript) || note.transcript.length > 50_000) {
      throw new Error(
        `${label} transcript must contain at most 50,000 segments`,
      );
    }
    if (!note.transcript.length && !summary.trim())
      throw new Error(`${label} has no content`);
    const speakers = new Set();
    const transcript = note.transcript.map((segment, j) => {
      const part = `${label} segment ${j + 1}`;
      object(segment, ["start", "end", "speaker", "text"], part);
      const result = {
        start: seconds(segment.start, `${part} start`),
        text: text(segment.text, 100_000, part).trim(),
      };
      if (segment.end !== undefined) {
        result.end = seconds(segment.end, `${part} end`);
        if (result.end < result.start)
          throw new Error(`${part} ends before it starts`);
      }
      if (segment.speaker !== undefined) {
        result.speaker = text(segment.speaker, 500, `${part} speaker`).trim();
        if (/[\r\n]/.test(result.speaker))
          throw new Error(`${part} speaker must be a single line`);
        speakers.add(result.speaker);
      }
      return result;
    });
    if (speakers.size > 255)
      throw new Error(`${label} has too many speaker labels`);
    transcript.sort((a, b) => a.start - b.start);
    return { title, created_at, summary, transcript };
  });
  const document = { format: TRANSCRIPT_FORMAT, version: 1, notes };
  if (bytes(JSON.stringify(document, null, 2) + "\n") > MAX_TRANSCRIPT_BYTES) {
    throw new Error("Transcript document is larger than 20 MiB");
  }
  return document;
}

export function parseTranscriptDocument(content) {
  text(content, MAX_TRANSCRIPT_BYTES, "JSON document");
  let value;
  try {
    value = JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Invalid transcript JSON");
  }
  return validateTranscriptDocument(value);
}

function timestamp(raw, format) {
  const pattern =
    format === "srt"
      ? /^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3})$/
      : /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/;
  const m = pattern.exec(raw);
  if (!m) throw new Error("Invalid subtitle timestamp");
  return seconds(
    Number(m[1] || 0) * 3600 +
      Number(m[2]) * 60 +
      Number(m[3]) +
      Number(m[4]) / 1000,
    "Subtitle timestamp",
  );
}

function cueText(raw) {
  // Supported styling is flattened to literal text. No HTML is rendered.
  let speaker;
  const voices = [...raw.matchAll(/<v(?:\.[\w-]+)*\s+([^>]+)>/g)];
  if (voices.length > 1)
    throw new Error(
      "Split cues containing multiple voice spans before importing",
    );
  if (voices.length) {
    if (!raw.trimStart().startsWith(voices[0][0]) || /<\/v>\s*\S/.test(raw)) {
      throw new Error("A voice label must cover the whole cue");
    }
    speaker = voices[0][1].trim();
  }
  const decode = (value) =>
    value.replace(
      /&(?:amp|lt|gt|nbsp|lrm|rlm|#\d+|#x[\da-f]+);/gi,
      (entity) => {
        const named = {
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&nbsp;": "\u00a0",
          "&lrm;": "\u200e",
          "&rlm;": "\u200f",
        };
        if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
        const number = entity.toLowerCase().startsWith("&#x")
          ? parseInt(entity.slice(3, -1), 16)
          : Number(entity.slice(2, -1));
        if (
          !Number.isInteger(number) ||
          number < 1 ||
          number > 0x10ffff ||
          (number >= 0xd800 && number <= 0xdfff)
        )
          throw new Error("Invalid character reference in subtitle");
        return String.fromCodePoint(number);
      },
    );
  const value = decode(
    raw.replace(
      /<\/?(?:b|i|u|c|v|lang|ruby|rt|font)(?:[.\s][^>]*)?>|<(?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3}>/g,
      "",
    ),
  ).trim();
  if (!value || raw.includes("-->"))
    throw new Error("Empty or malformed subtitle cue");
  return { text: value, ...(speaker ? { speaker: decode(speaker) } : {}) };
}

/** Parse the documented caption subset or one untimed UTF-8 text segment. */
export function importTranscript(content, { format, title, createdAt }) {
  text(content, MAX_TRANSCRIPT_BYTES, "Transcript file");
  const normalized = content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  let transcript;
  if (format === "txt") {
    transcript = [{ start: 0, text: normalized }];
  } else if (format === "vtt" || format === "srt") {
    const blocks = normalized.split(/\n[\t ]*\n+/);
    if (format === "vtt") {
      if (
        !/^WEBVTT(?:[\t ].*)?(?:\n|$)/.test(blocks[0]) ||
        blocks[0].includes("-->")
      ) {
        throw new Error(
          "WebVTT needs a WEBVTT header followed by a blank line",
        );
      }
      blocks.shift();
    }
    transcript = [];
    for (const block of blocks) {
      if (
        format === "vtt" &&
        /^(?:NOTE(?:[\t \n]|$)|STYLE(?:\n|$)|REGION(?:\n|$))/.test(block)
      )
        continue;
      const lines = block.split("\n");
      if (!lines[0].includes("-->")) {
        if (format === "srt" && !/^\d+$/.test(lines[0]))
          throw new Error("SRT cues need a numeric index");
        lines.shift();
      }
      const timing = /^(\S+)[\t ]+-->[\t ]+(\S+)(?:[\t ]+.*)?$/.exec(
        lines.shift() || "",
      );
      if (!timing)
        throw new Error(`Invalid ${format.toUpperCase()} cue timing`);
      const start = timestamp(timing[1], format),
        end = timestamp(timing[2], format);
      if (end <= start)
        throw new Error("Subtitle cue end must be after its start");
      transcript.push({ start, end, ...cueText(lines.join("\n")) });
      if (transcript.length > 50_000) throw new Error("Too many subtitle cues");
    }
    if (!transcript.length)
      throw new Error("The subtitle file contains no cues");
  } else
    throw new Error("Choose txt, srt, or vtt as the transcript input format");
  return validateTranscriptDocument({
    format: TRANSCRIPT_FORMAT,
    version: 1,
    notes: [
      { title, created_at: transcriptDate(createdAt), summary: "", transcript },
    ],
  });
}

const literal = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\\`*_\[\]#!|]/g, "\\$&");
const clock = (value, separator = ".") => {
  const ms = Math.round(value * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${separator}${String(ms % 1000).padStart(3, "0")}`;
};

export function exportTranscript(value, format, noteIndex) {
  const document = validateTranscriptDocument(value);
  if (
    noteIndex !== undefined &&
    (!Number.isInteger(noteIndex) ||
      noteIndex < 0 ||
      noteIndex >= document.notes.length)
  )
    throw new Error("Note index is out of range");
  const notes =
    noteIndex === undefined ? document.notes : [document.notes[noteIndex]];
  if (format === "json")
    return JSON.stringify({ ...document, notes }, null, 2) + "\n";
  if (format === "markdown")
    return (
      notes
        .map((note) =>
          [
            `# ${literal(note.title)}`,
            "",
            `Date: ${note.created_at}`,
            "",
            ...(note.summary
              ? ["## Summary", "", literal(note.summary), ""]
              : []),
            "## Transcript",
            "",
            ...note.transcript.flatMap((segment) => [
              `**${clock(segment.start)}${segment.speaker ? ` · ${literal(segment.speaker)}` : ""}**`,
              "",
              literal(segment.text),
              "",
            ]),
          ].join("\n"),
        )
        .join("\n---\n\n") + "\n"
    );
  if (format !== "vtt" && format !== "srt")
    throw new Error("Choose json, markdown, srt, or vtt as the output format");
  if (notes.length !== 1)
    throw new Error("Select one note for subtitle export with --note");
  if (!notes[0].transcript.length)
    throw new Error("This note contains no subtitle cues");
  const escape = (value) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cues = notes[0].transcript.map((segment, index) => {
    if (
      segment.end === undefined ||
      Math.round(segment.end * 1000) <= Math.round(segment.start * 1000)
    ) {
      throw new Error(
        "Subtitle export needs a real end time after every start; timings are never guessed",
      );
    }
    if (/\n[\t ]*\n/.test(segment.text))
      throw new Error(
        "Subtitle text contains blank lines; use JSON or Markdown",
      );
    const content =
      format === "vtt" && segment.speaker
        ? `<v ${escape(segment.speaker)}>${escape(segment.text)}</v>`
        : `${segment.speaker ? `${escape(segment.speaker)}: ` : ""}${escape(segment.text)}`;
    return `${index + 1}\n${clock(segment.start, format === "srt" ? "," : ".")} --> ${clock(segment.end, format === "srt" ? "," : ".")}\n${content}`;
  });
  return (format === "vtt" ? "WEBVTT\n\n" : "") + cues.join("\n\n") + "\n";
}
