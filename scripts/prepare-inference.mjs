import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const native = join(root, 'src-tauri');
const buildEnvironment = { ...process.env };
const args = process.argv.slice(2);
const release = args.includes('--release');
let requestedTarget = process.env.TAURI_ENV_TARGET_TRIPLE || process.env.CARGO_BUILD_TARGET;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--release') continue;
  if (args[index] === '--target' && args[index + 1]) requestedTarget = args[++index];
  else throw new Error(`Unknown worker build option: ${args[index]}`);
}
if (requestedTarget && !/^[a-zA-Z0-9_-]+$/.test(requestedTarget)) throw new Error('Invalid Rust target triple');
if (requestedTarget === 'universal-apple-darwin') throw new Error('Build and combine the worker for both macOS architectures before making a universal bundle');

function tool(name) {
  const installed = join(homedir(), '.cargo', 'bin', `${name}${process.platform === 'win32' ? '.exe' : ''}`);
  return existsSync(installed) ? installed : name;
}

function run(command, commandArgs, capture = false) {
  const result = spawnSync(command, commandArgs, { cwd: root, env: buildEnvironment, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})${capture ? `: ${result.stderr}` : ''}`);
  return result.stdout;
}

const cargo = tool('cargo');
const host = /^host: (.+)$/m.exec(run(tool('rustc'), ['-vV'], true))?.[1];
if (!host) throw new Error('rustc did not report a host target');
const target = requestedTarget || host;
if (release && target.endsWith('apple-darwin') && !buildEnvironment.MACOSX_DEPLOYMENT_TARGET) {
  const config = JSON.parse(readFileSync(join(native, 'tauri.conf.json'), 'utf8'));
  buildEnvironment.MACOSX_DEPLOYMENT_TARGET = config.bundle.macOS.minimumSystemVersion;
}
const features = (process.env.OPEN_GRANOLA_INFERENCE_FEATURES || '').split(',').map((value) => value.trim()).filter(Boolean);
if (features.some((feature) => !['metal', 'cuda'].includes(feature)) || features.length > 1) {
  throw new Error('OPEN_GRANOLA_INFERENCE_FEATURES must be empty, metal, or cuda');
}
// llama.cpp's CMake defaults enable Metal on macOS even when Rust default
// features are disabled. Keep the native backend aligned with our opt-ins.
buildEnvironment.GGML_METAL = features.includes('metal') ? 'ON' : 'OFF';
const metadata = JSON.parse(run(cargo, ['metadata', '--manifest-path', join(native, 'Cargo.toml'), '--no-deps', '--format-version', '1'], true));
const build = ['build', '--manifest-path', join(native, 'inference-worker/Cargo.toml'), '--locked'];
if (release) build.push('--release');
if (requestedTarget) build.push('--target', requestedTarget);
if (features.length) build.push('--features', features.join(','));
run(cargo, build);

const filename = `open-granola-inference${target.includes('windows') ? '.exe' : ''}`;
const output = join(metadata.target_directory, ...(requestedTarget ? [requestedTarget] : []), release ? 'release' : 'debug', filename);
const staging = join(native, 'binaries');
mkdirSync(staging, { recursive: true });
const staged = join(staging, `open-granola-inference-${target}${target.includes('windows') ? '.exe' : ''}`);
copyFileSync(output, staged);
if (process.platform !== 'win32') chmodSync(staged, 0o755);

// macOS uses a custom-file bundle entry to keep the worker's own signature:
// Tauri applies main-app entitlements to ordinary externalBin entries.
if (target.endsWith('apple-darwin')) {
  const macWorker = join(staging, 'open-granola-inference');
  copyFileSync(output, macWorker);
  chmodSync(macWorker, 0o755);
  if (release && process.env.APPLE_SIGNING_IDENTITY) {
    const signing = ['--force', '--sign', process.env.APPLE_SIGNING_IDENTITY, '--options', 'runtime', '--entitlements', join(native, 'inference-worker/entitlements.plist')];
    if (process.env.APPLE_SIGNING_IDENTITY !== '-') signing.push('--timestamp');
    run('/usr/bin/codesign', [...signing, macWorker]);
  } else if (release && process.env.APPLE_CERTIFICATE) {
    throw new Error('Import the Apple signing identity into a keychain first and set APPLE_SIGNING_IDENTITY so the helper can be signed with its own entitlements');
  }
}
console.log(`Prepared ${release ? 'release' : 'debug'} inference worker for ${target}.`);
