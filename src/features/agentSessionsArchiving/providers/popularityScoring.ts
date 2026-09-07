/**
 * Pure popularity scoring and ordering component.
 *
 * Normalization formula (see docs/popularity-ranking-method.md):
 *   position = maxDenseRank > 1 ? (denseRank - 1) / (maxDenseRank - 1) : 0
 * Best end is 0 (most popular), worst end is 1, sole possessor maps to 0.
 *
 * Ordering direction: ascending by average normalized position — lowest score
 * sorts first (most popular at index 0).
 *
 * Tie-break rule: when two targets share the same average score, they are
 * ordered by their canonical name collated case-insensitive ASCII lexicographic
 * ascending using name.toLowerCase() (not localeCompare).
 *
 * This module is pure and side-effect-free. It performs no network access,
 * no filesystem access, and no random operations. Given the same input it
 * always produces the same output.
 */

/** A single raw signal value recorded from one public source. */
export interface RawSignal {
  value: number;
  source: string;
  period: string;
}

/**
 * The signals possessed by one target. A missing field means the target does
 * not possess that signal and it is excluded from that target's scoring.
 */
export interface TargetSignals {
  name: string;
  cli?: RawSignal;
  ext?: RawSignal;
  stars?: RawSignal;
}

/**
 * A target after scoring. `score` is the arithmetic mean of the positions the
 * target possesses. `positions` contains only the signals the target possesses.
 */
export interface ScoredTarget {
  name: string;
  score: number;
  positions: {
    cli?: number;
    ext?: number;
    stars?: number;
  };
}

type SignalKey = 'cli' | 'ext' | 'stars';

interface Possessor {
  idx: number;
  value: number;
}

/**
 * Given raw values (one per possessing target, any order), returns dense ranks
 * in the same positional order. Rank 1 is highest. Equal values share a rank;
 * the next distinct value takes the immediately following rank with no gap.
 * Does not sort the input in place.
 */
export function computeDenseRanks(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => b - a);
  const rankMap = new Map<number, number>();
  let currentRank = 1;
  for (const v of sorted) {
    if (!rankMap.has(v)) {
      rankMap.set(v, currentRank);
      currentRank++;
    }
  }
  return values.map((v) => rankMap.get(v) ?? currentRank);
}

/**
 * Applies the best-end-zero normalization:
 *   maxDenseRank > 1 ? (denseRank - 1) / (maxDenseRank - 1) : 0
 * Returns a value in [0, 1].
 */
export function normalizeRank(denseRank: number, maxDenseRank: number): number {
  return maxDenseRank > 1 ? (denseRank - 1) / (maxDenseRank - 1) : 0;
}

function collectPossessors(targets: TargetSignals[], key: SignalKey): Possessor[] {
  const possessors: Possessor[] = [];
  for (let i = 0; i < targets.length; i++) {
    const sig = targets[i]?.[key];
    if (sig !== undefined) {
      possessors.push({ idx: i, value: sig.value });
    }
  }
  return possessors;
}

function scoreSignalFamily(
  result: ScoredTarget[],
  targets: TargetSignals[],
  key: SignalKey
): void {
  const possessors = collectPossessors(targets, key);
  if (possessors.length === 0) return;

  const rawValues = possessors.map((p) => p.value);
  const ranks = computeDenseRanks(rawValues);
  const maxRank = Math.max(...ranks);

  for (let j = 0; j < possessors.length; j++) {
    const possessor = possessors[j];
    const rank = ranks[j];
    if (possessor === undefined || rank === undefined) continue;
    const position = normalizeRank(rank, maxRank);
    const scored = result[possessor.idx];
    if (scored !== undefined) {
      scored.positions[key] = position;
    }
  }
}

function computeAverageScore(positions: ScoredTarget['positions']): number {
  const posValues = Object.values(positions);
  if (posValues.length === 0) return 0;
  return posValues.reduce((sum, v) => sum + v, 0) / posValues.length;
}

/**
 * For each signal family (CLI, EXT, STARS), collects the targets that possess
 * it, computes dense ranks on their raw values, normalizes each rank, and
 * stores the position on the ScoredTarget. Each target's score is the
 * arithmetic mean of its possessed-signal positions.
 */
export function scoreTargets(targets: TargetSignals[]): ScoredTarget[] {
  const result: ScoredTarget[] = targets.map((t) => ({
    name: t.name,
    score: 0,
    positions: {},
  }));

  const families: SignalKey[] = ['cli', 'ext', 'stars'];
  for (const key of families) {
    scoreSignalFamily(result, targets, key);
  }

  for (const scored of result) {
    scored.score = computeAverageScore(scored.positions);
  }

  return result;
}

/**
 * Calls scoreTargets, sorts results ascending by score, ties broken by target
 * name collated case-insensitive ASCII lexicographic ascending using
 * name.toLowerCase(). Returns the name array in resolved order (lowest score =
 * most popular = index 0).
 */
export function resolveOrder(targets: TargetSignals[]): string[] {
  const scored = scoreTargets(targets);
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const la = a.name.toLowerCase();
    const lb = b.name.toLowerCase();
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
  return scored.map((s) => s.name);
}

/** The eight canonical display names of the supported targets. */
export const CANONICAL_NAMES: readonly string[] = Object.freeze([
  'Aider',
  'Claude Code',
  'Cline',
  'Continue',
  'GitHub Copilot Chat',
  'OpenAI Codex',
  'OpenCode',
  'RooCode',
]);

/**
 * Acknowledgment text documenting the pool-size-comparable property of
 * rank-based aggregation, as required by SPEC-004 AC4.
 */
export const POOL_SIZE_ACKNOWLEDGMENT =
  'Popularity scores use rank-based aggregation. A target that ranks best within a smaller pool of signal possessors attains the top relative position on that signal — an accepted property of rank-based aggregation that discards magnitude for robustness.';
