import type { MetricKey, TokenizerModel } from '../../types';

export const FEATURE_NAME = 'Text Stats';
export const CONFIG_KEY = 'textStats';
export const COMMAND_ID_TOGGLE = 'arit.textStats.toggle';
export const COMMAND_ID_CHANGE_TOKENIZER = 'arit.textStats.changeTokenizer';
export const INTRODUCED_AT_VERSION_CODE = 1001010000; // 1.10.0
export const STATUS_BAR_PRIORITY = 100;
export const STATUS_BAR_NAME = 'ARIT Text Stats';
export const DEBOUNCE_MS = 300;

export const DEFAULT_DELIMITER = ' | ';
export const DEFAULT_UNIT_SPACE = true;
export const DEFAULT_WPM = 200;
export const DEFAULT_TOKENIZER: TokenizerModel = 'o200k';
export const DEFAULT_INCLUDE_WHITESPACE = true;
export const DEFAULT_TOKEN_SIZE_LIMIT = 500_000;
export const DEFAULT_VISIBLE_METRICS: MetricKey[] = [
  'chars',
  'tokens',
  'words',
  'lines',
  'paragraphs',
  'readTime',
  'size',
];
