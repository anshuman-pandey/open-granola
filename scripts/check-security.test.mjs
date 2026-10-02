import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkRepository, validateCapabilities, validateCsp, validateSource } from './check-security.mjs';

const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const capability = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/main-capability.json', import.meta.url), 'utf8'));

test('repository has restricted production and development policies', () => checkRepository());
test('CSP rejects a remote origin even next to an approved origin', () => {
  assert.throws(() => validateCsp(config.app.security.csp.replace('connect-src ipc:', 'connect-src https://upload.example ipc:')));
});
test('CSP rejects missing restrictions, wildcard scripts, duplicate directives and dev endpoints in release', () => {
  for (const value of [
    config.app.security.csp.replace("form-action 'none';", ''),
    config.app.security.csp.replace("script-src 'self'", "script-src *"),
    `${config.app.security.csp}; connect-src https://example.com`,
    config.app.security.devCsp,
  ]) assert.throws(() => validateCsp(value));
});
test('capabilities reject remote access, broad defaults, emit and filesystem store', () => {
  for (const permission of ['core:default', 'core:event:allow-emit', 'store:default']) {
    assert.throws(() => validateCapabilities([{ ...capability, permissions: [...capability.permissions, permission] }]));
  }
  assert.throws(() => validateCapabilities([{ ...capability, remote: { urls: ['https://example.com'] } }]));
  assert.throws(() => validateCapabilities([{ ...capability, webviews: ['*'] }]));
  assert.throws(() => validateCapabilities([capability, capability]));
});
test('network check permits isolated Rust tests but checks production airlock code', () => {
  assert.doesNotThrow(() => validateSource('#[cfg(test)]\nmod tests { TcpStream::connect("127.0.0.1"); }', 'airlock.rs'));
  assert.throws(() => validateSource('TcpStream::connect("127.0.0.1");\n#[cfg(test)]\nmod tests {}', 'airlock.rs'));
  assert.throws(() => validateSource('window.fetch("https://example.com")', 'backend.ts'));
});

test('only reviewed native provider paths may own guarded HTTP clients', () => {
  const guarded = 'let client = reqwest::blocking::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none());';
  assert.doesNotThrow(() => validateSource(guarded, '/repo/src-tauri/src/providers.rs'));
  assert.doesNotThrow(() => validateSource(guarded, '/repo/src-tauri/src/auth.rs'));
  assert.throws(() => validateSource(guarded, '/repo/src/providers.rs'));
  assert.throws(() => validateSource(guarded, '/repo/src-tauri/src/providers 2.rs'));
  assert.throws(() => validateSource(guarded.replace('.no_proxy()', ''), '/repo/src-tauri/src/providers.rs'));
  assert.throws(() => validateSource(`${guarded}\nfetch("https://example.com")`, '/repo/src-tauri/src/auth.rs'));
});

test('a test-only field cannot hide later production networking', () => {
  assert.throws(() => validateSource('#[cfg(test)]\nmock: bool,\nfn send() { TcpStream::connect("127.0.0.1"); }\n#[cfg(test)]\nmod tests {}', 'storage.rs'));
});
