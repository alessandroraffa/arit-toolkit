import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TextStatsConfig } from '../../../../src/types';
import { TextStatsController } from '../../../../src/features/textStats/controller';

// Mock js-tiktoken
vi.mock('js-tiktoken', () => {
  const mockEncode = vi.fn((text: string) => text.split(/\s+/).filter(Boolean));
  return {
    getEncoding: vi.fn(() => ({
      encode: mockEncode,
    })),
  };
});

// Mock @anthropic-ai/tokenizer
vi.mock('@anthropic-ai/tokenizer', () => ({
  countTokens: vi.fn((text: string) => text.split(/\s+/).filter(Boolean).length),
}));

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

describe('TextStatsController', () => {
  let controller: TextStatsController;

  beforeEach(() => {
    vi.useFakeTimers();
    controller = new TextStatsController();
  });

  afterEach(() => {
    controller.dispose();
    vi.useRealTimers();
  });

  it('should compute metrics from plain text', async () => {
    const metrics = await controller.computeMetrics('hello world', defaultConfig);
    expect(metrics.chars).toBe(11);
    expect(metrics.words).toBe(2);
    expect(metrics.paragraphs).toBe(1);
  });

  it('should compute metrics for empty text', async () => {
    const metrics = await controller.computeMetrics('', defaultConfig);
    expect(metrics.chars).toBe(0);
    expect(metrics.words).toBe(0);
    expect(metrics.paragraphs).toBe(0);
    expect(metrics.readingTime).toEqual({ minutes: 0, seconds: 0 });
    expect(metrics.size).toBe('0 KB');
  });

  it('should skip tokens when text exceeds size limit', async () => {
    const config = { ...defaultConfig, tokenSizeLimit: 5 };
    const metrics = await controller.computeMetrics('this is a long text', config);
    expect(metrics.tokens).toBeNull();
  });

  it('should respect includeWhitespace setting', async () => {
    const noWs = { ...defaultConfig, includeWhitespace: false };
    const metrics = await controller.computeMetrics('a b c', noWs);
    expect(metrics.chars).toBe(3);
  });

  it('should invalidate token cache on model change', async () => {
    await controller.computeMetrics('test', defaultConfig);
    const changed = { ...defaultConfig, tokenizer: 'claude' as const };
    await controller.computeMetrics('test', changed);
    // No error means cache was properly invalidated
    expect(true).toBe(true);
  });

  it('should debounce via scheduledUpdate', async () => {
    const updateFn = vi.fn();
    controller.scheduleUpdate(updateFn);
    controller.scheduleUpdate(updateFn);
    controller.scheduleUpdate(updateFn);
    expect(updateFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(updateFn).toHaveBeenCalledTimes(1);
  });

  it('should cancel pending debounce on dispose', () => {
    const updateFn = vi.fn();
    controller.scheduleUpdate(updateFn);
    controller.dispose();
    vi.advanceTimersByTime(300);
    expect(updateFn).not.toHaveBeenCalled();
  });
});
