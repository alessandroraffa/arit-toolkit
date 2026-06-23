#!/usr/bin/env node
/**
 * Build-time popularity refresh tool.
 * Invoked via: npx tsx scripts/refresh-popularity.ts
 * Or via package script: pnpm run refresh:popularity
 *
 * Queries public sources for download/install/star counts for each of the eight
 * supported AI coding assistants, applies per-source validity contracts, computes
 * popularity scores using the pure scoring component, writes the artifact module
 * popularityData.ts, and regenerates all four README generated regions.
 *
 * Uses only Node built-ins and no third-party dependencies.
 */

import * as https from 'node:https';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveOrder,
  POOL_SIZE_ACKNOWLEDGMENT,
} from '../src/features/agentSessionsArchiving/providers/popularityScoring.js';
import type {
  RawSignal,
  TargetSignals,
} from '../src/features/agentSessionsArchiving/providers/popularityScoring.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Number of pairwise position inversions that triggers a heightened-review flag. */
export const INVERSION_THRESHOLD = 2;

/** Disclaimer text (mirrors DISCLAIMER in popularityData.ts). */
const DISCLAIMER =
  'This popularity order is derived from public signals (downloads, installs, stars) and is not an endorsement, recommendation, or quality judgment of any assistant.';

/** Method pointer (mirrors METHOD_POINTER in popularityData.ts). */
const METHOD_POINTER = 'docs/plans/PLAN-006-assistant-popularity-ranking.md';

interface ReadmeRow {
  sessionLocation: string;
  workspaceMatching: string;
}

interface TargetDescriptor {
  canonicalName: string;
  providerName: string;
  npmPackage?: string;
  pypiPackage?: string;
  marketplaceItem?: string;
  openVsxItem?: string;
  githubRepo?: string;
  readmeRow: ReadmeRow;
}

/** The eight supported targets with their verified source identifiers (PLAN-006 feasibility table). */
export const TARGETS: TargetDescriptor[] = [
  {
    canonicalName: 'Claude Code',
    providerName: 'claude-code',
    npmPackage: '@anthropic-ai/claude-code',
    marketplaceItem: 'anthropic.claude-code',
    githubRepo: 'anthropics/claude-code',
    readmeRow: {
      sessionLocation: '`~/.claude/projects/<workspace-path>/`',
      workspaceMatching: 'Project path derived from workspace',
    },
  },
  {
    canonicalName: 'Cline',
    providerName: 'cline',
    marketplaceItem: 'saoudrizwan.claude-dev',
    githubRepo: 'cline/cline',
    readmeRow: {
      sessionLocation: 'VS Code global storage',
      workspaceMatching: 'Session content references workspace path',
    },
  },
  {
    canonicalName: 'GitHub Copilot Chat',
    providerName: 'copilot-chat',
    // No CLI: @github/copilot is the CLI product, excluded on product-identity grounds
    marketplaceItem: 'GitHub.copilot-chat',
    githubRepo: 'microsoft/vscode-copilot-chat',
    readmeRow: {
      sessionLocation: 'VS Code workspace storage (`chatSessions/`)',
      workspaceMatching: 'Per-workspace storage (`.json` and `.jsonl`)',
    },
  },
  {
    canonicalName: 'OpenAI Codex',
    providerName: 'codex',
    npmPackage: '@openai/codex',
    marketplaceItem: 'openai.chatgpt',
    githubRepo: 'openai/codex',
    readmeRow: {
      sessionLocation: '`~/.codex/sessions/<YYYY>/<MM>/<DD>/`',
      workspaceMatching: '`cwd` field in session metadata',
    },
  },
  {
    canonicalName: 'OpenCode',
    providerName: 'open-code',
    npmPackage: 'opencode-ai',
    marketplaceItem: 'sst-dev.opencode',
    openVsxItem: 'sst-dev.opencode',
    githubRepo: 'sst/opencode',
    readmeRow: {
      sessionLocation: '`~/.local/share/opencode/opencode.db`',
      workspaceMatching: '`directory` field in session row',
    },
  },
  {
    canonicalName: 'Aider',
    providerName: 'aider',
    pypiPackage: 'aider-chat',
    // No ext: no first-party editor extension
    githubRepo: 'aider-ai/aider',
    readmeRow: {
      sessionLocation: 'Workspace root (`.aider.*` files)',
      workspaceMatching: 'Files present in the workspace root',
    },
  },
  {
    canonicalName: 'RooCode',
    providerName: 'roo-code',
    // No CLI: no command-line tool
    marketplaceItem: 'RooVeterinaryInc.roo-cline',
    openVsxItem: 'RooVeterinaryInc.roo-cline',
    githubRepo: 'RooCodeInc/Roo-Code',
    readmeRow: {
      sessionLocation: 'VS Code global storage',
      workspaceMatching: 'Session content references workspace path',
    },
  },
  {
    canonicalName: 'Continue',
    providerName: 'continue',
    npmPackage: '@continuedev/cli',
    marketplaceItem: 'Continue.continue',
    githubRepo: 'continuedev/continue',
    readmeRow: {
      sessionLocation: '`~/.continue/sessions/`',
      workspaceMatching: 'Session content references workspace path',
    },
  },
];

interface HttpResponse {
  statusCode: number;
  body: string;
}

/**
 * Wraps https.get in a Promise. Resolves to { statusCode, body }.
 * Follows HTTP redirects (e.g. GitHub returns 301 for a renamed repository),
 * up to maxRedirects hops, so a moved source is not recorded as absent.
 */
export async function httpsGet(
  url: string,
  headers: Record<string, string> = {},
  maxRedirects = 5
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const options = { headers };
    https
      .get(url, options, (res) => {
        const statusCode = res.statusCode ?? 0;
        const location = res.headers.location;
        if (statusCode >= 300 && statusCode < 400 && location && maxRedirects > 0) {
          res.resume();
          const nextUrl = new URL(location, url).toString();
          httpsGet(nextUrl, headers, maxRedirects - 1).then(resolve, reject);
          return;
        }
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          resolve({ statusCode, body });
        });
      })
      .on('error', reject);
  });
}

/** Wraps https.request in a Promise for POST requests. */
export async function httpsPost(
  url: string,
  headers: Record<string, string>,
  requestBody: string
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode ?? 0, body });
      });
    });
    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

/** Fetches npm monthly downloads for a package. Returns null if the validity contract fails. */
export async function fetchNpm(
  pkg: string,
  targetMonth: string
): Promise<RawSignal | null> {
  try {
    // Use npm's canonical trailing-month metric. A calendar range like
    // `${targetMonth}-01:${targetMonth}-31` returns HTTP 400 for 30-day months
    // and queries an incomplete current month; `last-month` is always a valid,
    // fresh, server-computed trailing-30-day window.
    const url = `https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(pkg)}`;
    const resp = await httpsGet(url);
    if (resp.statusCode < 200 || resp.statusCode >= 300) return null;
    const json = JSON.parse(resp.body) as Record<string, unknown>;
    if (typeof json['downloads'] !== 'number') return null;
    // Window-presence check: a valid response carries its trailing-month window;
    // a malformed/partial body lacking the window is treated as absent.
    if (typeof json['start'] !== 'string' || typeof json['end'] !== 'string') return null;
    return { value: json['downloads'] as number, source: 'npm', period: targetMonth };
  } catch {
    return null;
  }
}

/** Fetches PyPI recent monthly downloads. Returns null on non-2xx or missing data. */
export async function fetchPypi(pkg: string): Promise<RawSignal | null> {
  try {
    const url = `https://pypistats.org/api/packages/${encodeURIComponent(pkg)}/recent?period=month`;
    const resp = await httpsGet(url);
    if (resp.statusCode < 200 || resp.statusCode >= 300) return null;
    const json = JSON.parse(resp.body) as Record<string, unknown>;
    const data = json['data'] as Record<string, unknown> | undefined;
    if (!data || typeof data['last_month'] !== 'number') return null;
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return { value: data['last_month'] as number, source: 'pypi', period };
  } catch {
    return null;
  }
}

/** Fetches VS Code Marketplace install count for an extension. */
export async function fetchMarketplace(itemName: string): Promise<RawSignal | null> {
  try {
    const url =
      'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
    // flags must include IncludeStatistics (256) — flag 512 (LatestVersionOnly)
    // alone omits the statistics array, so the install count is never returned.
    // 914 = Files(2)+VersionProperties(16)+AssetUri(128)+Statistics(256)+LatestVersionOnly(512).
    const body = JSON.stringify({
      filters: [{ criteria: [{ filterType: 7, value: itemName }], pageSize: 1 }],
      flags: 914,
    });
    const resp = await httpsPost(
      url,
      {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json;api-version=7.2-preview.1',
      },
      body
    );
    if (resp.statusCode < 200 || resp.statusCode >= 300) return null;
    const json = JSON.parse(resp.body) as Record<string, unknown>;
    const results = json['results'] as Array<Record<string, unknown>> | undefined;
    const ext = results?.[0]?.['extensions'] as
      | Array<Record<string, unknown>>
      | undefined;
    const stats = ext?.[0]?.['statistics'] as Array<Record<string, unknown>> | undefined;
    const installStat = stats?.find((s) => s['statisticName'] === 'install');
    if (!installStat || typeof installStat['value'] !== 'number') return null;
    return {
      value: installStat['value'] as number,
      source: 'marketplace',
      period: 'cumulative',
    };
  } catch {
    return null;
  }
}

/** Fetches Open VSX download count for an extension. */
export async function fetchOpenVsx(itemName: string): Promise<RawSignal | null> {
  try {
    const [namespace, name] = itemName.split('.');
    if (!namespace || !name) return null;
    const url = `https://open-vsx.org/api/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
    const resp = await httpsGet(url);
    if (resp.statusCode < 200 || resp.statusCode >= 300) return null;
    const json = JSON.parse(resp.body) as Record<string, unknown>;
    if (typeof json['downloadCount'] !== 'number') return null;
    return {
      value: json['downloadCount'] as number,
      source: 'open-vsx',
      period: 'cumulative',
    };
  } catch {
    return null;
  }
}

/** Fetches GitHub repository star count. */
export async function fetchGithubStars(ownerRepo: string): Promise<RawSignal | null> {
  try {
    const url = `https://api.github.com/repos/${ownerRepo}`;
    const headers: Record<string, string> = { 'User-Agent': 'tangyr-popularity-refresh' };
    // Authenticate star reads. In CI the auto-provided GITHUB_TOKEN is used
    // (authenticated, ~1000 req/h on public repos; a GITHUB_-prefixed repo secret
    // cannot be created); a local GITHUB_POPULARITY_TOKEN env var may override it.
    const token = process.env['GITHUB_POPULARITY_TOKEN'] ?? process.env['GITHUB_TOKEN'];
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }
    const resp = await httpsGet(url, headers);
    if (resp.statusCode < 200 || resp.statusCode >= 300) return null;
    const json = JSON.parse(resp.body) as Record<string, unknown>;
    if (typeof json['stargazers_count'] !== 'number') return null;
    return {
      value: json['stargazers_count'] as number,
      source: 'github',
      period: 'cumulative',
    };
  } catch {
    return null;
  }
}

/**
 * Applies the PyPI zero-floor validity contract.
 * When signal.value > 0: return signal unchanged.
 * When signal.value === 0 and priorCliValue is a positive number (known history): return null (absent).
 * When signal.value === 0 and priorCliValue is null or 0 (first-seen): return signal.
 */
export function applyZeroFloor(
  signal: RawSignal,
  priorCliValue: number | null
): RawSignal | null {
  if (signal.value > 0) return signal;
  if (priorCliValue !== null && priorCliValue > 0) return null;
  return signal;
}

/**
 * Counts pairwise position inversions (Kendall-tau distance) between two orders.
 * Returns true when the inversion count exceeds INVERSION_THRESHOLD.
 * Returns false when priorOrder is null (first run — no comparison).
 */
export function shouldFlagForReview(
  priorOrder: string[] | null,
  newOrder: string[]
): boolean {
  if (priorOrder === null) return false;
  let inversions = 0;
  for (let i = 0; i < priorOrder.length; i++) {
    for (let j = i + 1; j < priorOrder.length; j++) {
      const pi = newOrder.indexOf(priorOrder[i] ?? '');
      const pj = newOrder.indexOf(priorOrder[j] ?? '');
      if (pi !== -1 && pj !== -1 && pi > pj) {
        inversions++;
      }
    }
  }
  return inversions > INVERSION_THRESHOLD;
}

/** Per-target record shape used inside the generated artifact. */
interface TargetRecord {
  canonicalName: string;
  providerName: string;
  score: number;
  positions: { cli?: number; ext?: number; stars?: number };
  signals: {
    cli?: RawSignal;
    ext?: RawSignal;
    stars?: RawSignal;
  };
}

/** Full PopularityData shape for the generated artifact. */
interface PopularityData {
  resolvedOrder: readonly string[];
  targets: readonly TargetRecord[];
  refreshedAt: string;
  refreshPeriod: string;
  poolSizeAcknowledgment: string;
  disclaimer: string;
  methodPointer: string;
}

/** Builds the TypeScript source string for popularityData.ts. */
export function buildArtifactModule(data: PopularityData): string {
  return `/* THIS FILE IS AUTO-GENERATED. DO NOT EDIT BY HAND. Run "pnpm run refresh:popularity" or wait for the monthly CI refresh. See scripts/refresh-popularity.ts for the generation procedure. */

/**
 * Versioned popularity data artifact module.
 *
 * PopularityData interface fields:
 *   resolvedOrder  — canonical display names in popularity order (most popular first)
 *   targets        — per-target record with raw signals, computed score, and positions
 *   refreshedAt    — ISO 8601 UTC timestamp of the last refresh
 *   refreshPeriod  — YYYY-MM month the signals belong to
 *   poolSizeAcknowledgment — the POOL_SIZE_ACKNOWLEDGMENT text from popularityScoring.ts
 *   disclaimer     — the not-an-endorsement disclaimer (DISCLAIMER constant)
 *   methodPointer  — path to the aggregation method document (METHOD_POINTER constant)
 *
 * Do not hand-edit this file. Changes will be overwritten by the next refresh run.
 * See scripts/refresh-popularity.ts for the generation procedure.
 */

import { POOL_SIZE_ACKNOWLEDGMENT } from './popularityScoring';
import type { RawSignal } from './popularityScoring';

/** Per-target record inside PopularityData. */
export interface TargetRecord {
  canonicalName: string;
  providerName: string;
  score: number;
  positions: { cli?: number; ext?: number; stars?: number };
  signals: {
    cli?: RawSignal;
    ext?: RawSignal;
    stars?: RawSignal;
  };
}

/** The typed shape of the generated popularity data artifact. */
export interface PopularityData {
  resolvedOrder: readonly string[];
  targets: readonly TargetRecord[];
  refreshedAt: string;
  refreshPeriod: string;
  poolSizeAcknowledgment: string;
  disclaimer: string;
  methodPointer: string;
}

/** Not-an-endorsement disclaimer, co-located with every public surface of the order. */
export const DISCLAIMER =
  ${JSON.stringify(data.disclaimer)};

/** Repository-relative path to the documented aggregation method. */
export const METHOD_POINTER = ${JSON.stringify(data.methodPointer)};

const RESOLVED_ORDER: readonly string[] = Object.freeze(${JSON.stringify(Array.from(data.resolvedOrder), null, 2).split('\n').join('\n')});

const TARGETS_DATA: readonly TargetRecord[] = Object.freeze(${JSON.stringify(Array.from(data.targets), null, 2)});

/** The generated popularity data artifact. */
export const POPULARITY_DATA: PopularityData = Object.freeze({
  resolvedOrder: RESOLVED_ORDER,
  targets: TARGETS_DATA,
  refreshedAt: ${JSON.stringify(data.refreshedAt)},
  refreshPeriod: ${JSON.stringify(data.refreshPeriod)},
  poolSizeAcknowledgment: POOL_SIZE_ACKNOWLEDGMENT,
  disclaimer: DISCLAIMER,
  methodPointer: METHOD_POINTER,
});
`;
}

/** Builds the TABLE region content (between delimiter lines). */
export function buildRegionTable(
  data: PopularityData,
  targetMap: Map<string, TargetDescriptor>
): string {
  const rows = Array.from(data.resolvedOrder)
    .map((name) => {
      const t = targetMap.get(name);
      if (!t) return `| ${name} | — | — |`;
      const { sessionLocation, workspaceMatching } = t.readmeRow;
      return `| ${name} | ${sessionLocation} | ${workspaceMatching} |`;
    })
    .join('\n');

  return `| Assistant | Session location | Workspace matching |
| --------- | ---------------- | ------------------ |
${rows}

> **Note:** ${data.disclaimer}
> Method: [PLAN-006](${data.methodPointer})
> As of: ${data.refreshPeriod}
`;
}

/** Builds the INTRO region content (between delimiter lines). */
export function buildRegionIntro(data: PopularityData): string {
  const names = Array.from(data.resolvedOrder);
  const last = names[names.length - 1];
  const allButLast = names.slice(0, -1);
  const enumeration = `${allButLast.join(', ')}, and ${last ?? ''}`;
  return `Chat sessions with ${enumeration} are scattered across your filesystem — global storage, hidden directories, workspace storage. They don't survive a machine change, they aren't versioned with your code, and they're invisible to your team. Tangyr Workbench collects them automatically into your workspace, organized by date, as project artifacts.\n`;
}

/** Builds the FEATURES region content (between delimiter lines). */
export function buildRegionFeatures(data: PopularityData): string {
  const names = Array.from(data.resolvedOrder);
  const last = names[names.length - 1];
  const allButLast = names.slice(0, -1);
  const enumeration = `${allButLast.join(', ')}, and ${last ?? ''}`;
  return `- Archives sessions from ${enumeration} into one place — no other extension does this\n`;
}

/** Builds the COUNT region content (between delimiter lines). */
export function buildRegionCount(_data: PopularityData): string {
  return '8';
}

/** Replaces the content between two delimiter lines in a string, preserving the delimiters. */
function replaceRegion(
  content: string,
  startDelimiter: string,
  endDelimiter: string,
  newContent: string
): string {
  const startIdx = content.indexOf(startDelimiter);
  const endIdx = content.indexOf(endDelimiter);
  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    throw new Error(
      `Delimiter pair not found or mismatched: "${startDelimiter}" / "${endDelimiter}"`
    );
  }
  const before = content.substring(0, startIdx + startDelimiter.length);
  const after = content.substring(endIdx);
  return `${before}\n${newContent}\n${after}`;
}

/** Validates that each delimiter pair appears exactly once in the README content. */
function validateDelimiters(content: string): void {
  const delimiters = [
    ['<!-- POPULARITY-TABLE:START -->', '<!-- POPULARITY-TABLE:END -->'],
    ['<!-- POPULARITY-INTRO:START -->', '<!-- POPULARITY-INTRO:END -->'],
    ['<!-- POPULARITY-FEATURES:START -->', '<!-- POPULARITY-FEATURES:END -->'],
    ['<!-- POPULARITY-COUNT:START -->', '<!-- POPULARITY-COUNT:END -->'],
  ] as const;

  for (const [start, end] of delimiters) {
    const startCount = content.split(start).length - 1;
    const endCount = content.split(end).length - 1;
    if (startCount !== 1 || endCount !== 1) {
      throw new Error(
        `Delimiter pair must appear exactly once in README. Found ${startCount}x "${start}" and ${endCount}x "${end}". ` +
          'A malformed or duplicated delimiter would corrupt the rewrite.'
      );
    }
  }
}

/** Main entry point. */
async function run(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '..');
  const artifactPath = path.join(
    repoRoot,
    'src/features/agentSessionsArchiving/providers/popularityData.ts'
  );
  const readmePath = path.join(repoRoot, 'README.md');

  // Read current artifact to extract prior order and prior CLI values for zero-floor
  let priorOrder: string[] | null = null;
  const priorCliValues = new Map<string, number | null>();

  try {
    const current = fs.readFileSync(artifactPath, 'utf8');
    const orderMatch = /RESOLVED_ORDER[^=]*=\s*Object\.freeze\(\s*(\[[^\]]+\])/s.exec(
      current
    );
    if (orderMatch?.[1]) {
      try {
        const parsed = JSON.parse(orderMatch[1]) as string[];
        priorOrder = parsed;
      } catch {
        // ignore parse error — treat as first run
      }
    }
    // Extract prior CLI values from targets for zero-floor
    const targetsMatch = /TARGETS_DATA[^=]*=\s*Object\.freeze\((\[[\s\S]*?\])\s*\);/.exec(
      current
    );
    if (targetsMatch?.[1]) {
      try {
        const targets = JSON.parse(targetsMatch[1]) as Array<{
          canonicalName: string;
          signals?: { cli?: { value: number } };
        }>;
        for (const t of targets) {
          const cliVal = t.signals?.cli?.value ?? null;
          priorCliValues.set(t.canonicalName, cliVal);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // File doesn't exist yet — first run
  }

  const now = new Date();
  const targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const refreshedAt = now.toISOString();

  console.log(`Refreshing popularity data for ${targetMonth}...`);

  // Build target map for readmeRow lookups
  const targetMap = new Map<string, TargetDescriptor>();
  for (const t of TARGETS) {
    targetMap.set(t.canonicalName, t);
  }

  // Fetch signals one target at a time. The public endpoints (especially the
  // Marketplace gallery and pypistats) throttle concurrent bursts; sequential
  // requests stay well within every source's anonymous rate limit.
  type SignalResult = {
    cli?: RawSignal | null;
    ext?: RawSignal | null;
    stars?: RawSignal | null;
  };
  const fetchOne = async (
    t: TargetDescriptor
  ): Promise<{ canonicalName: string; signals: SignalResult }> => {
    const signals: SignalResult = {};

    // CLI signal
    if (t.npmPackage) {
      signals.cli = await fetchNpm(t.npmPackage, targetMonth);
    } else if (t.pypiPackage) {
      const raw = await fetchPypi(t.pypiPackage);
      if (raw !== null) {
        const prior = priorCliValues.get(t.canonicalName) ?? null;
        signals.cli = applyZeroFloor(raw, prior);
      } else {
        signals.cli = null;
      }
    }

    // EXT signal (Marketplace primary, Open VSX secondary for targets that have it)
    if (t.marketplaceItem) {
      const marketResult = await fetchMarketplace(t.marketplaceItem);
      if (marketResult !== null) {
        signals.ext = marketResult;
      } else if (t.openVsxItem) {
        signals.ext = await fetchOpenVsx(t.openVsxItem);
      } else {
        signals.ext = null;
      }
    } else if (t.openVsxItem) {
      signals.ext = await fetchOpenVsx(t.openVsxItem);
    }

    // STARS signal
    if (t.githubRepo) {
      signals.stars = await fetchGithubStars(t.githubRepo);
    }

    return { canonicalName: t.canonicalName, signals };
  };

  const fetchResults: PromiseSettledResult<{
    canonicalName: string;
    signals: SignalResult;
  }>[] = [];
  for (const t of TARGETS) {
    try {
      fetchResults.push({ status: 'fulfilled', value: await fetchOne(t) });
    } catch (reason) {
      fetchResults.push({ status: 'rejected', reason });
    }
  }

  // Build TargetSignals for scoring
  const targetSignals: TargetSignals[] = [];
  const resolvedSignals = new Map<string, SignalResult>();

  for (const result of fetchResults) {
    if (result.status === 'fulfilled') {
      const { canonicalName, signals } = result.value;
      resolvedSignals.set(canonicalName, signals);
      const ts: TargetSignals = { name: canonicalName };
      if (signals.cli) ts.cli = signals.cli;
      if (signals.ext) ts.ext = signals.ext;
      if (signals.stars) ts.stars = signals.stars;
      targetSignals.push(ts);
    } else {
      console.warn(`Failed to fetch signals for a target: ${String(result.reason)}`);
    }
  }

  // Compute resolved order
  const newOrder = resolveOrder(targetSignals);
  const flagged = shouldFlagForReview(priorOrder, newOrder);

  console.log(`Resolved order: ${newOrder.join(', ')}`);
  if (flagged) {
    console.warn(
      `SANITY BOUND EXCEEDED: More than ${INVERSION_THRESHOLD} pairwise inversions from prior order.`
    );
  }

  // Build scored targets for the artifact
  // We need the score values from the scoring component
  const { scoreTargets } =
    await import('../src/features/agentSessionsArchiving/providers/popularityScoring.js');
  const scored = scoreTargets(targetSignals);
  const scoreMap = new Map(scored.map((s) => [s.name, s]));

  const targetRecords: TargetRecord[] = TARGETS.map((t) => {
    const sc = scoreMap.get(t.canonicalName);
    const sigs = resolvedSignals.get(t.canonicalName) ?? {};
    return {
      canonicalName: t.canonicalName,
      providerName: t.providerName,
      score: sc?.score ?? 0,
      positions: sc?.positions ?? {},
      signals: {
        ...(sigs.cli ? { cli: sigs.cli } : {}),
        ...(sigs.ext ? { ext: sigs.ext } : {}),
        ...(sigs.stars ? { stars: sigs.stars } : {}),
      },
    };
  });

  // Sort targetRecords by the resolved order
  targetRecords.sort((a, b) => {
    const ia = newOrder.indexOf(a.canonicalName);
    const ib = newOrder.indexOf(b.canonicalName);
    return (ia === -1 ? newOrder.length : ia) - (ib === -1 ? newOrder.length : ib);
  });

  const data: PopularityData = {
    resolvedOrder: Object.freeze(newOrder),
    targets: Object.freeze(targetRecords),
    refreshedAt,
    refreshPeriod: targetMonth,
    poolSizeAcknowledgment: POOL_SIZE_ACKNOWLEDGMENT,
    disclaimer: DISCLAIMER,
    methodPointer: METHOD_POINTER,
  };

  // Write artifact module
  const artifactContent = buildArtifactModule(data);
  await fsPromises.writeFile(artifactPath, artifactContent, 'utf8');
  console.log(`Wrote ${artifactPath}`);

  // Update README generated regions
  let readmeContent = await fsPromises.readFile(readmePath, 'utf8');
  validateDelimiters(readmeContent);

  readmeContent = replaceRegion(
    readmeContent,
    '<!-- POPULARITY-TABLE:START -->',
    '<!-- POPULARITY-TABLE:END -->',
    buildRegionTable(data, targetMap)
  );
  readmeContent = replaceRegion(
    readmeContent,
    '<!-- POPULARITY-INTRO:START -->',
    '<!-- POPULARITY-INTRO:END -->',
    buildRegionIntro(data)
  );
  readmeContent = replaceRegion(
    readmeContent,
    '<!-- POPULARITY-FEATURES:START -->',
    '<!-- POPULARITY-FEATURES:END -->',
    buildRegionFeatures(data)
  );
  readmeContent = replaceRegion(
    readmeContent,
    '<!-- POPULARITY-COUNT:START -->',
    '<!-- POPULARITY-COUNT:END -->',
    buildRegionCount(data)
  );

  await fsPromises.writeFile(readmePath, readmeContent, 'utf8');
  console.log(`Updated ${readmePath}`);

  // Print PR body
  const inversionsFromPrior = priorOrder
    ? (() => {
        let count = 0;
        for (let i = 0; i < priorOrder.length; i++) {
          for (let j = i + 1; j < priorOrder.length; j++) {
            const pi = newOrder.indexOf(priorOrder[i] ?? '');
            const pj = newOrder.indexOf(priorOrder[j] ?? '');
            if (pi !== -1 && pj !== -1 && pi > pj) count++;
          }
        }
        return count;
      })()
    : 0;

  const zeroOrSingleSignalTargets = targetSignals
    .filter((t) => {
      const count = [t.cli, t.ext, t.stars].filter(Boolean).length;
      return count <= 1;
    })
    .map((t) => t.name);

  const prBody = `## Monthly popularity ranking refresh

### Editorial checklist

- [ ] **Sanity bound**: ${flagged ? `FLAGGED for heightened review — ${inversionsFromPrior} inverted pairs` : `Routine — ${inversionsFromPrior} inverted pairs`}
- [ ] **Position delta**: ${
    priorOrder
      ? newOrder
          .map((n, i) => {
            const prev = priorOrder?.indexOf(n) ?? -1;
            if (prev === -1 || prev === i) return null;
            return `${n}: ${prev + 1} → ${i + 1}`;
          })
          .filter(Boolean)
          .join(', ') || 'No changes'
      : 'First run'
  }
- [ ] **Signal coverage**: ${zeroOrSingleSignalTargets.length > 0 ? zeroOrSingleSignalTargets.join(', ') : 'All targets have 2+ signals'}

### Method

Signals: npm monthly downloads, VS Code Marketplace installs, Open VSX downloads, GitHub stars.
Aggregation: per-signal dense rank, normalized to pool-size-comparable position (best = 0), averaged ascending.
See \`docs/plans/PLAN-006-assistant-popularity-ranking.md\`.`;

  console.log('\n--- PR Body ---');
  console.log(prBody);
  console.log('--- End PR Body ---\n');
}

// Only run when invoked directly (not when imported by tests)
// In ESM/tsx, import.meta.url will match process.argv[1] when the script is
// the entry point. We guard with a try-catch in case the env differs.
const isMain = (() => {
  try {
    return (
      process.argv[1] === fileURLToPath(import.meta.url) ||
      process.argv[1]?.endsWith('refresh-popularity.ts') ||
      process.argv[1]?.endsWith('refresh-popularity.js')
    );
  } catch {
    return false;
  }
})();

if (isMain) {
  run().catch((err: unknown) => {
    console.error('Refresh failed:', err);
    process.exit(1);
  });
}
