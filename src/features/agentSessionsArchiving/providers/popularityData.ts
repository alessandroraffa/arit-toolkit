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
  'GitHub Copilot Chat',
  'OpenCode',
  'Aider',
  'Continue',
  'RooCode',
]);

const TARGETS_DATA: readonly TargetRecord[] = Object.freeze([
  {
    canonicalName: 'Claude Code',
    providerName: 'claude-code',
    score: 0.1865079365079365,
    positions: {
      cli: 0.25,
      ext: 0.16666666666666666,
      stars: 0.14285714285714285,
    },
    signals: {
      cli: {
        value: 42766154,
        source: 'npm',
        period: '2026-07',
      },
      ext: {
        value: 19198698,
        source: 'marketplace',
        period: 'cumulative',
      },
      stars: {
        value: 135213,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
  {
    canonicalName: 'OpenAI Codex',
    providerName: 'codex',
    score: 0.20634920634920637,
    positions: {
      cli: 0,
      ext: 0.3333333333333333,
      stars: 0.2857142857142857,
    },
    signals: {
      cli: {
        value: 45794237,
        source: 'npm',
        period: '2026-07',
      },
      ext: {
        value: 11096497,
        source: 'marketplace',
        period: 'cumulative',
      },
      stars: {
        value: 94757,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
  {
    canonicalName: 'Cline',
    providerName: 'cline',
    score: 0.4642857142857143,
    positions: {
      ext: 0.5,
      stars: 0.42857142857142855,
    },
    signals: {
      ext: {
        value: 4506733,
        source: 'marketplace',
        period: 'cumulative',
      },
      stars: {
        value: 64152,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
  {
    canonicalName: 'GitHub Copilot Chat',
    providerName: 'copilot-chat',
    score: 0.5,
    positions: {
      ext: 0,
      stars: 1,
    },
    signals: {
      ext: {
        value: 76092217,
        source: 'marketplace',
        period: 'cumulative',
      },
      stars: {
        value: 9978,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
  {
    canonicalName: 'OpenCode',
    providerName: 'open-code',
    score: 0.5,
    positions: {
      cli: 0.5,
      ext: 1,
      stars: 0,
    },
    signals: {
      cli: {
        value: 9089093,
        source: 'npm',
        period: '2026-07',
      },
      ext: {
        value: 782308,
        source: 'marketplace',
        period: 'cumulative',
      },
      stars: {
        value: 181041,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
  {
    canonicalName: 'Aider',
    providerName: 'aider',
    score: 0.6607142857142857,
    positions: {
      cli: 0.75,
      stars: 0.5714285714285714,
    },
    signals: {
      cli: {
        value: 865900,
        source: 'pypi',
        period: '2026-07',
      },
      stars: {
        value: 46890,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
  {
    canonicalName: 'Continue',
    providerName: 'continue',
    score: 0.7936507936507936,
    positions: {
      cli: 1,
      ext: 0.6666666666666666,
      stars: 0.7142857142857143,
    },
    signals: {
      cli: {
        value: 21660,
        source: 'npm',
        period: '2026-07',
      },
      ext: {
        value: 3514231,
        source: 'marketplace',
        period: 'cumulative',
      },
      stars: {
        value: 34611,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
  {
    canonicalName: 'RooCode',
    providerName: 'roo-code',
    score: 0.8452380952380952,
    positions: {
      ext: 0.8333333333333334,
      stars: 0.8571428571428571,
    },
    signals: {
      ext: {
        value: 1790114,
        source: 'marketplace',
        period: 'cumulative',
      },
      stars: {
        value: 24305,
        source: 'github',
        period: 'cumulative',
      },
    },
  },
]);

/** The generated popularity data artifact. */
export const POPULARITY_DATA: PopularityData = Object.freeze({
  resolvedOrder: RESOLVED_ORDER,
  targets: TARGETS_DATA,
  refreshedAt: '2026-07-01T07:21:06.330Z',
  refreshPeriod: '2026-07',
  poolSizeAcknowledgment: POOL_SIZE_ACKNOWLEDGMENT,
  disclaimer: DISCLAIMER,
  methodPointer: METHOD_POINTER,
});
