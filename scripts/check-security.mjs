import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const productionDirectives = {
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ['ipc:', 'http://ipc.localhost'],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'frame-src': ["'none'"],
  'frame-ancestors': ["'none'"],
};

function sameMembers(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && new Set(actual).size === actual.length
    && actual.every((value) => expected.includes(value));
}

export function validateCsp(value, { development = false } = {}) {
  if (typeof value !== 'string') throw new Error('CSP must be an explicit string');
  const expected = { ...productionDirectives };
  if (development) {
    expected['connect-src'] = [...expected['connect-src'], 'http://127.0.0.1:1420', 'ws://127.0.0.1:1420'];
  }
  const parsed = new Map();
  for (const part of value.split(';').map((item) => item.trim()).filter(Boolean)) {
    const [directive, ...sources] = part.split(/\s+/);
    if (parsed.has(directive)) throw new Error(`Duplicate CSP directive: ${directive}`);
    if (!Object.hasOwn(expected, directive)) throw new Error(`Unreviewed CSP directive: ${directive}`);
    if (!sameMembers(sources, expected[directive])) throw new Error(`Unsafe or unexpected ${directive}: ${sources.join(' ')}`);
    parsed.set(directive, sources);
  }
  for (const directive of Object.keys(expected)) {
    if (!parsed.has(directive)) throw new Error(`Missing CSP directive: ${directive}`);
  }
}

export function validateCapabilities(capabilities) {
  if (capabilities.length !== 1) throw new Error('Review new capability files before granting permissions');
  const capability = capabilities[0];
  if (capability.identifier !== 'main-capability' || capability.remote || capability.webviews || capability.local === false) {
    throw new Error('Capabilities must only apply to local application content');
  }
  if (!sameMembers(capability.windows, ['main'])) throw new Error('Unexpected privileged windows');
  if (!sameMembers(capability.permissions, ['core:event:allow-listen', 'core:event:allow-unlisten'])) {
    throw new Error('Only backend event subscription permissions are approved');
  }
}

// This catches accidental first-party networking. It is not a sandbox, an
// exhaustive code audit, or proof that transitive dependencies cannot network.
export function validateSource(source, filename) {
  const production = filename.endsWith('.rs')
    ? source.split(/#\[cfg\([^\]]*\btest\b[^\]]*\)\]\s*mod\s+tests\b/)[0]
    : source;
  const withoutCommentLines = production.replace(/^\s*\/\/.*$/gm, '');
  const networkCall = /\b(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\s*\(|EventSource\s*\(|sendBeacon\s*\(|(?:TcpStream|TcpSocket)::connect|(?:UdpSocket|TcpListener)::bind|(?:reqwest|ureq|hyper)::)/;
  const reviewedProvider = /(?:^|\/)src-tauri\/src\/(?:providers|auth)\.rs$/.test(filename.replaceAll('\\', '/'));
  if (reviewedProvider) {
    // Reviewed native modules own HTTP. Keep browser networking and other HTTP
    // implementations forbidden; runtime endpoint/consent tests cover routing.
    if (!production.includes('.no_proxy()') || !production.includes('reqwest::redirect::Policy::none()')) {
      throw new Error(`Provider transport must disable proxies and redirects: ${filename}`);
    }
    if (/\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|ureq::|hyper::)/.test(withoutCommentLines)) {
      throw new Error(`Unreviewed provider transport in ${filename}`);
    }
  } else if (networkCall.test(withoutCommentLines)) throw new Error(`Unreviewed networking in ${filename}`);
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

export function checkRepository(directory = root) {
  const config = JSON.parse(readFileSync(join(directory, 'src-tauri/tauri.conf.json'), 'utf8'));
  validateCsp(config.app.security.csp);
  validateCsp(config.app.security.devCsp, { development: true });
  if (!sameMembers(config.app.security.capabilities, ['main-capability'])) throw new Error('Unexpected enabled capabilities');
  if (config.app.security.dangerousDisableAssetCspModification) throw new Error('Tauri CSP injection must stay enabled');
  if (!sameMembers(config.bundle.externalBin, ['binaries/open-granola-inference'])) throw new Error('Only the fixed local inference worker may be bundled');
  if (config.bundle.macOS.entitlements !== 'entitlements.plist') throw new Error('Main application must use the reviewed entitlements');
  const macos = JSON.parse(readFileSync(join(directory, 'src-tauri/tauri.macos.conf.json'), 'utf8'));
  if (Object.keys(macos).some((key) => !['$schema', 'bundle'].includes(key))) throw new Error('Platform configuration must not override security policy');
  if (Object.keys(macos.bundle).some((key) => !['externalBin', 'macOS'].includes(key))) throw new Error('Unreviewed macOS bundle override');
  if (!sameMembers(Object.keys(macos.bundle.macOS), ['files']) || !sameMembers(Object.keys(macos.bundle.macOS.files), ['MacOS/open-granola-inference'])) throw new Error('Unreviewed macOS signing or executable override');
  if (!sameMembers(macos.bundle.externalBin, [])) throw new Error('macOS helper must keep its own signing entitlements');
  if (macos.bundle.macOS.files?.['MacOS/open-granola-inference'] !== 'binaries/open-granola-inference') throw new Error('Unexpected macOS worker location');
  validateCapabilities(files(join(directory, 'src-tauri/capabilities')).map((path) => JSON.parse(readFileSync(path, 'utf8'))));
  for (const path of [...files(join(directory, 'src')), ...files(join(directory, 'src-tauri/src')), ...files(join(directory, 'src-tauri/inference-worker/src'))]) {
    if (/\.(?:rs|[jt]sx?)$/.test(path) && !/\.(?:test|spec)\./.test(path)) validateSource(readFileSync(path, 'utf8'), path);
  }
  const entitlements = readFileSync(join(directory, 'src-tauri/entitlements.plist'), 'utf8');
  const entitlementKeys = [...entitlements.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1]);
  if (!sameMembers(entitlementKeys, ['com.apple.security.device.audio-input', 'com.apple.security.device.microphone', 'com.apple.security.app-sandbox', 'com.apple.security.network.client', 'com.apple.security.network.server', 'com.apple.security.files.user-selected.read-write'])) throw new Error('Unreviewed application entitlement');
  for (const key of ['com.apple.security.network.client', 'com.apple.security.network.server']) {
    if (!entitlements.includes(`<key>${key}</key>\n    <true/>`)) throw new Error('Provider networking entitlement missing');
  }
  if (!/<key>com\.apple\.security\.app-sandbox<\/key>\s*<true\s*\/>/.test(entitlements)) throw new Error('App Sandbox must be enabled');
  const helperEntitlements = readFileSync(join(directory, 'src-tauri/inference-worker/entitlements.plist'), 'utf8');
  const helperKeys = [...helperEntitlements.matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1]);
  if (!sameMembers(helperKeys, ['com.apple.security.app-sandbox', 'com.apple.security.inherit'])) throw new Error('Worker must only inherit the application sandbox');
  for (const key of helperKeys) {
    if (!helperEntitlements.includes(`<key>${key}</key>\n    <true/>`)) throw new Error('Worker sandbox entitlements must be enabled');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    checkRepository();
    console.log('Security configuration and first-party network regression checks passed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
