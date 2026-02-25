import { describe, it, expect } from 'vitest';
import { countWords } from '../../../../../src/features/textStats/metrics/words';

describe('countWords', () => {
  it('should return 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('should return 0 for whitespace-only string', () => {
    expect(countWords('   \t\n  ')).toBe(0);
  });

  it('should count a single word', () => {
    expect(countWords('hello')).toBe(1);
  });

  it('should count multiple words separated by spaces', () => {
    expect(countWords('hello world foo')).toBe(3);
  });

  it('should handle multiple whitespace between words', () => {
    expect(countWords('hello   world')).toBe(2);
  });

  it('should handle tabs and newlines as separators', () => {
    expect(countWords('hello\tworld\nfoo')).toBe(3);
  });

  it('should count hyphenated words as one word', () => {
    expect(countWords('self-contained module')).toBe(2);
  });

  it('should count URLs as one word', () => {
    expect(countWords('visit https://example.com/path today')).toBe(3);
  });

  it('should count file paths as one word', () => {
    expect(countWords('open /usr/local/bin/node now')).toBe(3);
  });

  it('should handle leading and trailing whitespace', () => {
    expect(countWords('  hello world  ')).toBe(2);
  });
});
