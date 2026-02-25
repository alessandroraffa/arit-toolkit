import { describe, it, expect } from 'vitest';
import { countCharacters } from '../../../../../src/features/textStats/metrics/characters';

describe('countCharacters', () => {
  it('should return 0 for empty string', () => {
    expect(countCharacters('', true)).toBe(0);
    expect(countCharacters('', false)).toBe(0);
  });

  it('should count all characters when includeWhitespace is true', () => {
    expect(countCharacters('hello world', true)).toBe(11);
  });

  it('should count only non-whitespace when includeWhitespace is false', () => {
    expect(countCharacters('hello world', false)).toBe(10);
  });

  it('should handle tabs and newlines', () => {
    const text = 'a\tb\nc';
    expect(countCharacters(text, true)).toBe(5);
    expect(countCharacters(text, false)).toBe(3);
  });

  it('should handle whitespace-only string', () => {
    expect(countCharacters('   \t\n', true)).toBe(5);
    expect(countCharacters('   \t\n', false)).toBe(0);
  });

  it('should count UTF-16 code units consistently', () => {
    // Emoji: 😀 is 2 code units in UTF-16
    expect(countCharacters('😀', true)).toBe(2);
    // CJK character: single code unit
    expect(countCharacters('中', true)).toBe(1);
  });

  it('should handle multiline text with mixed whitespace', () => {
    const text = 'line 1\n  line 2\n\tline 3';
    expect(countCharacters(text, true)).toBe(23);
    expect(countCharacters(text, false)).toBe(15);
  });
});
