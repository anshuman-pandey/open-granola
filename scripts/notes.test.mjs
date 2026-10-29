import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  importTranscript,
  exportTranscript,
  validateTranscriptDocument,
  parseTranscriptDocument,
  transcriptDate,
} from "../src/lib/transcript-interchange.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const sample = readFileSync(
  new URL("../examples/transcripts/standup.og.json", import.meta.url),
  "utf8",
);
const vtt = readFileSync(
  new URL("../examples/transcripts/standup.vtt", import.meta.url),
  "utf8",
);
const options = { title: "Fixture", createdAt: "2026-10-29", format: "vtt" };
const cli = (args, input) =>
  spawnSync(process.execPath, [join(root, "scripts/notes.mjs"), ...args], {
    cwd: tmpdir(),
    input,
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 30 * 1024 * 1024,
  });
const fixture = () => JSON.parse(sample);

test("the public example validates and its caption text/times/voices survive VTT round trips", () => {
  const document = parseTranscriptDocument(sample);
  const imported = importTranscript(vtt.replaceAll("\n", "\r\n"), options);
  assert.deepEqual(imported.notes[0].transcript, document.notes[0].transcript);
  const again = importTranscript(exportTranscript(document, "vtt"), options);
  assert.deepEqual(again.notes[0].transcript, document.notes[0].transcript);
});

test("SRT millisecond timings and multiline Unicode survive import/export", () => {
  const input =
    "1\n00:00:01,234 --> 00:00:03,456\nHola &amp; नमस्ते\n日本語\n\n2\n00:00:03,500 --> 00:00:04,750\n你好\n";
  const parsed = importTranscript(input, { ...options, format: "srt" });
  assert.equal(parsed.notes[0].transcript[0].start, 1.234);
  assert.equal(parsed.notes[0].transcript[0].text, "Hola & नमस्ते\n日本語");
  assert.deepEqual(
    importTranscript(exportTranscript(parsed, "srt"), {
      ...options,
      format: "srt",
    }),
    parsed,
  );
});

test("VTT comments/settings/styling flatten without treating text as executable markup", () => {
  const input =
    "WEBVTT\n\nNOTE ignored comment\nwith metadata\n\nSTYLE\n::cue { color: red; }\n\ncue-1\n01:02.003 --> 01:04.005 align:start\n<v A &amp; B><b>Hello</b> &lt;img&gt; &#x1F600;</v>\n";
  const segment = importTranscript(input, options).notes[0].transcript[0];
  assert.equal(segment.speaker, "A & B");
  assert.equal(segment.text, "Hello <img> 😀");
  assert.equal(segment.start, 62.003);
});

test("invalid cues fail the whole import instead of returning a partial transcript", () => {
  for (const body of [
    "00:00.000 --> 00:00.000\nempty range",
    "00:02.000 --> 00:01.000\nreversed",
    "00:61.000 --> 01:02.000\ninvalid seconds",
    "169:00:00.000 --> 169:00:01.000\ntoo long",
    "00:00.000 --> 00:01.000\n",
    "not a cue",
    "00:00.000 --> 00:01.000\n<v A>one</v><v B>two</v>",
    "00:00.000 --> 00:01.000\nunlabeled <v A>partial</v>",
    "00:00.000 --> 00:01.000\n<v A>partial</v> unlabeled",
    "00:00.000 --> 00:01.000\n&#0;",
    "00:00.000 --> 00:01.000\n&#xD800;",
  ])
    assert.throws(() =>
      importTranscript(
        `WEBVTT\n\n00:00.000 --> 00:01.000\nfirst\n\n${body}`,
        options,
      ),
    );
  assert.throws(() =>
    importTranscript(
      "WEBVTT\n00:00.000 --> 00:01.000\nmissing separator",
      options,
    ),
  );
});

test("plain text is one untimed segment; subtitle export never invents end times", () => {
  const document = importTranscript("One paragraph.\n\nAnother paragraph.", {
    ...options,
    format: "txt",
  });
  assert.deepEqual(document.notes[0].transcript, [
    { start: 0, text: "One paragraph.\n\nAnother paragraph." },
  ]);
  assert.throws(() => exportTranscript(document, "vtt"), /real end time/);
  assert.throws(() => importTranscript(" ", { ...options, format: "txt" }));
});

test("version, field, date, type and range errors are rejected before use", () => {
  for (const mutate of [
    (x) => {
      x.version = 2;
    },
    (x) => {
      x.format = "different-format";
    },
    (x) => {
      x.notes[0].secret = "do not silently drop unknown fields";
    },
    (x) => {
      x.notes[0].created_at = "2026-02-30T00:00:00Z";
    },
    (x) => {
      x.notes[0].created_at = "2026-10-29";
    },
    (x) => {
      x.notes[0].title = "偽".repeat(167);
    },
    (x) => {
      x.notes[0].title = "Forged\nheading";
    },
    (x) => {
      x.notes[0].transcript[0].text = "hello\u001b[31m";
    },
    (x) => {
      x.notes[0].transcript[0].start = NaN;
    },
    (x) => {
      x.notes[0].transcript[0].start = -1;
    },
    (x) => {
      x.notes[0].transcript[0].end = 604801;
    },
    (x) => {
      x.notes[0].transcript[0].end = -1;
    },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => validateTranscriptDocument(value));
  }
  assert.equal(transcriptDate("2024-02-29"), "2024-02-29T00:00:00.000Z");
  assert.equal(
    transcriptDate("2026-10-29T09:00:00+05:30"),
    "2026-10-29T03:30:00.000Z",
  );
  assert.throws(() => transcriptDate("2025-02-29"));
  assert.throws(() => transcriptDate("2026-10-29T09:00:00"));
  assert.throws(() => parseTranscriptDocument('{"private incomplete JSON"'));
});

test("document size and speaker bounds reject oversized inputs", () => {
  const value = fixture();
  value.notes[0].transcript = Array.from({ length: 256 }, (_, i) => ({
    start: i,
    text: "word",
    speaker: `Speaker ${i}`,
  }));
  assert.throws(() => validateTranscriptDocument(value), /speaker labels/);
  assert.throws(
    () => parseTranscriptDocument(" ".repeat(20 * 1024 * 1024 + 1)),
    /size limit/,
  );
  value.notes[0].transcript = [{ start: 0, text: "x".repeat(100001) }];
  assert.throws(() => validateTranscriptDocument(value), /size limit/);
});

test("Markdown encodes hostile imported content as literal text", () => {
  const document = fixture();
  document.notes[0].title = "[click](javascript:alert(1))";
  document.notes[0].summary =
    "<script>alert(1)</script> ![pixel](https://example.test/track)";
  const result = exportTranscript(document, "markdown");
  assert.ok(!result.includes("<script>"));
  assert.ok(!result.includes("![pixel]"));
  assert.ok(result.includes("&lt;script&gt;"));
});

test("subtitle output requires a selection for multiple notes and representable cue text", () => {
  const document = fixture();
  document.notes.push(structuredClone(document.notes[0]));
  assert.throws(() => exportTranscript(document, "vtt"), /Select one/);
  assert.ok(exportTranscript(document, "srt", 1).includes("Alex: I will"));
  assert.throws(() => exportTranscript(document, "vtt", 2), /range/);
  document.notes[0].transcript[0].text = "first\n\nsecond";
  assert.throws(() => exportTranscript(document, "vtt", 0), /blank lines/);
});

test("CLI works outside the repo with only Node and can be piped through stdin", () => {
  const example = cli(["example"]);
  assert.equal(example.status, 0, example.stderr);
  const checked = cli(["validate", "-"], example.stdout);
  assert.equal(checked.status, 0, checked.stderr);
  assert.deepEqual(JSON.parse(checked.stdout), {
    valid: true,
    format: "open-granola.transcript",
    version: 1,
    notes: 1,
    segments: 3,
  });
  const imported = cli(
    [
      "import",
      "-",
      "--from",
      "vtt",
      "--title",
      "CLI fixture",
      "--date",
      "2026-10-29",
    ],
    vtt,
  );
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(JSON.parse(imported.stdout).notes[0].title, "CLI fixture");
  const markdown = cli(["export", "-", "--to", "markdown"], imported.stdout);
  assert.equal(markdown.status, 0, markdown.stderr);
  assert.ok(markdown.stdout.includes("## Transcript"));
  assert.ok(markdown.stdout.includes("我会"));
  const schema = cli(["schema"]);
  assert.equal(schema.status, 0, schema.stderr);
  assert.equal(JSON.parse(schema.stdout).properties.version.const, 1);
});

test("CLI rejects unsafe/ambiguous invocations with no output artifact or transcript in errors", () => {
  for (const args of [
    ["unknown"],
    ["validate", "-", "--to", "json"],
    ["import", "-", "--from", "vtt"],
    ["export", "-", "--to", "vtt", "--note", "0"],
    ["export", "-", "--to", "exe"],
  ]) {
    const result = cli(args, sample);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
  }
  const value = fixture();
  value.version = 200;
  value.notes[0].summary = "CONFIDENTIAL-MEETING-TEXT";
  const result = cli(["validate", "-"], JSON.stringify(value));
  assert.equal(result.status, 1);
  assert.ok(!result.stderr.includes("CONFIDENTIAL"));
  assert.equal(cli(["validate", "-"], Buffer.from([0xff])).status, 1);
  assert.equal(cli(["--help"]).status, 0);
});

test("CLI creates restricted files and refuses overwrite including symlink destinations", () => {
  const directory = mkdtempSync(join(tmpdir(), "granola-tools-test-"));
  try {
    const destination = resolve(directory, "note with spaces.json");
    let result = cli(["example", "--output", destination]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.deepEqual(JSON.parse(readFileSync(destination, "utf8")), fixture());
    if (process.platform !== "win32")
      assert.equal(statSync(destination).mode & 0o777, 0o600);
    writeFileSync(destination, "keep this existing note");
    result = cli(["example", "--output", destination]);
    assert.equal(result.status, 1);
    assert.equal(readFileSync(destination, "utf8"), "keep this existing note");
    if (process.platform !== "win32") {
      const link = join(directory, "symlink.json");
      symlinkSync(destination, link);
      assert.equal(cli(["example", "--output", link]).status, 1);
      assert.equal(
        readFileSync(destination, "utf8"),
        "keep this existing note",
      );
    }
    const invalid = join(directory, "must-not-exist.json");
    assert.equal(
      cli(
        [
          "import",
          "-",
          "--from",
          "srt",
          "--title",
          "bad",
          "--date",
          "2026-10-29",
          "--output",
          invalid,
        ],
        "invalid captions",
      ).status,
      1,
    );
    assert.equal(existsSync(invalid), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
