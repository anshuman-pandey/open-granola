// rustup's default install directory is not always inherited by GUI app shells.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const cargoBin = join(homedir(), ".cargo", "bin");
const env = { ...process.env };
if (existsSync(cargoBin)) env.PATH = `${cargoBin}${delimiter}${env.PATH || ""}`;
const cli = fileURLToPath(
  new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url),
);
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
  shell: false,
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
