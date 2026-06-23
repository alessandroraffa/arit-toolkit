import type { PopularityData } from '../../../../../../src/features/agentSessionsArchiving/providers/popularityData';
import { POOL_SIZE_ACKNOWLEDGMENT } from '../../../../../../src/features/agentSessionsArchiving/providers/popularityScoring';
import {
  DISCLAIMER,
  METHOD_POINTER,
} from '../../../../../../src/features/agentSessionsArchiving/providers/popularityData';

/**
 * Fixture PopularityData instance for unit tests. Uses alphabetical resolved
 * order as a stable, predictable sort baseline.
 *
 * refreshedAt is deliberately stale (more than two cadence periods before any
 * realistic test run date) so staleness-aware tests can distinguish the fixture
 * from a fresh artifact without requiring wall-clock mocking.
 */
export const FIXTURE_POPULARITY_DATA: PopularityData = {
  resolvedOrder: Object.freeze([
    'Aider',
    'Claude Code',
    'Cline',
    'Continue',
    'GitHub Copilot Chat',
    'OpenAI Codex',
    'OpenCode',
    'RooCode',
  ]) as readonly string[],
  targets: Object.freeze([
    {
      canonicalName: 'Aider',
      providerName: 'aider',
      score: 0.1,
      positions: { cli: 0.1, stars: 0.1 },
      signals: {
        cli: { value: 90000, source: 'pypi', period: '2025-01' },
        stars: { value: 18000, source: 'github', period: 'cumulative' },
      },
    },
    {
      canonicalName: 'Claude Code',
      providerName: 'claude-code',
      score: 0.2,
      positions: { cli: 0.2, ext: 0.2, stars: 0.2 },
      signals: {
        cli: { value: 80000, source: 'npm', period: '2025-01' },
        ext: { value: 70000, source: 'marketplace', period: 'cumulative' },
        stars: { value: 16000, source: 'github', period: 'cumulative' },
      },
    },
    {
      canonicalName: 'Cline',
      providerName: 'cline',
      score: 0.3,
      positions: { ext: 0.3, stars: 0.3 },
      signals: {
        ext: { value: 60000, source: 'marketplace', period: 'cumulative' },
        stars: { value: 14000, source: 'github', period: 'cumulative' },
      },
    },
    {
      canonicalName: 'Continue',
      providerName: 'continue',
      score: 0.4,
      positions: { cli: 0.4, ext: 0.4, stars: 0.4 },
      signals: {
        cli: { value: 50000, source: 'npm', period: '2025-01' },
        ext: { value: 40000, source: 'marketplace', period: 'cumulative' },
        stars: { value: 12000, source: 'github', period: 'cumulative' },
      },
    },
    {
      canonicalName: 'GitHub Copilot Chat',
      providerName: 'copilot-chat',
      score: 0.5,
      positions: { ext: 0.5, stars: 0.5 },
      signals: {
        ext: { value: 30000, source: 'marketplace', period: 'cumulative' },
        stars: { value: 10000, source: 'github', period: 'cumulative' },
      },
    },
    {
      canonicalName: 'OpenAI Codex',
      providerName: 'codex',
      score: 0.6,
      positions: { cli: 0.6, ext: 0.6, stars: 0.6 },
      signals: {
        cli: { value: 20000, source: 'npm', period: '2025-01' },
        ext: { value: 18000, source: 'marketplace', period: 'cumulative' },
        stars: { value: 8000, source: 'github', period: 'cumulative' },
      },
    },
    {
      canonicalName: 'OpenCode',
      providerName: 'open-code',
      score: 0.7,
      positions: { cli: 0.7, ext: 0.7, stars: 0.7 },
      signals: {
        cli: { value: 10000, source: 'npm', period: '2025-01' },
        ext: { value: 8000, source: 'marketplace', period: 'cumulative' },
        stars: { value: 6000, source: 'github', period: 'cumulative' },
      },
    },
    {
      canonicalName: 'RooCode',
      providerName: 'roo-code',
      score: 0.8,
      positions: { ext: 0.8, stars: 0.8 },
      signals: {
        ext: { value: 5000, source: 'marketplace', period: 'cumulative' },
        stars: { value: 4000, source: 'github', period: 'cumulative' },
      },
    },
  ]) as PopularityData['targets'],
  refreshedAt: '2025-01-01T00:00:00.000Z',
  refreshPeriod: '2025-01',
  poolSizeAcknowledgment: POOL_SIZE_ACKNOWLEDGMENT,
  disclaimer: DISCLAIMER,
  methodPointer: METHOD_POINTER,
};
