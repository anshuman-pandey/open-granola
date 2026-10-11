import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "darwin")
  throw new Error("The macOS preview must be packaged on macOS");
const commit = process.env.OPEN_GRANOLA_BUILD_COMMIT;
if (!/^[a-f0-9]{40}$/.test(commit || ""))
  throw new Error("Set OPEN_GRANOLA_BUILD_COMMIT to the full build commit");
const bundles = join(
  root,
  "src-tauri/target/aarch64-apple-darwin/release/bundle",
);
const application = join(bundles, "macos/Open Granola.app");
const worker = join(application, "Contents/MacOS/open-granola-inference");
if (!existsSync(worker))
  throw new Error("The inference worker is missing from the application");

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status})`);
  return result.stdout;
}

run("/usr/bin/codesign", ["--verify", "--deep", "--strict", application]);
for (const [path, required] of [
  [
    application,
    [
      "com.apple.security.app-sandbox",
      "com.apple.security.device.audio-input",
      "com.apple.security.network.client",
    ],
  ],
  [worker, ["com.apple.security.app-sandbox", "com.apple.security.inherit"]],
]) {
  const entitlements = run(
    "/usr/bin/codesign",
    ["--display", "--entitlements", "-", path],
    true,
  );
  for (const key of required) {
    const property = `<key>${key}</key>`;
    if (
      !entitlements.includes(property) ||
      !/^\s*<true\s*\/>/.test(entitlements.split(property)[1])
    ) {
      throw new Error(`Required entitlement missing: ${key}`);
    }
  }
}
const architecture = run("/usr/bin/lipo", ["-archs", worker], true).trim();
if (architecture !== "arm64")
  throw new Error(`Unexpected inference worker architecture: ${architecture}`);

const output = join(root, "artifacts/macos-preview");
mkdirSync(output, { recursive: true });
const images = readdirSync(join(bundles, "dmg")).filter((name) =>
  name.endsWith(".dmg"),
);
if (images.length !== 1) throw new Error("Expected exactly one DMG installer");
const imageName = images[0];
copyFileSync(join(bundles, "dmg", imageName), join(output, imageName));
const archiveName = "Open-Granola-macos-arm64.app.zip";
run("/usr/bin/ditto", [
  "-c",
  "-k",
  "--sequesterRsrc",
  "--keepParent",
  application,
  join(output, archiveName),
]);
const checksums = [imageName, archiveName].map((name) => {
  const digest = createHash("sha256")
    .update(readFileSync(join(output, name)))
    .digest("hex");
  return `${digest}  ${name}`;
});
writeFileSync(join(output, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`);
writeFileSync(
  join(output, "BUILD.json"),
  `${JSON.stringify(
    {
      commit,
      version: JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
        .version,
      architecture: "arm64",
      minimum_macos: "14.4",
      signing: "ad-hoc; no Developer ID or notarization",
      validation:
        "Automated build, signature, helper entitlement and checksum checks only. Hardware recording and installation are untested.",
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  join(output, "READ-ME.txt"),
  `Open Granola development preview\nBuild: ${commit}\n\nApple Silicon only; macOS 14.4 or later. This candidate is ad-hoc signed and is not notarized by Apple. It is intended for validation, not a claim of a production release. Follow Apple's documented per-app opening flow only if you trust this source; do not disable Gatekeeper globally.\n\nWhisper must be installed manually. Recording currently captures the microphone only. Cloud summarizers send text to your chosen provider after opt-in. Read docs/RELEASING.md, README.md and PRIVACY.md at this commit before testing.\n\nVerify with: shasum -a 256 -c SHA256SUMS.txt\n`,
);
console.log(`Prepared macOS validation candidate for ${commit}.`);
