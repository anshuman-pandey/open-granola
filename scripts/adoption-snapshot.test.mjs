import { test } from "node:test";
import assert from "node:assert/strict";
import { captureSnapshot, githubRequest } from "./adoption-snapshot.mjs";

const repository = "anshuman-pandey/open-granola";
const root = `/repos/${repository}`;
const metadata = { full_name: repository, private: false, stargazers_count: 16, forks_count: 1 };
const date = new Date("2026-11-01T00:00:00Z");
function api({ releases = [], contributors = [], repo = metadata } = {}) {
  return async path => {
    if (path === root) return repo;
    if (path.startsWith(`${root}/releases?`)) return releases;
    if (path.startsWith(`${root}/contributors?`)) return contributors;
    throw new Error("Unexpected request");
  };
}

test("public baseline separates attention, usage proxies and unknown real adoption", async () => {
  const snapshot = await captureSnapshot({ now: date, request: api({
    releases: [
      { id: 1, draft: true, assets: [{ download_count: 900 }] },
      { id: 2, draft: false, prerelease: false, assets: [{ download_count: 3 }, { download_count: 4 }] },
      { id: 3, draft: false, prerelease: true, assets: [{ download_count: 2 }] },
    ],
    contributors: [
      { login: "anshuman-pandey", type: "User" },
      { login: "dependabot[bot]", type: "Bot" },
      { login: "Automation[bot]", type: "User" },
      { login: "Contributor", type: "User" }, { login: "contributor", type: "User" },
    ],
  }) });
  assert.equal(snapshot.captured_at, date.toISOString());
  assert.deepEqual(snapshot.discovery, { stars: 16, forks: 1 });
  assert.deepEqual(snapshot.adoption_proxies.published_releases, { status: "available", count: 2, prereleases: 1, asset_downloads: 9 });
  assert.deepEqual(snapshot.adoption_proxies.non_owner_contributors, { status: "available", count: 1 });
  assert.deepEqual(snapshot.verified_adoption, { independent_first_runs: null, repeat_use: null });
  assert.ok(!JSON.stringify(snapshot).includes("Contributor"));
});

test("no releases/contributors is zero; API failure is unknown and exposes no response data", async () => {
  const empty = await captureSnapshot({ request: api() });
  assert.equal(empty.adoption_proxies.published_releases.asset_downloads, 0);
  assert.equal(empty.adoption_proxies.non_owner_contributors.count, 0);
  const failure = await captureSnapshot({ request: async path => {
    if (path === root) return metadata;
    throw new Error("HTTP 403 with secret response content");
  } });
  assert.deepEqual(failure.adoption_proxies.published_releases, { status: "unavailable", count: null });
  assert.deepEqual(failure.adoption_proxies.non_owner_contributors, { status: "unavailable", count: null });
  assert.ok(!JSON.stringify(failure).includes("secret"));
});

test("all release pages are counted, duplicates ignored and capped results never called complete", async () => {
  const page = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, draft: false, prerelease: false, assets: [{ download_count: 1 }] }));
  const request = async path => {
    if (path === root) return metadata;
    if (path.includes("/contributors?")) return [];
    return path.endsWith("page=1") ? page : [page[0], { id: 101, draft: false, prerelease: true, assets: [{ download_count: 2 }] }];
  };
  const snapshot = await captureSnapshot({ request });
  assert.equal(snapshot.adoption_proxies.published_releases.count, 101);
  assert.equal(snapshot.adoption_proxies.published_releases.asset_downloads, 102);
  const capped = await captureSnapshot({ request: async path => path === root ? metadata : page });
  assert.equal(capped.adoption_proxies.published_releases.status, "unavailable");
});

test("invalid counters, private repositories and cross-repository responses fail rather than invent a baseline", async () => {
  for (const repo of [
    { ...metadata, private: true }, { ...metadata, full_name: "other/project" },
    { ...metadata, stargazers_count: null }, { ...metadata, forks_count: -1 },
  ]) await assert.rejects(captureSnapshot({ request: api({ repo }) }));
  await assert.rejects(captureSnapshot({ repository: "https://evil.example", request: api() }));
  const broken = await captureSnapshot({ request: api({ releases: [{ id: 1, draft: false, prerelease: false, assets: [{ download_count: null }] }] }) });
  assert.equal(broken.adoption_proxies.published_releases.status, "unavailable");
});

test("token stays in API headers, redirects are refused, 204 is empty and errors are sanitized", async () => {
  let called = false;
  const request = githubRequest({ token: "private-token", fetchImpl: async (url, options) => {
    called = true;
    assert.equal(url, `https://api.github.com${root}`);
    assert.equal(options.headers.Authorization, "Bearer private-token");
    assert.equal(options.redirect, "error");
    return { ok: true, status: 204 };
  } });
  assert.deepEqual(await request(root), []);
  assert.ok(called);
  await assert.rejects(request("https://evil.example"));
  const denied = githubRequest({ fetchImpl: async () => ({ ok: false, status: 403, json: () => { throw new Error("secret"); } }) });
  await assert.rejects(denied(root), { message: "GitHub API unavailable (HTTP 403)" });
});
