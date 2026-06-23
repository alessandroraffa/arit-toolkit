import { describe, it, expect } from 'vitest';
import {
  computeDenseRanks,
  normalizeRank,
  scoreTargets,
  resolveOrder,
  CANONICAL_NAMES,
  POOL_SIZE_ACKNOWLEDGMENT,
} from '../../../../../src/features/agentSessionsArchiving/providers/popularityScoring';
import type { TargetSignals } from '../../../../../src/features/agentSessionsArchiving/providers/popularityScoring';

describe('popularityScoring', () => {
  describe('computeDenseRanks', () => {
    it('should assign dense ranks with a shared rank', () => {
      // Three targets with raw values [100, 80, 80]
      // Rank 1 = highest = 100, Rank 2 = 80 and 80
      const ranks = computeDenseRanks([100, 80, 80]);
      expect(ranks).toEqual([1, 2, 2]);
    });

    it('should not sort the input in place', () => {
      const input = [80, 100, 80];
      const ranks = computeDenseRanks(input);
      expect(input).toEqual([80, 100, 80]);
      expect(ranks).toEqual([2, 1, 2]);
    });

    it('should handle a single value', () => {
      const ranks = computeDenseRanks([500]);
      expect(ranks).toEqual([1]);
    });

    it('should handle all-tied values', () => {
      const ranks = computeDenseRanks([50, 50, 50, 50]);
      expect(ranks).toEqual([1, 1, 1, 1]);
    });
  });

  describe('normalizeRank', () => {
    it('should return 0 for sole possessor (maxDenseRank = 1)', () => {
      // pool-size-comparable normalization: maxDenseRank > 1 guard evaluates false
      expect(normalizeRank(1, 1)).toBe(0);
    });

    it('should return 0 for rank 1 in a two-target pool', () => {
      expect(normalizeRank(1, 2)).toBe(0);
    });

    it('should return 1 for rank 2 in a two-target pool', () => {
      expect(normalizeRank(2, 2)).toBe(1);
    });

    it('should compute (denseRank - 1) / (maxDenseRank - 1) for intermediate ranks', () => {
      // rank 2 of max 3: (2-1)/(3-1) = 0.5
      expect(normalizeRank(2, 3)).toBe(0.5);
    });
  });

  describe('scoreTargets', () => {
    it('should compute dense ranks with a shared rank for one signal', () => {
      const targets: TargetSignals[] = [
        { name: 'A', cli: { value: 100, source: 'npm', period: '2026-06' } },
        { name: 'B', cli: { value: 80, source: 'npm', period: '2026-06' } },
        { name: 'C', cli: { value: 80, source: 'npm', period: '2026-06' } },
      ];
      const scored = scoreTargets(targets);
      const a = scored.find((s) => s.name === 'A')!;
      const b = scored.find((s) => s.name === 'B')!;
      const c = scored.find((s) => s.name === 'C')!;
      // rank 1 gets position 0, rank 2 gets position (2-1)/(2-1) = 1.0
      expect(a.positions.cli).toBe(0);
      expect(b.positions.cli).toBe(1.0);
      expect(c.positions.cli).toBe(1.0);
    });

    it('should map sole possessor to position 0 (maxDenseRank = 1)', () => {
      const targets: TargetSignals[] = [
        { name: 'A', cli: { value: 500, source: 'npm', period: '2026-06' } },
      ];
      const scored = scoreTargets(targets);
      expect(scored[0]!.positions.cli).toBe(0);
      expect(scored[0]!.score).toBe(0);
    });

    it('should produce positions 0 and 1 for two targets with distinct values', () => {
      const targets: TargetSignals[] = [
        { name: 'A', cli: { value: 100, source: 'npm', period: '2026-06' } },
        { name: 'B', cli: { value: 50, source: 'npm', period: '2026-06' } },
      ];
      const scored = scoreTargets(targets);
      const a = scored.find((s) => s.name === 'A')!;
      const b = scored.find((s) => s.name === 'B')!;
      expect(a.positions.cli).toBe(0);
      expect(b.positions.cli).toBe(1);
    });

    it('should give all-tied pool position 0 for all (maxDenseRank = 1)', () => {
      const targets: TargetSignals[] = [
        { name: 'A', cli: { value: 100, source: 'npm', period: '2026-06' } },
        { name: 'B', cli: { value: 100, source: 'npm', period: '2026-06' } },
        { name: 'C', cli: { value: 100, source: 'npm', period: '2026-06' } },
        { name: 'D', cli: { value: 100, source: 'npm', period: '2026-06' } },
      ];
      const scored = scoreTargets(targets);
      for (const s of scored) {
        expect(s.positions.cli).toBe(0);
        expect(s.score).toBe(0);
      }
    });

    it('should average over possessed signals only (missing cli not in denominator)', () => {
      // Target has ext and stars but NO cli
      const targets: TargetSignals[] = [
        {
          name: 'A',
          ext: { value: 100, source: 'marketplace', period: 'cumulative' },
          stars: { value: 200, source: 'github', period: 'cumulative' },
        },
        {
          name: 'B',
          ext: { value: 50, source: 'marketplace', period: 'cumulative' },
          stars: { value: 100, source: 'github', period: 'cumulative' },
        },
      ];
      const scored = scoreTargets(targets);
      const a = scored.find((s) => s.name === 'A')!;
      // A has ext position 0, stars position 0 -> average = 0
      expect(a.positions.cli).toBeUndefined();
      expect(a.score).toBe(0);
    });

    it('should target with no signal receives score 0 and empty positions', () => {
      const targets: TargetSignals[] = [{ name: 'A' }];
      const scored = scoreTargets(targets);
      expect(scored[0]!.score).toBe(0);
      expect(scored[0]!.positions).toEqual({});
    });
  });

  describe('resolveOrder', () => {
    it('should sort ascending by score (lowest score = most popular = index 0)', () => {
      const targets: TargetSignals[] = [
        { name: 'Low', cli: { value: 10, source: 'npm', period: '2026-06' } },
        { name: 'High', cli: { value: 1000, source: 'npm', period: '2026-06' } },
      ];
      const order = resolveOrder(targets);
      // High has more downloads => rank 1 => position 0 => lowest score
      expect(order[0]).toBe('High');
      expect(order[1]).toBe('Low');
    });

    it('should break ties by case-insensitive ASCII ascending name', () => {
      const targets: TargetSignals[] = [
        { name: 'Cline', cli: { value: 100, source: 'npm', period: '2026-06' } },
        { name: 'Aider', cli: { value: 100, source: 'npm', period: '2026-06' } },
      ];
      const order = resolveOrder(targets);
      expect(order[0]).toBe('Aider');
      expect(order[1]).toBe('Cline');
    });

    it('should be input-order independent (same eight targets shuffled three ways)', () => {
      const eight: TargetSignals[] = [
        {
          name: 'Aider',
          cli: { value: 900, source: 'pypi', period: '2026-06' },
          stars: { value: 800, source: 'github', period: 'cumulative' },
        },
        {
          name: 'Claude Code',
          cli: { value: 1000, source: 'npm', period: '2026-06' },
          ext: { value: 950, source: 'marketplace', period: 'cumulative' },
          stars: { value: 750, source: 'github', period: 'cumulative' },
        },
        {
          name: 'Cline',
          ext: { value: 700, source: 'marketplace', period: 'cumulative' },
          stars: { value: 600, source: 'github', period: 'cumulative' },
        },
        {
          name: 'Continue',
          cli: { value: 400, source: 'npm', period: '2026-06' },
          ext: { value: 300, source: 'marketplace', period: 'cumulative' },
          stars: { value: 500, source: 'github', period: 'cumulative' },
        },
        {
          name: 'GitHub Copilot Chat',
          ext: { value: 850, source: 'marketplace', period: 'cumulative' },
          stars: { value: 200, source: 'github', period: 'cumulative' },
        },
        {
          name: 'OpenAI Codex',
          cli: { value: 600, source: 'npm', period: '2026-06' },
          ext: { value: 500, source: 'marketplace', period: 'cumulative' },
          stars: { value: 400, source: 'github', period: 'cumulative' },
        },
        {
          name: 'OpenCode',
          cli: { value: 300, source: 'npm', period: '2026-06' },
          ext: { value: 250, source: 'marketplace', period: 'cumulative' },
          stars: { value: 350, source: 'github', period: 'cumulative' },
        },
        {
          name: 'RooCode',
          ext: { value: 650, source: 'marketplace', period: 'cumulative' },
          stars: { value: 550, source: 'github', period: 'cumulative' },
        },
      ];

      const order1 = resolveOrder([...eight]);
      const shuffled2 = [
        eight[3]!,
        eight[7]!,
        eight[1]!,
        eight[5]!,
        eight[0]!,
        eight[6]!,
        eight[4]!,
        eight[2]!,
      ];
      const order2 = resolveOrder(shuffled2);
      const shuffled3 = [
        eight[6]!,
        eight[2]!,
        eight[4]!,
        eight[0]!,
        eight[7]!,
        eight[5]!,
        eight[1]!,
        eight[3]!,
      ];
      const order3 = resolveOrder(shuffled3);

      expect(JSON.stringify(order1)).toBe(JSON.stringify(order2));
      expect(JSON.stringify(order1)).toBe(JSON.stringify(order3));
    });

    it('should produce the same order when input is fully reversed ASCII-alphabetically', () => {
      const forward: TargetSignals[] = [
        {
          name: 'Aider',
          cli: { value: 900, source: 'pypi', period: '2026-06' },
          stars: { value: 800, source: 'github', period: 'cumulative' },
        },
        {
          name: 'Claude Code',
          cli: { value: 1000, source: 'npm', period: '2026-06' },
          ext: { value: 950, source: 'marketplace', period: 'cumulative' },
          stars: { value: 750, source: 'github', period: 'cumulative' },
        },
        {
          name: 'Cline',
          ext: { value: 700, source: 'marketplace', period: 'cumulative' },
          stars: { value: 600, source: 'github', period: 'cumulative' },
        },
        {
          name: 'Continue',
          cli: { value: 400, source: 'npm', period: '2026-06' },
          ext: { value: 300, source: 'marketplace', period: 'cumulative' },
          stars: { value: 500, source: 'github', period: 'cumulative' },
        },
        {
          name: 'GitHub Copilot Chat',
          ext: { value: 850, source: 'marketplace', period: 'cumulative' },
          stars: { value: 200, source: 'github', period: 'cumulative' },
        },
        {
          name: 'OpenAI Codex',
          cli: { value: 600, source: 'npm', period: '2026-06' },
          ext: { value: 500, source: 'marketplace', period: 'cumulative' },
          stars: { value: 400, source: 'github', period: 'cumulative' },
        },
        {
          name: 'OpenCode',
          cli: { value: 300, source: 'npm', period: '2026-06' },
          ext: { value: 250, source: 'marketplace', period: 'cumulative' },
          stars: { value: 350, source: 'github', period: 'cumulative' },
        },
        {
          name: 'RooCode',
          ext: { value: 650, source: 'marketplace', period: 'cumulative' },
          stars: { value: 550, source: 'github', period: 'cumulative' },
        },
      ];

      const reversed = [...forward].reverse();
      expect(JSON.stringify(resolveOrder(forward))).toBe(
        JSON.stringify(resolveOrder(reversed))
      );
    });
  });

  describe('CANONICAL_NAMES', () => {
    it('should contain all eight canonical names', () => {
      expect(CANONICAL_NAMES).toEqual(
        Object.freeze([
          'Aider',
          'Claude Code',
          'Cline',
          'Continue',
          'GitHub Copilot Chat',
          'OpenAI Codex',
          'OpenCode',
          'RooCode',
        ])
      );
    });

    it('should be frozen (readonly)', () => {
      expect(Object.isFrozen(CANONICAL_NAMES)).toBe(true);
    });
  });

  describe('POOL_SIZE_ACKNOWLEDGMENT', () => {
    it('should be a non-empty string documenting the pool-size property', () => {
      expect(typeof POOL_SIZE_ACKNOWLEDGMENT).toBe('string');
      expect(POOL_SIZE_ACKNOWLEDGMENT.length).toBeGreaterThan(0);
    });
  });
});
