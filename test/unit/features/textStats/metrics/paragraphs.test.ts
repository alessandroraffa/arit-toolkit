import { describe, it, expect } from 'vitest';
import { countParagraphs } from '../../../../../src/features/textStats/metrics/paragraphs';

describe('countParagraphs', () => {
  it('should return 0 for empty string', () => {
    expect(countParagraphs('')).toBe(0);
  });

  it('should return 0 for whitespace-only string', () => {
    expect(countParagraphs('   \n\n\n  ')).toBe(0);
  });

  it('should return 1 for a single block of text', () => {
    expect(countParagraphs('hello world')).toBe(1);
  });

  it('should return 1 for multiline text with no blank lines', () => {
    expect(countParagraphs('line 1\nline 2\nline 3')).toBe(1);
  });

  it('should count paragraphs separated by one blank line', () => {
    expect(countParagraphs('para 1\n\npara 2')).toBe(2);
  });

  it('should count paragraphs separated by multiple blank lines', () => {
    expect(countParagraphs('para 1\n\n\n\npara 2')).toBe(2);
  });

  it('should handle three paragraphs', () => {
    expect(countParagraphs('p1\n\np2\n\np3')).toBe(3);
  });

  it('should ignore leading blank lines', () => {
    expect(countParagraphs('\n\nhello')).toBe(1);
  });

  it('should ignore trailing blank lines', () => {
    expect(countParagraphs('hello\n\n')).toBe(1);
  });

  it('should ignore leading and trailing blank lines with multiple paragraphs', () => {
    expect(countParagraphs('\n\npara 1\n\npara 2\n\n')).toBe(2);
  });

  it('should handle mixed blank line counts between paragraphs', () => {
    const text = 'p1\n\np2\n\n\np3\n\n\n\np4';
    expect(countParagraphs(text)).toBe(4);
  });
});
