import { describe, it, expect } from 'vitest';
import {
  formatStatusBarText,
  buildTooltipText,
} from '../../../../src/features/textStats/formatter';
import type { MetricsResult } from '../../../../src/features/textStats/formatter';
import type { TextStatsConfig } from '../../../../src/types';

const fullMetrics: MetricsResult = {
  chars: 891,
  tokens: 438,
  words: 152,
  lines: 23,
  paragraphs: 5,
  readingTime: { minutes: 3, seconds: 24 },
  size: '1.2 KB',
};

const defaultConfig: TextStatsConfig = {
  enabled: true,
  delimiter: ' | ',
  unitSpace: true,
  wpm: 200,
  tokenizer: 'o200k',
  includeWhitespace: true,
  tokenSizeLimit: 500_000,
  visibleMetrics: ['chars', 'tokens', 'words', 'lines', 'paragraphs', 'readTime', 'size'],
};

describe('formatStatusBarText', () => {
  it('should format all metrics with default config', () => {
    const result = formatStatusBarText(fullMetrics, defaultConfig);
    expect(result).toBe('891 c | 438 t | 152 w | 23 l | 5 p | ~3m 24s | 1.2 KB');
  });

  it('should respect unitSpace: false', () => {
    const config = { ...defaultConfig, unitSpace: false };
    const result = formatStatusBarText(fullMetrics, config);
    expect(result).toBe('891c | 438t | 152w | 23l | 5p | ~3m 24s | 1.2 KB');
  });

  it('should respect custom delimiter', () => {
    const config = { ...defaultConfig, delimiter: ' · ' };
    const result = formatStatusBarText(fullMetrics, config);
    expect(result).toBe('891 c · 438 t · 152 w · 23 l · 5 p · ~3m 24s · 1.2 KB');
  });

  it('should show only selected metrics', () => {
    const config = { ...defaultConfig, visibleMetrics: ['words', 'lines'] as const };
    const result = formatStatusBarText(fullMetrics, { ...config });
    expect(result).toBe('152 w | 23 l');
  });

  it('should respect metric order from visibleMetrics', () => {
    const config = {
      ...defaultConfig,
      visibleMetrics: ['lines', 'words'] as const,
    };
    const result = formatStatusBarText(fullMetrics, { ...config });
    expect(result).toBe('23 l | 152 w');
  });

  it('should handle token fallback marker', () => {
    const metrics = { ...fullMetrics, tokens: null };
    const result = formatStatusBarText(metrics, defaultConfig);
    expect(result).toContain('— t');
  });

  it('should return empty string when no metrics are visible', () => {
    const config = { ...defaultConfig, visibleMetrics: [] as const };
    const result = formatStatusBarText(fullMetrics, { ...config });
    expect(result).toBe('');
  });

  it('should handle zero values', () => {
    const zeroMetrics: MetricsResult = {
      chars: 0,
      tokens: 0,
      words: 0,
      lines: 0,
      paragraphs: 0,
      readingTime: { minutes: 0, seconds: 0 },
      size: '0 KB',
    };
    const result = formatStatusBarText(zeroMetrics, defaultConfig);
    expect(result).toBe('0 c | 0 t | 0 w | 0 l | 0 p | ~0m 0s | 0 KB');
  });
});

describe('buildTooltipText', () => {
  it('should build multi-line tooltip with full labels', () => {
    const result = buildTooltipText(fullMetrics, defaultConfig);
    expect(result).toContain('Characters: 891');
    expect(result).toContain('Tokens: 438 (o200k)');
    expect(result).toContain('Words: 152');
    expect(result).toContain('Lines: 23');
    expect(result).toContain('Paragraphs: 5');
    expect(result).toContain('Reading time: ~3m 24s (200 wpm)');
    expect(result).toContain('Size: 1.2 KB');
  });

  it('should indicate whitespace mode in tooltip', () => {
    const withWs = buildTooltipText(fullMetrics, defaultConfig);
    expect(withWs).toContain('(with whitespace)');

    const noWs = buildTooltipText(fullMetrics, {
      ...defaultConfig,
      includeWhitespace: false,
    });
    expect(noWs).toContain('(without whitespace)');
  });

  it('should show fallback in tooltip when tokens are null', () => {
    const result = buildTooltipText({ ...fullMetrics, tokens: null }, defaultConfig);
    expect(result).toContain('Tokens: —');
  });
});
