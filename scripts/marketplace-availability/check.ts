#!/usr/bin/env node
/**
 * Marketplace availability checker.
 * Invoked via: npx tsx scripts/marketplace-availability/check.ts
 * Or via package script: pnpm run check:marketplace
 *
 * Answers one question: can a VS Code client download this extension — and, if a
 * version is given, that specific version — right now?
 *
 * Probes every surface that can disagree, because they routinely do: the CDN
 * gallery clients resolve through, the REST gallery `vsce` uses, the web item
 * page, and the versioned VSIX asset. A third-party control extension is probed
 * alongside so a gallery-wide outage is never mistaken for a problem with this
 * extension.
 *
 * Deliberately ignores the local VS Code UI: an installed copy and a cached VSIX
 * make an extension look available long after the gallery stopped serving it.
 *
 * Usage:
 *   check.ts                      # check the version in package.json
 *   check.ts --version 2.11.2     # check a specific version
 *   check.ts --any                # only ask whether the extension resolves at all
 *   check.ts --wait               # poll until available (default 30 min)
 *   check.ts --wait --timeout 60  # poll for at most 60 minutes
 *
 * Exit codes: 0 available, 2 pending, 3 missing, 4 gallery degraded.
 *
 * Uses only Node built-ins and no third-party dependencies.
 */

import * as https from 'node:https';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessAvailability,
  buildProbeUrls,
  type ProbeResult,
  type Verdict,
} from './verdict.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** A widely-installed third-party extension used to detect gallery-wide outages. */
const CONTROL_EXTENSION = { publisher: 'oderwat', name: 'indent-rainbow' };

/** Where a Marketplace operator can find out what this script is. */
const REPO_URL = 'https://github.com/alessandroraffa/tangyr-vscode';

/**
 * Identify this script honestly.
 *
 * An earlier version sent a Chrome User-Agent, on the assumption that the
 * Marketplace refuses unfamiliar agents. That assumption was tested and is
 * wrong: the CDN gallery, the item page, the publisher page and the REST
 * extensionquery endpoint all answer 200 to the string below. Impersonating a
 * browser bought nothing, and the Terms of Use expect information to be
 * obtained through publicly supported interfaces, which is what these are.
 */
const USER_AGENT = `tangyr-marketplace-check (+${REPO_URL})`;

const REQUEST_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 60_000;
const DEFAULT_WAIT_MINUTES = 30;

const EXIT_CODES: Record<Verdict, number> = {
  available: 0,
  pending: 2,
  missing: 3,
  'gallery-degraded': 4,
};

interface HttpResponse {
  readonly status: number;
  readonly body: string;
}

function request(
  url: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {}
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: options.method ?? 'GET',
        headers: { 'User-Agent': USER_AGENT, ...options.headers },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        );
      }
    );
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

/** Never let one unreachable surface abort the whole check. */
async function safely(
  name: ProbeResult['name'],
  run: () => Promise<ProbeResult>
): Promise<ProbeResult> {
  try {
    return await run();
  } catch (err) {
    return { name, ok: false, detail: `request failed: ${String(err)}` };
  }
}

function galleryQueryBody(extensionId: string): string {
  return JSON.stringify({
    filters: [
      {
        criteria: [
          { filterType: 8, value: 'Microsoft.VisualStudio.Code' },
          { filterType: 7, value: extensionId },
        ],
        pageSize: 5,
        pageNumber: 1,
      },
    ],
    // 914 = IncludeFiles | IncludeVersionProperties | IncludeAssetUri
    //     | IncludeStatistics | IncludeLatestVersionOnly
    flags: 914,
  });
}

function firstGalleryVersion(body: string): string | undefined {
  const parsed = JSON.parse(body) as {
    results?: { extensions?: { versions?: { version?: string }[] }[] }[];
  };
  return parsed.results?.[0]?.extensions?.[0]?.versions?.[0]?.version;
}

async function probeGalleryApi(
  url: string,
  extensionId: string,
  name: ProbeResult['name']
): Promise<ProbeResult> {
  const res = await request(url, {
    method: 'POST',
    body: galleryQueryBody(extensionId),
    headers: {
      Accept: 'application/json;api-version=7.2-preview.1',
      'Content-Type': 'application/json',
    },
  });
  if (res.status !== 200) {
    return { name, ok: false, detail: `HTTP ${String(res.status)}` };
  }
  const version = firstGalleryVersion(res.body);
  return version === undefined
    ? { name, ok: false, detail: 'HTTP 200 but 0 extensions returned' }
    : { name, ok: true, version, detail: `HTTP 200, serving ${version}` };
}

async function probeVsCodeCdn(url: string): Promise<ProbeResult> {
  const res = await request(url);
  if (res.status !== 200) {
    return { name: 'vscode-cdn', ok: false, detail: `HTTP ${String(res.status)}` };
  }
  const parsed = JSON.parse(res.body) as { versions?: { version?: string }[] };
  const version = parsed.versions?.[0]?.version;
  return {
    name: 'vscode-cdn',
    ok: true,
    version,
    detail: `HTTP 200, serving ${version ?? 'unknown'}`,
  };
}

async function probeStatus(
  url: string,
  name: ProbeResult['name'],
  okStatuses: readonly number[]
): Promise<ProbeResult> {
  const res = await request(url);
  return {
    name,
    ok: okStatuses.includes(res.status),
    detail: `HTTP ${String(res.status)}`,
  };
}

async function runProbes(
  publisher: string,
  name: string,
  version?: string
): Promise<ProbeResult[]> {
  const urls = buildProbeUrls(publisher, name, version);
  const extensionId = `${publisher}.${name}`;
  const controlId = `${CONTROL_EXTENSION.publisher}.${CONTROL_EXTENSION.name}`;

  const probes: Promise<ProbeResult>[] = [
    safely('vscode-cdn', () => probeVsCodeCdn(urls.vscodeCdn)),
    safely('gallery-api', () =>
      probeGalleryApi(urls.galleryApi, extensionId, 'gallery-api')
    ),
    safely('item-page', () => probeStatus(urls.itemPage, 'item-page', [200])),
    safely('control', () => probeGalleryApi(urls.galleryApi, controlId, 'control')),
  ];
  if (urls.vsixAsset !== undefined) {
    probes.push(
      safely('vsix-asset', () => probeStatus(urls.vsixAsset!, 'vsix-asset', [200, 302]))
    );
  }
  return Promise.all(probes);
}

function readPackageIdentity(): { publisher: string; name: string; version: string } {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')
  ) as { publisher?: string; name?: string; version?: string };
  if (!pkg.publisher || !pkg.name || !pkg.version) {
    throw new Error('package.json is missing publisher, name or version');
  }
  return { publisher: pkg.publisher, name: pkg.name, version: pkg.version };
}

function report(results: readonly ProbeResult[]): void {
  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const mark = r.ok ? '✓' : '✗';
    console.log(`  ${mark} ${r.name.padEnd(width)}  ${r.detail ?? ''}`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const identity = readPackageIdentity();
  const versionFlag = argv.indexOf('--version');
  const timeoutFlag = argv.indexOf('--timeout');
  const expected = argv.includes('--any')
    ? undefined
    : versionFlag !== -1
      ? argv[versionFlag + 1]
      : identity.version;
  const wait = argv.includes('--wait');
  const waitMinutes =
    timeoutFlag !== -1 ? Number(argv[timeoutFlag + 1]) : DEFAULT_WAIT_MINUTES;
  const deadline = Date.now() + waitMinutes * 60_000;

  const target = `${identity.publisher}.${identity.name}`;
  console.log(
    `Checking ${target}${expected !== undefined ? ` for version ${expected}` : ''}\n`
  );

  for (;;) {
    const results = await runProbes(identity.publisher, identity.name, expected);
    const assessment = assessAvailability(results, expected);
    report(results);
    console.log(`\n  → ${assessment.verdict.toUpperCase()}: ${assessment.reason}`);

    if (assessment.verdict === 'available' || !wait || Date.now() >= deadline) {
      process.exit(EXIT_CODES[assessment.verdict]);
    }
    console.log(`\n  waiting ${String(POLL_INTERVAL_MS / 1000)}s before re-checking…\n`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err: unknown) => {
  console.error(String(err));
  process.exit(1);
});
