import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// Upstream LFS metadata checked 2026-11-04. This identifies one exact artifact,
// not every compatible Whisper model. No network access or model execution.
export const WHISPER_MODEL = Object.freeze({
  revision: "5359861c739e955e79d9a303bcbc70fb988958b1",
  filename: "ggml-large-v3-turbo.bin",
  size: 1624555275,
  sha256: "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69",
});

export async function verifyFile(path, expected = WHISPER_MODEL) {
  const file = await open(path, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error("Expected a regular model file.");
    if (stat.size !== expected.size) throw new Error(`Size mismatch: expected ${expected.size} bytes, found ${stat.size}.`);
    const hash = createHash("sha256");
    const buffer = Buffer.alloc(1024 * 1024);
    let total = 0;
    while (true) {
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > expected.size) throw new Error("File changed during verification.");
      hash.update(buffer.subarray(0, bytesRead));
    }
    if (total !== expected.size || hash.digest("hex") !== expected.sha256) {
      throw new Error("Checksum mismatch: this is not the pinned upstream artifact. It may be incomplete, modified, or a different model variant.");
    }
    return { bytes: total, sha256: expected.sha256 };
  } finally {
    await file.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: node scripts/verify-whisper-model.mjs <model-file>\nRead-only SHA-256 verification of the pinned upstream GGML large-v3-turbo artifact. No download or installation.");
  } else if (args.length !== 1 || args[0].startsWith("--")) {
    console.error("Usage: node scripts/verify-whisper-model.mjs <model-file>");
    process.exitCode = 2;
  } else {
    try {
      const result = await verifyFile(args[0]);
      console.log(`Verified ${result.bytes} bytes; SHA-256 ${result.sha256}.\nThis verifies artifact identity only, not transcription quality or hardware compatibility.`);
    } catch (error) {
      console.error(`Model verification failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
