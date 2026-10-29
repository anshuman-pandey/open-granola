#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parseArgs } from "node:util";
import {
  MAX_TRANSCRIPT_BYTES,
  exportTranscript,
  importTranscript,
  parseTranscriptDocument,
} from "../src/lib/transcript-interchange.mjs";

const help = `Open Granola transcript tools (Node 22.12+, no dependency installation)

  node scripts/notes.mjs example
  node scripts/notes.mjs schema
  node scripts/notes.mjs validate <file|->
  node scripts/notes.mjs import <file|-> --title <title> --date <ISO-date> [--from srt|vtt|txt]
  node scripts/notes.mjs export <file|-> --to json|markdown|srt|vtt [--note <1-based-index>]

All commands support --output <new-file>; otherwise results go to stdout.
Existing files are never overwritten by --output. A shell's > redirection has
its normal overwrite behavior. Standard input needs --from for text import.
No models, native build, database access, network requests, or LLM calls.
The versioned transcript format is not a full-library backup.
`;

async function input(path) {
  const stream = path === "-" ? process.stdin : createReadStream(path);
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += Buffer.byteLength(chunk);
      if (size > MAX_TRANSCRIPT_BYTES)
        throw new Error("Input is larger than 20 MiB");
      chunks.push(Buffer.from(chunk));
    }
  } finally {
    if (path !== "-") stream.destroy();
  }
  // A decoder in fatal mode catches malformed UTF-8 instead of silently changing it.
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks),
  );
}

async function output(content, path) {
  if (!path) {
    await new Promise((resolve, reject) =>
      process.stdout.write(content, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    return;
  }
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(content, "utf8");
  } finally {
    await file.close();
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      from: { type: "string" },
      to: { type: "string" },
      title: { type: "string" },
      date: { type: "string" },
      note: { type: "string" },
      output: { type: "string" },
    },
  });
  if (values.help || !positionals.length) {
    process.stdout.write(help);
    return;
  }
  const [command, path] = positionals;
  const allowed = {
    example: ["output"],
    schema: ["output"],
    validate: ["output"],
    import: ["from", "title", "date", "output"],
    export: ["to", "note", "output"],
  };
  if (!Object.hasOwn(allowed, command))
    throw new Error("Unknown command; use --help");
  if (Object.keys(values).some((key) => !allowed[command].includes(key)))
    throw new Error("Option does not apply to this command; use --help");
  if (
    positionals.length !==
    (command === "example" || command === "schema" ? 1 : 2)
  ) {
    throw new Error(
      "Expected exactly one input path (or - for stdin); use --help",
    );
  }
  if (command === "example" || command === "schema") {
    const relative =
      command === "example"
        ? "../examples/transcripts/standup.og.json"
        : "../schemas/transcript-v1.schema.json";
    await output(
      await readFile(new URL(relative, import.meta.url), "utf8"),
      values.output,
    );
    return;
  }
  const content = await input(path);
  if (command === "import") {
    if (!values.title || !values.date)
      throw new Error(
        "Import requires --title and --date (use the actual meeting date)",
      );
    const format = values.from || extname(path).slice(1).toLowerCase();
    const document = importTranscript(content, {
      format,
      title: values.title,
      createdAt: values.date,
    });
    await output(exportTranscript(document, "json"), values.output);
  } else {
    const document = parseTranscriptDocument(content);
    if (command === "validate") {
      await output(
        JSON.stringify({
          valid: true,
          format: document.format,
          version: document.version,
          notes: document.notes.length,
          segments: document.notes.reduce(
            (n, note) => n + note.transcript.length,
            0,
          ),
        }) + "\n",
        values.output,
      );
    } else {
      if (!values.to) throw new Error("Export requires --to; use --help");
      if (values.note !== undefined && !/^[1-9]\d*$/.test(values.note))
        throw new Error("--note must be a positive integer");
      await output(
        exportTranscript(
          document,
          values.to,
          values.note === undefined ? undefined : Number(values.note) - 1,
        ),
        values.output,
      );
    }
  }
}

main().catch((error) => {
  process.stderr.write(`notes: ${error.message}\n`);
  process.exitCode = 1;
});
