#!/usr/bin/env node
// Public, aggregate GitHub counters only. No application telemetry or user profiles.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const DEFAULT_REPOSITORY = "anshuman-pandey/open-granola";
const origin = "https://api.github.com";

function repositoryName(value) {
  if (!/^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i.test(value) ||
      [".", ".."].includes(value.split("/")[1])) {
    throw new Error("Repository must be owner/name");
  }
  return value;
}

function counter(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("GitHub returned an invalid counter");
  }
  return value;
}

export function githubRequest({ fetchImpl = fetch, token = "" } = {}) {
  return async (path) => {
    if (!path.startsWith("/repos/") || path.includes("..") || /[\r\n\\]/.test(path)) {
      throw new Error("Unexpected GitHub API path");
    }
    const response = await fetchImpl(`${origin}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "OpenGranola-adoption-snapshot",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`GitHub API unavailable (HTTP ${response.status})`);
    if (response.status === 204) return [];
    try { return await response.json(); }
    catch { throw new Error("GitHub returned invalid JSON"); }
  };
}

async function allPages(request, path) {
  const result = [];
  for (let page = 1; page <= 20; page++) {
    const rows = await request(`${path}?per_page=100&page=${page}`);
    if (!Array.isArray(rows)) throw new Error("GitHub returned an invalid page");
    result.push(...rows);
    if (rows.length < 100) return result;
  }
  throw new Error("Pagination limit reached; total is unavailable");
}

async function optionalMetric(read) {
  try { return { status: "available", ...await read() }; }
  catch {
    // Missing permissions, rate limits, malformed data and partial pagination are
    // unknown, never zero. Do not persist API bodies or credentials in errors.
    return { status: "unavailable", count: null };
  }
}

export async function captureSnapshot({
  repository = DEFAULT_REPOSITORY,
  request = githubRequest(),
  now = new Date(),
} = {}) {
  repositoryName(repository);
  const root = `/repos/${repository}`;
  const metadata = await request(root);
  if (metadata.private !== false || metadata.full_name?.toLowerCase() !== repository.toLowerCase()) {
    throw new Error("Snapshot requires the requested public repository");
  }
  const [releases, contributors] = await Promise.all([
    optionalMetric(async () => {
      const rows = await allPages(request, `${root}/releases`);
      const seen = new Set();
      let count = 0, prereleases = 0, asset_downloads = 0;
      for (const release of rows) {
        counter(release.id);
        if (seen.has(release.id)) continue;
        seen.add(release.id);
        if (release.draft) continue;
        if (typeof release.draft !== "boolean" || typeof release.prerelease !== "boolean" || !Array.isArray(release.assets)) {
          throw new Error("Invalid release record");
        }
        count++;
        if (release.prerelease) prereleases++;
        for (const asset of release.assets) asset_downloads = counter(asset_downloads + counter(asset.download_count));
      }
      return { count, prereleases, asset_downloads };
    }),
    optionalMetric(async () => {
      const rows = await allPages(request, `${root}/contributors`);
      const owner = repository.split("/")[0].toLowerCase();
      const logins = new Set();
      for (const person of rows) {
        if (typeof person.login !== "string" || !["User", "Bot"].includes(person.type)) {
          throw new Error("Invalid contributor record");
        }
        const login = person.login.toLowerCase();
        if (person.type === "User" && login !== owner && !login.endsWith("[bot]")) logins.add(login);
      }
      return { count: logins.size };
    }),
  ]);
  return {
    format: "open-granola.adoption-snapshot", version: 1,
    captured_at: now.toISOString(), repository: metadata.full_name,
    discovery: { stars: counter(metadata.stargazers_count), forks: counter(metadata.forks_count) },
    adoption_proxies: { published_releases: releases, non_owner_contributors: contributors },
    verified_adoption: { independent_first_runs: null, repeat_use: null },
    sources: { metadata: `${origin}${root}`, releases: `${origin}${root}/releases`, contributors: `${origin}${root}/contributors` },
    limitations: [
      "Stars and forks measure interest, not users or installs.",
      "Release asset downloads are cumulative events, include prereleases, and are not unique installs or active users. Drafts and CI artifacts are excluded.",
      "Non-owner contributors are a collaboration proxy, not users; other maintainers may be included and anonymous authors are not counted.",
      "Verified first runs and repeat use require reviewed voluntary evidence; unknown is null. API failures never become zero.",
      "No app telemetry, meeting content, GitHub traffic data, or contributor identities are stored.",
    ],
  };
}

async function main() {
  const { values, positionals } = parseArgs({ options: {
    repo: { type: "string" }, output: { type: "string" }, help: { type: "boolean", short: "h" },
  }, allowPositionals: true });
  if (values.help) {
    console.log("node scripts/adoption-snapshot.mjs [--repo owner/name] [--output new.json]\nPublic counters only; optional GH_TOKEN/GITHUB_TOKEN stays in request headers. Existing files are never overwritten.");
    return;
  }
  if (positionals.length) throw new Error("Unexpected positional argument; use --help");
  const snapshot = await captureSnapshot({
    repository: values.repo ?? DEFAULT_REPOSITORY,
    request: githubRequest({ token: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? "" }),
  });
  const content = JSON.stringify(snapshot, null, 2) + "\n";
  if (values.output) await writeFile(values.output, content, { flag: "wx", mode: 0o600 });
  else process.stdout.write(content);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write("adoption-snapshot: collection or new-file output failed; no success snapshot was produced\n");
    process.exitCode = 1;
  });
}
