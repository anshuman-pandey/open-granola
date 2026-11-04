import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { verifyFile } from "./verify-whisper-model.mjs";

test("streams exact bytes and rejects corruption, truncation, directories and missing files without modifying input", async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-model-"));
  try {
    const path = join(dir, "model.bin");
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 17, 42);
    const expected = { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    await writeFile(path, bytes);
    assert.equal((await verifyFile(path, expected)).bytes, bytes.length);
    bytes[0] = 43;
    await writeFile(path, bytes);
    await assert.rejects(verifyFile(path, expected), /Checksum mismatch/);
    assert.deepEqual(await readFile(path), bytes);
    await writeFile(path, bytes.subarray(0, 100));
    await assert.rejects(verifyFile(path, expected), /Size mismatch/);
    await assert.rejects(verifyFile(dir, expected));
    await assert.rejects(verifyFile(join(dir, "missing"), expected), /ENOENT/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("CLI provides help and fails closed on bad arguments and missing files", () => {
  const run = (...args) => spawnSync(process.execPath, ["scripts/verify-whisper-model.mjs", ...args], { encoding: "utf8" });
  assert.equal(run("--help").status, 0);
  assert.equal(run().status, 2);
  assert.equal(run("--unknown").status, 2);
  assert.equal(run("one", "two").status, 2);
  assert.equal(run("nonexistent-model-for-test.bin").status, 1);
});
