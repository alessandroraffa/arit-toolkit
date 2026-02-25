import { describe, it, expect } from 'vitest';
import {
  FEATURE_NAME,
  CONFIG_KEY,
  COMMAND_ID_TOGGLE,
  COMMAND_ID_CHANGE_TOKENIZER,
  INTRODUCED_AT_VERSION_CODE,
  STATUS_BAR_PRIORITY,
  STATUS_BAR_NAME,
  DEBOUNCE_MS,
  DEFAULT_DELIMITER,
  DEFAULT_UNIT_SPACE,
  DEFAULT_WPM,
  DEFAULT_TOKENIZER,
  DEFAULT_INCLUDE_WHITESPACE,
  DEFAULT_TOKEN_SIZE_LIMIT,
  DEFAULT_VISIBLE_METRICS,
} from '../../../../src/features/textStats/constants';

describe('textStats constants', () => {
  it('should have a non-empty feature name', () => {
    expect(FEATURE_NAME).toBe('Text Stats');
  });

  it('should have a config key', () => {
    expect(CONFIG_KEY).toBe('textStats');
  });

  it('should have command ids with arit prefix', () => {
    expect(COMMAND_ID_TOGGLE).toBe('arit.textStats.toggle');
    expect(COMMAND_ID_CHANGE_TOKENIZER).toBe('arit.textStats.changeTokenizer');
  });

  it('should have versioning metadata', () => {
    expect(INTRODUCED_AT_VERSION_CODE).toBe(1001010000);
  });

  it('should have status bar config', () => {
    expect(typeof STATUS_BAR_PRIORITY).toBe('number');
    expect(STATUS_BAR_PRIORITY).toBe(100);
    expect(STATUS_BAR_NAME).toBe('ARIT Text Stats');
  });

  it('should have a debounce interval', () => {
    expect(DEBOUNCE_MS).toBe(300);
  });

  it('should have sensible defaults', () => {
    expect(DEFAULT_DELIMITER).toBe(' | ');
    expect(DEFAULT_UNIT_SPACE).toBe(true);
    expect(DEFAULT_WPM).toBe(200);
    expect(DEFAULT_TOKENIZER).toBe('o200k');
    expect(DEFAULT_INCLUDE_WHITESPACE).toBe(true);
    expect(DEFAULT_TOKEN_SIZE_LIMIT).toBe(500_000);
  });

  it('should have all metric keys in default visible metrics', () => {
    expect(DEFAULT_VISIBLE_METRICS).toEqual([
      'chars',
      'tokens',
      'words',
      'lines',
      'paragraphs',
      'readTime',
      'size',
    ]);
  });
});
