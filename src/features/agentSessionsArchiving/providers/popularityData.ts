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
 * DISCLAIMER: exported as a named constant so it travels with the artifact wherever
 * the module is imported, co-locating the disclaimer with every public surface of
 * the order (INIT-006 reputational posture; PLAN-006 Decision 2).
 *
 * METHOD_POINTER: a repository-relative path to the documented aggregation method,
 * exported alongside the data for the same co-location reason.
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

const PLACEHOLDER_ORDER: readonly string[] = Object.freeze([
  'Claude Code',
  'GitHub Copilot Chat',
  'OpenAI Codex',
  'Cline',
  'RooCode',
  'Continue',
  'Aider',
  'OpenCode',
]);

const PLACEHOLDER_TARGETS: PopularityData['targets'] = Object.freeze([]);

/** The generated popularity data artifact. Placeholder until first refresh run. */
export const POPULARITY_DATA: PopularityData = Object.freeze({
  resolvedOrder: PLACEHOLDER_ORDER,
  targets: PLACEHOLDER_TARGETS,
  refreshedAt: 'not-yet-refreshed',
  refreshPeriod: 'not-yet-refreshed',
  poolSizeAcknowledgment: POOL_SIZE_ACKNOWLEDGMENT,
  disclaimer: DISCLAIMER,
  methodPointer: METHOD_POINTER,
});
