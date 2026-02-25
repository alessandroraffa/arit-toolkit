import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTextStatsStatusBarItem,
  updateTextStatsDisplay,
  hideTextStatsItem,
  showTextStatsItem,
} from '../../../../src/features/textStats/statusBarItem';
import type { MetricsResult } from '../../../../src/features/textStats/formatter';
import type { TextStatsConfig } from '../../../../src/types';
import { StatusBarAlignment, window } from '../../mocks/vscode';

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

const sampleMetrics: MetricsResult = {
  chars: 100,
  tokens: 50,
  words: 20,
  lines: 5,
  paragraphs: 2,
  readingTime: { minutes: 0, seconds: 6 },
  size: '0.1 KB',
};

describe('createTextStatsStatusBarItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a status bar item on the left side', () => {
    createTextStatsStatusBarItem();
    expect(window.createStatusBarItem).toHaveBeenCalledWith(StatusBarAlignment.Left, 100);
  });

  it('should return a status bar item with correct name', () => {
    const item = createTextStatsStatusBarItem();
    expect(item.name).toBe('ARIT Text Stats');
  });
});

describe('updateTextStatsDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set status bar text from metrics', () => {
    const item = createTextStatsStatusBarItem();
    updateTextStatsDisplay(item, sampleMetrics, defaultConfig);
    expect(item.text).toBe('100 c | 50 t | 20 w | 5 l | 2 p | ~0m 6s | 0.1 KB');
  });

  it('should set tooltip with full labels', () => {
    const item = createTextStatsStatusBarItem();
    updateTextStatsDisplay(item, sampleMetrics, defaultConfig);
    expect(typeof item.tooltip).toBe('string');
    expect(item.tooltip as string).toContain('Characters: 100');
  });
});

describe('show/hide', () => {
  it('should call show on the item', () => {
    const item = createTextStatsStatusBarItem();
    showTextStatsItem(item);
    expect(item.show).toHaveBeenCalled();
  });

  it('should call hide on the item', () => {
    const item = createTextStatsStatusBarItem();
    hideTextStatsItem(item);
    expect(item.hide).toHaveBeenCalled();
  });
});
