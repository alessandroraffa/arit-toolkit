import { describe, it, expect } from 'vitest';
import { countCharacters } from '../../../src/features/textStats/metrics/characters';
import { countWords } from '../../../src/features/textStats/metrics/words';
import { countLines } from '../../../src/features/textStats/metrics/lines';
import { countParagraphs } from '../../../src/features/textStats/metrics/paragraphs';
import { calculateReadingTime } from '../../../src/features/textStats/metrics/readingTime';
import { formatSize } from '../../../src/features/textStats/metrics/size';
import { TokenCounter } from '../../../src/features/textStats/metrics/tokens';
import {
  formatStatusBarText,
  buildTooltipText,
} from '../../../src/features/textStats/formatter';
import type { MetricsResult } from '../../../src/features/textStats/formatter';
import type { TextStatsConfig } from '../../../src/types';

const SAMPLE_TEXT = [
  'The quick brown fox jumps over the lazy dog.',
  '',
  'Pack my box with five dozen liquor jugs.',
  '',
  'How vexingly quick daft zebras jump!',
].join('\n');

const DEFAULT_CONFIG: TextStatsConfig = {
  enabled: true,
  delimiter: ' | ',
  unitSpace: true,
  wpm: 200,
  tokenizer: 'o200k',
  includeWhitespace: true,
  tokenSizeLimit: 500_000,
  visibleMetrics: ['chars', 'tokens', 'words', 'lines', 'paragraphs', 'readTime', 'size'],
};

/**
 * Integration tests for the full metrics pipeline.
 * No mocks — exercises real metric functions, real tokenizer,
 * and real formatter together.
 */
describe('metrics pipeline integration', () => {
  describe('individual metrics produce correct types on real text', () => {
    it('should count characters as a number', () => {
      const chars = countCharacters(SAMPLE_TEXT, true);
      expect(chars).toBeTypeOf('number');
      expect(chars).toBeGreaterThan(0);
    });

    it('should count words as a positive integer', () => {
      const words = countWords(SAMPLE_TEXT);
      expect(words).toBeTypeOf('number');
      expect(words).toBeGreaterThan(0);
    });

    it('should count lines for multi-line text', () => {
      const lines = countLines(SAMPLE_TEXT);
      expect(lines).toBe(5);
    });

    it('should count paragraphs separated by blank lines', () => {
      const paras = countParagraphs(SAMPLE_TEXT);
      expect(paras).toBe(3);
    });

    it('should calculate reading time from real word count', () => {
      const words = countWords(SAMPLE_TEXT);
      const time = calculateReadingTime(words, 200);
      expect(time.minutes).toBeTypeOf('number');
      expect(time.seconds).toBeTypeOf('number');
      expect(time.minutes + time.seconds).toBeGreaterThan(0);
    });

    it('should format size from real byte count', () => {
      const bytes = Buffer.byteLength(SAMPLE_TEXT, 'utf8');
      const size = formatSize(bytes);
      expect(size).toMatch(/\d+(\.\d+)?\s*(KB|MB)/);
    });
  });

  describe('full pipeline: text to formatted output', () => {
    it('should produce a complete MetricsResult without null tokens', async () => {
      const counter = new TokenCounter();
      const chars = countCharacters(SAMPLE_TEXT, true);
      const words = countWords(SAMPLE_TEXT);
      const lines = countLines(SAMPLE_TEXT);
      const paragraphs = countParagraphs(SAMPLE_TEXT);
      const readingTime = calculateReadingTime(words, 200);
      const bytes = Buffer.byteLength(SAMPLE_TEXT, 'utf8');
      const size = formatSize(bytes);
      const tokens = await counter.countTokens(SAMPLE_TEXT, 'o200k');

      const metrics: MetricsResult = {
        chars,
        tokens,
        words,
        lines,
        paragraphs,
        readingTime,
        size,
      };

      expect(metrics.chars).toBeGreaterThan(0);
      expect(metrics.tokens).not.toBeNull();
      expect(metrics.tokens).toBeGreaterThan(0);
      expect(metrics.words).toBeGreaterThan(0);
      expect(metrics.lines).toBe(5);
      expect(metrics.paragraphs).toBe(3);
    });

    it('should format valid status bar text', async () => {
      const counter = new TokenCounter();
      const metrics = await buildMetrics(counter, SAMPLE_TEXT, DEFAULT_CONFIG);
      const text = formatStatusBarText(metrics, DEFAULT_CONFIG);

      expect(text).toBeTruthy();
      expect(text).not.toContain('—');
      expect(text).toContain('c');
      expect(text).toContain('t');
      expect(text).toContain('w');
    });

    it('should format valid tooltip text', async () => {
      const counter = new TokenCounter();
      const metrics = await buildMetrics(counter, SAMPLE_TEXT, DEFAULT_CONFIG);
      const tooltip = buildTooltipText(metrics, DEFAULT_CONFIG);

      expect(tooltip).toContain('Characters:');
      expect(tooltip).toContain('Tokens:');
      expect(tooltip).not.toContain('—');
      expect(tooltip).toContain('Words:');
      expect(tooltip).toContain('Lines:');
    });

    it('should work with claude tokenizer in the pipeline', async () => {
      const config: TextStatsConfig = { ...DEFAULT_CONFIG, tokenizer: 'claude' };
      const counter = new TokenCounter();
      const metrics = await buildMetrics(counter, SAMPLE_TEXT, config);
      const text = formatStatusBarText(metrics, config);

      expect(text).not.toContain('—');
      expect(metrics.tokens).not.toBeNull();
    });

    it('should work with cl100k tokenizer in the pipeline', async () => {
      const config: TextStatsConfig = { ...DEFAULT_CONFIG, tokenizer: 'cl100k' };
      const counter = new TokenCounter();
      const metrics = await buildMetrics(counter, SAMPLE_TEXT, config);
      const text = formatStatusBarText(metrics, config);

      expect(text).not.toContain('—');
      expect(metrics.tokens).not.toBeNull();
    });
  });

  describe('formatter never shows em-dash for successful tokenization', () => {
    it('should show numeric token count, not em-dash', async () => {
      const counter = new TokenCounter();

      for (const model of ['o200k', 'cl100k', 'claude'] as const) {
        const config: TextStatsConfig = { ...DEFAULT_CONFIG, tokenizer: model };
        const metrics = await buildMetrics(counter, 'hello world', config);
        const text = formatStatusBarText(metrics, config);
        const tooltip = buildTooltipText(metrics, config);

        expect(text, `status bar with ${model}`).not.toContain('—');
        expect(tooltip, `tooltip with ${model}`).not.toContain('—');
      }
    });
  });
});

async function buildMetrics(
  counter: TokenCounter,
  text: string,
  config: TextStatsConfig
): Promise<MetricsResult> {
  const chars = countCharacters(text, config.includeWhitespace);
  const words = countWords(text);
  const lines = countLines(text);
  const paragraphs = countParagraphs(text);
  const readingTime = calculateReadingTime(words, config.wpm);
  const bytes = Buffer.byteLength(text, 'utf8');
  const size = formatSize(bytes);
  const tokens = await counter.countTokens(text, config.tokenizer);

  return { chars, tokens, words, lines, paragraphs, readingTime, size };
}
