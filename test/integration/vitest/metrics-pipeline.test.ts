import { describe, it, expect } from 'vitest';
import { countCharacters } from '../../../src/features/textStats/metrics/characters';
import { countWords } from '../../../src/features/textStats/metrics/words';
import {
  countLines,
  countSelectionLines,
} from '../../../src/features/textStats/metrics/lines';
import { countParagraphs } from '../../../src/features/textStats/metrics/paragraphs';
import {
  calculateReadingTime,
  formatReadingTime,
} from '../../../src/features/textStats/metrics/readingTime';
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

/**
 * Integration tests for metric edge cases and branch coverage.
 * Exercises branches not hit by the main pipeline tests above.
 */
describe('metric edge cases integration', () => {
  describe('characters — includeWhitespace=false', () => {
    it('should exclude whitespace from character count', () => {
      const text = 'hello world\n\tfoo';
      const withWs = countCharacters(text, true);
      const withoutWs = countCharacters(text, false);
      expect(withoutWs).toBeLessThan(withWs);
      expect(withoutWs).toBe('helloworld'.length + 'foo'.length);
    });
  });

  describe('words — edge cases', () => {
    it('should return 0 for empty string', () => {
      expect(countWords('')).toBe(0);
    });

    it('should count words in whitespace-only text as 0', () => {
      expect(countWords('   \n\t  ')).toBe(0);
    });
  });

  describe('lines — edge cases', () => {
    it('should return 1 for empty string', () => {
      expect(countLines('')).toBe(1);
    });

    it('should count selection lines correctly', () => {
      expect(countSelectionLines(0, 5, 10)).toBe(6);
    });

    it('should subtract trailing empty line when endCharacter is 0', () => {
      // Selection from line 0 to line 5 with cursor at column 0 of line 5
      expect(countSelectionLines(0, 5, 0)).toBe(5);
    });

    it('should not subtract when selection is single line with endCharacter 0', () => {
      // Single line (raw=1), endCharacter 0 but raw is not > 1
      expect(countSelectionLines(3, 3, 0)).toBe(1);
    });
  });

  describe('paragraphs — edge cases', () => {
    it('should return 0 for empty string', () => {
      expect(countParagraphs('')).toBe(0);
    });

    it('should return 1 for single paragraph without blank lines', () => {
      expect(countParagraphs('hello world foo bar')).toBe(1);
    });
  });

  describe('readingTime — edge cases', () => {
    it('should return 0m 0s for zero words', () => {
      const time = calculateReadingTime(0, 200);
      expect(time.minutes).toBe(0);
      expect(time.seconds).toBe(0);
    });

    it('should format reading time as string', () => {
      const time = calculateReadingTime(400, 200);
      const formatted = formatReadingTime(time);
      expect(formatted).toBe('~2m 0s');
    });

    it('should format sub-minute reading time', () => {
      const time = calculateReadingTime(50, 200);
      const formatted = formatReadingTime(time);
      expect(formatted).toMatch(/^~0m \d+s$/);
    });
  });

  describe('size — edge cases', () => {
    it('should return "0 KB" for zero bytes', () => {
      expect(formatSize(0)).toBe('0 KB');
    });

    it('should show minimum 0.1 KB for very small files', () => {
      expect(formatSize(1)).toBe('0.1 KB');
    });

    it('should format MB for large files', () => {
      const oneMB = 1024 * 1024;
      const result = formatSize(oneMB);
      expect(result).toBe('1.0 MB');
    });

    it('should format multi-MB sizes', () => {
      const fiveMB = 5 * 1024 * 1024;
      const result = formatSize(fiveMB);
      expect(result).toBe('5.0 MB');
    });
  });
});

describe('formatter edge cases integration', () => {
  const BASE_CONFIG: TextStatsConfig = {
    enabled: true,
    delimiter: ' | ',
    unitSpace: true,
    wpm: 200,
    tokenizer: 'o200k',
    includeWhitespace: true,
    tokenSizeLimit: 500_000,
    visibleMetrics: [
      'chars',
      'tokens',
      'words',
      'lines',
      'paragraphs',
      'readTime',
      'size',
    ],
  };

  const SAMPLE_METRICS: MetricsResult = {
    chars: 100,
    tokens: 25,
    words: 20,
    lines: 5,
    paragraphs: 3,
    readingTime: { minutes: 0, seconds: 6 },
    size: '0.1 KB',
  };

  it('should format without unit spaces when unitSpace=false', () => {
    const config = { ...BASE_CONFIG, unitSpace: false };
    const text = formatStatusBarText(SAMPLE_METRICS, config);
    expect(text).toContain('100c');
    expect(text).toContain('25t');
    expect(text).toContain('20w');
  });

  it('should show em-dash when tokens is null', () => {
    const metrics = { ...SAMPLE_METRICS, tokens: null };
    const text = formatStatusBarText(metrics, BASE_CONFIG);
    expect(text).toContain('—');

    const tooltip = buildTooltipText(metrics, BASE_CONFIG);
    expect(tooltip).toContain('Tokens: —');
  });

  it('should show "without whitespace" label when includeWhitespace=false', () => {
    const config = { ...BASE_CONFIG, includeWhitespace: false };
    const tooltip = buildTooltipText(SAMPLE_METRICS, config);
    expect(tooltip).toContain('without whitespace');
  });

  it('should show "with whitespace" label when includeWhitespace=true', () => {
    const tooltip = buildTooltipText(SAMPLE_METRICS, BASE_CONFIG);
    expect(tooltip).toContain('with whitespace');
  });

  it('should respect visible metrics subset', () => {
    const config = {
      ...BASE_CONFIG,
      visibleMetrics: ['chars', 'words'] as TextStatsConfig['visibleMetrics'],
    };
    const text = formatStatusBarText(SAMPLE_METRICS, config);
    expect(text).toContain('c');
    expect(text).toContain('w');
    expect(text).not.toContain(' t');
    expect(text).not.toContain(' l');
  });

  it('should use custom delimiter', () => {
    const config = { ...BASE_CONFIG, delimiter: ' • ' };
    const text = formatStatusBarText(SAMPLE_METRICS, config);
    expect(text).toContain(' • ');
  });

  it('should show tokenizer model in tooltip', () => {
    const tooltip = buildTooltipText(SAMPLE_METRICS, BASE_CONFIG);
    expect(tooltip).toContain('o200k');
  });

  it('should show wpm in tooltip', () => {
    const tooltip = buildTooltipText(SAMPLE_METRICS, BASE_CONFIG);
    expect(tooltip).toContain('200 wpm');
  });

  it('should format full pipeline with includeWhitespace=false', async () => {
    const config = { ...BASE_CONFIG, includeWhitespace: false };
    const counter = new TokenCounter();
    const text = 'hello world  test';
    const metrics = await buildMetrics(counter, text, config);

    expect(metrics.chars).toBe('helloworldtest'.length);
    const statusBar = formatStatusBarText(metrics, config);
    expect(statusBar).toContain(`${String(metrics.chars)}`);
  });
});
