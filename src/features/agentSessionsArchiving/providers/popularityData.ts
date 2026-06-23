/* THIS FILE IS AUTO-GENERATED. DO NOT EDIT BY HAND. Run "pnpm run refresh:popularity" or wait for the monthly CI refresh. See scripts/refresh-popularity.ts for the generation procedure. */

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
  'This popularity order is derived from public signals (downloads, installs, stars) and is not an endorsement, recommendation, or quality judgment of any assistant.';

/** Repository-relative path to the documented aggregation method. */
export const METHOD_POINTER = 'docs/plans/PLAN-006-assistant-popularity-ranking.md';

const RESOLVED_ORDER: readonly string[] = Object.freeze([
  'Claude Code',
  'OpenAI Codex',
  'Cline',
  'RooCode',
  'Aider',
  'Continue',
  'GitHub Copilot Chat',
  'OpenCode',
]);

const TARGETS_DATA: readonly TargetRecord[] = Object.freeze([
  {
    canonicalName: 'Claude Code',
    providerName: 'claude-code',
    score: 0,
    positions: {
      stars: 0,
    },
    signals: {
      stars: {
        value: 133880,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
  {
    canonicalName: 'OpenAI Codex',
    providerName: 'codex',
    score: 0.16666666666666666,
    positions: {
      stars: 0.16666666666666666,
    },
    signals: {
      stars: {
        value: 92927,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
  {
    canonicalName: 'Cline',
    providerName: 'cline',
    score: 0.3333333333333333,
    positions: {
      stars: 0.3333333333333333,
    },
    signals: {
      stars: {
        value: 63722,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
  {
    canonicalName: 'RooCode',
    providerName: 'roo-code',
    score: 0.4166666666666667,
    positions: {
      ext: 0,
      stars: 0.8333333333333334,
    },
    signals: {
      ext: {
        value: 1860099,
        source: 'open-vsx',
        period: 'cumulative',
      },
      stars: {
        value: 24267,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
  {
    canonicalName: 'Aider',
    providerName: 'aider',
    score: 0.5,
    positions: {
      stars: 0.5,
    },
    signals: {
      stars: {
        value: 46594,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
  {
    canonicalName: 'Continue',
    providerName: 'continue',
    score: 0.6666666666666666,
    positions: {
      stars: 0.6666666666666666,
    },
    signals: {
      stars: {
        value: 34289,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
  {
    canonicalName: 'GitHub Copilot Chat',
    providerName: 'copilot-chat',
    score: 1,
    positions: {
      stars: 1,
    },
    signals: {
      stars: {
        value: 9977,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
  {
    canonicalName: 'OpenCode',
    providerName: 'open-code',
    score: 1,
    positions: {
      ext: 1,
    },
    signals: {
      ext: {
        value: 393722,
        source: 'open-vsx',
        period: 'cumulative',
      },
    },
  },
]);

/** The generated popularity data artifact. */
export const POPULARITY_DATA: PopularityData = Object.freeze({
  resolvedOrder: RESOLVED_ORDER,
  targets: TARGETS_DATA,
  refreshedAt: '2026-06-23T09:29:18.454Z',
  refreshPeriod: '2026-06',
  poolSizeAcknowledgment: POOL_SIZE_ACKNOWLEDGMENT,
  disclaimer: DISCLAIMER,
  methodPointer: METHOD_POINTER,
});
