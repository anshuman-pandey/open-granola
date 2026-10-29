# Transcript tools and developer workflows

Try the data workflow with **Node 22.12 or later**. The transcript CLI has no runtime dependencies and needs no `npm ci`, Rust, model downloads, account, or running desktop app.

```sh
git clone https://github.com/anshuman-pandey/open-granola.git
cd open-granola
node scripts/notes.mjs validate examples/transcripts/standup.og.json
node scripts/notes.mjs export examples/transcripts/standup.og.json --to markdown
node --test scripts/notes.test.mjs
```

On a feature branch, use that branch's source until it is merged. The checked-in fixture is synthetic and explicitly labeled; it is not a recording or a model-quality demonstration.

## Import an existing transcript

The desktop's **Settings → Import your notes** section accepts JSON, SRT, VTT and UTF-8 `.txt` files, up to 20 MiB. Imports are disabled during active capture. The whole file is validated before a single native import transaction is requested; malformed cues fail rather than importing only part of a transcript.

- SRT and VTT import retain cue start/end times and text. Basic styling is flattened, entities decoded, and VTT voice labels grouped by the desktop's existing speaker-number representation.
- Plain text becomes one untimed segment at zero. No speech recognition or timing alignment is performed. Untimed imports do not acquire an invented end time when exported again.
- Text/subtitle imports use the filename as the title and the import date. Use the CLI to supply the actual meeting date before importing JSON for historical records.
- Import creates new meetings. Reimporting the same file creates another copy. Existing retention settings apply.
- Import does not call a summarizer. In a saved desktop meeting, **Regenerate summary** lets you review the configured destination before explicitly generating notes. Remote providers can charge for those requests.
- Existing legacy JSON imports remain supported. A file's extension alone does not establish that a named provider's proprietary export is compatible.

CLI conversion with an explicit title/date:

```sh
node scripts/notes.mjs import examples/transcripts/standup.vtt \
  --title "Developer standup" --date "2026-10-29T09:00:00Z" \
  --output standup.transcript.json
node scripts/notes.mjs validate standup.transcript.json
```

Import the resulting JSON through Settings. Date-only input to `--date` means midnight UTC; date-times require an explicit time zone. Invalid calendar dates are rejected.

## Export data for another tool

In a meeting, **Export → Transcript JSON** downloads title, date, summary text, source transcript, current speaker labels, and source times in version 1 of the contract below. Native records retain millisecond start/end times; records without a source end time omit it.

This is **transcript interchange, not a full-library backup**. It excludes meeting IDs, action completion state, decisions, chapters, templates, tags, audio, settings, credentials and processing history. Use the existing Markdown or Obsidian export for the readable note and its task states/history. The native importer currently turns named speaker groups into numbered speakers; it does not preserve those names as participant identities.

Standalone conversion:

```sh
node scripts/notes.mjs export standup.transcript.json --to markdown --output standup.md
node scripts/notes.mjs export standup.transcript.json --to vtt --output standup.vtt
node scripts/notes.mjs export standup.transcript.json --to srt --output standup.srt
```

VTT output retains speaker labels as voice spans. SRT output puts speaker labels into literal text prefixes because SRT has no equivalent structured voice field; importing that SRT does not infer identities from the prefixes. Subtitles require real end times after each start. The tool refuses to guess durations for untimed text or older records. Use JSON or Markdown for those records.

For multiple notes, JSON/Markdown can contain the whole document. Select a single note for subtitle output:

```sh
node scripts/notes.mjs export archive.transcript.json --to vtt --note 2
```

`--note` is a 1-based index. It can also select one note for JSON/Markdown output. No destination application is launched automatically.

## Use the CLI in a pipeline

Every command writes to stdout unless `--output` names a new file. Diagnostics go to stderr; validation outputs counts and format/version metadata, not meeting content.

```sh
node scripts/notes.mjs example | node scripts/notes.mjs validate -
node scripts/notes.mjs example | node scripts/notes.mjs export - --to markdown
```

For imported text from stdin, specify the input type:

```sh
node scripts/notes.mjs import - --from txt --title "Review" --date "2026-10-29"
```

Enter the transcript on stdin, then close stdin using your terminal's normal EOF action. Scripts can pipe their own UTF-8 text to the same command.

`--output` refuses existing files and symlink destinations. Created files request owner-only permissions where the operating system supports them. Shell redirection such as `> existing.md` has the shell's ordinary overwrite behavior. Choose the destination deliberately: exported files are outside the app's retention/deletion controls.

Successful commands exit with 0. Invalid input, incompatible output, unknown options and file errors exit with 1. The CLI never opens the live database, records audio, downloads a model, calls an LLM, executes imported text, or fetches a schema URL.

## The versioned contract

The [JSON Schema](../schemas/transcript-v1.schema.json), [synthetic JSON](../examples/transcripts/standup.og.json), [VTT equivalent](../examples/transcripts/standup.vtt), and shared parser are checked in. Print the schema with:

```sh
node scripts/notes.mjs schema
```

```json
{
  "format": "open-granola.transcript",
  "version": 1,
  "notes": [{
    "title": "Synthetic example",
    "created_at": "2026-10-29T09:00:00Z",
    "summary": "Optional summary text, not a claim of verified AI output.",
    "transcript": [{
      "start": 1.234,
      "end": 3.456,
      "speaker": "Supplied label",
      "text": "The source words."
    }]
  }]
}
```

Times are finite seconds from the start, bounded to seven days. Segments are sorted by start time without merging overlapping cues. Labels come from input, not speaker recognition. The normalizer writes dates in UTC. `end`, `speaker` and `summary` are optional; an empty transcript needs nonempty summary text.

Runtime validation adds constraints JSON Schema cannot fully express here: title ≤500 UTF-8 bytes; summary ≤1,000,000 bytes; segment text ≤100,000 bytes; at most 1,000 notes, 50,000 segments and 255 distinct labels per note; serialized JSON ≤20 MiB; valid calendar dates; ordered start/end; and no unsupported fields or disallowed control characters. Subtitle text containing blank lines cannot be rendered as a single cue. UTF-8 decoding is strict.

The supported caption subset covers ordinary timed SRT/VTT cues, multiline text, optional VTT cue identifiers/settings, basic styling and one voice span covering an entire cue. VTT NOTE/STYLE/REGION blocks are ignored as presentation metadata. Multiple voice spans within a cue must be split first. This is not a subtitle renderer, word-alignment tool, audio importer, or universal meeting-service migration tool. Layout/styling and cue identifiers are not preserved.

Unknown contract versions fail, including at the native import boundary. A future format change must introduce a supported migration or version change rather than silently interpreting new fields as old data.

## Build an integration without a server

The dependency-free module can be imported from source by another repository script:

```js
import { readFile } from "node:fs/promises";
import { parseTranscriptDocument } from "./src/lib/transcript-interchange.mjs";

const document = parseTranscriptDocument(await readFile("standup.transcript.json", "utf8"));
for (const note of document.notes) {
  console.log(JSON.stringify({ title: note.title, segments: note.transcript.length }));
}
```

Use arrays of arguments when invoking the CLI from another language; do not interpolate meeting text into a shell command. The application remains a private npm package; no published SDK or package-manager release is promised by these source-level tools. No MCP server or listening HTTP port is enabled.

## Contribute and verify

```sh
npm run test:tools
npm ci
npm run check
```

`npm run test:tools` uses only Node; npm does not install dependencies just to run it. The standalone Developer tools workflow runs this path on Linux, macOS and Windows with Node 22 and 24 before a native build is needed. Main CI also runs frontend import/export tests and Rust tests that load the same example into a real in-memory database, as well as the existing security/build checks.

Useful contributions include a minimized failing caption fixture, a format improvement with before/after examples, or a translation review. Include the exact command, Node/OS version, expected text/times, and a **synthetic** fixture. A passing parser/IPC test does not establish real recording, provider compatibility, packaged installation or transcription accuracy.
