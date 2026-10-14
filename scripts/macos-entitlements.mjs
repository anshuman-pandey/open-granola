import { spawnSync } from "node:child_process";

export function readEntitlements(path) {
  // codesign's default display format varies between macOS versions.
  const signed = spawnSync("/usr/bin/codesign", [
    "--display", "--entitlements", "-", "--xml", path,
  ], { encoding: "utf8", shell: false });
  if (signed.error) throw signed.error;
  if (signed.status !== 0) throw new Error("Could not read signing entitlements");
  const converted = spawnSync("/usr/bin/plutil", [
    "-convert", "json", "-o", "-", "--", "-",
  ], { input: signed.stdout, encoding: "utf8", shell: false });
  if (converted.error) throw converted.error;
  if (converted.status !== 0) throw new Error("Signing entitlements are not a valid property list");
  return JSON.parse(converted.stdout);
}

export function requireEntitlements(properties, required, { exact = false } = {}) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    throw new Error("Signing entitlements must be a dictionary");
  }
  for (const key of required) {
    if (properties[key] !== true) throw new Error(`Required entitlement missing: ${key}`);
  }
  if (exact && Object.keys(properties).some((key) => !required.includes(key))) {
    throw new Error("Unexpected inference helper entitlement");
  }
}
