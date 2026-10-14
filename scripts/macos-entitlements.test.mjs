import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readEntitlements, requireEntitlements } from "./macos-entitlements.mjs";

const required = ["com.apple.security.app-sandbox", "com.apple.security.inherit"];

function signedFixture(properties, check) {
  const directory = mkdtempSync(join(tmpdir(), "open-granola-entitlements-"));
  try {
    const executable = join(directory, "helper");
    const plist = join(directory, "entitlements.plist");
    copyFileSync("/usr/bin/true", executable);
    writeFileSync(plist, `<?xml version="1.0"?><plist version="1.0"><dict>${Object.entries(properties).map(([key, value]) => `<key>${key}</key><${value ? "true" : "false"}/>`).join("")}</dict></plist>`);
    const signed = spawnSync("/usr/bin/codesign", ["--force", "--sign", "-", "--entitlements", plist, executable], { encoding: "utf8", shell: false });
    assert.equal(signed.status, 0, signed.stderr);
    check(readEntitlements(executable));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("reads true helper entitlements from an actual ad-hoc signature", { skip: process.platform !== "darwin" }, () => {
  signedFixture(Object.fromEntries(required.map((key) => [key, true])), (properties) => {
    assert.deepEqual(Object.keys(properties).sort(), [...required].sort());
    requireEntitlements(properties, required, { exact: true });
  });
});

test("rejects disabled sandbox and extra helper networking in actual signatures", { skip: process.platform !== "darwin" }, () => {
  signedFixture({ "com.apple.security.app-sandbox": false, "com.apple.security.inherit": true }, (properties) => {
    assert.throws(() => requireEntitlements(properties, required, { exact: true }), /Required entitlement missing/);
  });
  signedFixture({ ...Object.fromEntries(required.map((key) => [key, true])), "com.apple.security.network.client": true }, (properties) => {
    assert.throws(() => requireEntitlements(properties, required, { exact: true }), /Unexpected inference helper entitlement/);
  });
});
