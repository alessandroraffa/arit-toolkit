import { describe, it, expect } from 'vitest';
import {
  extractSelectionText,
  aggregateSelectionLines,
} from '../../../src/features/textStats/textExtractor';
import { inferGapSeparator } from '../../../src/features/textStats/gapSeparator';
import type {
  SelectionData,
  SelectionLineData,
} from '../../../src/features/textStats/textExtractor';

/**
 * Integration tests for text extraction with real gap separator logic.
 * No mocks — exercises the actual selection joining pipeline.
 */
describe('text extraction integration', () => {
  const DOCUMENT = [
    'function hello() {',
    '  console.log("Hello, world!");',
    '}',
    '',
    'function goodbye() {',
    '  console.log("Goodbye!");',
    '}',
  ].join('\n');

  it('should return full document when no selections', () => {
    const result = extractSelectionText(DOCUMENT, []);
    expect(result).toBe(DOCUMENT);
  });

  it('should preserve word boundary when joining adjacent selections', () => {
    const sel: SelectionData[] = [
      { text: 'hello', isEmpty: false, startOffset: 9, endOffset: 14 },
      { text: 'console', isEmpty: false, startOffset: 22, endOffset: 29 },
    ];
    const result = extractSelectionText(DOCUMENT, sel);
    // Gap between offsets 14-22 contains "() {\n  " → has newline
    expect(result).not.toBe('helloconsole');
  });

  it('should preserve paragraph boundary across blank lines', () => {
    // } is at offset 51, \n at 52, \n at 53, 'function' starts at 54
    const sel: SelectionData[] = [
      { text: '}', isEmpty: false, startOffset: 51, endOffset: 52 },
      { text: 'function', isEmpty: false, startOffset: 54, endOffset: 62 },
    ];
    const result = extractSelectionText(DOCUMENT, sel);
    // Gap between 52-54 is "\n\n" → paragraph separator
    expect(result).toBe('}\n\nfunction');
  });

  it('should handle overlapping selections without duplication', () => {
    const sel: SelectionData[] = [
      { text: 'hello', isEmpty: false, startOffset: 9, endOffset: 14 },
      { text: 'hello', isEmpty: false, startOffset: 9, endOffset: 14 },
    ];
    const result = extractSelectionText(DOCUMENT, sel);
    expect(result).toBe('hellohello');
  });

  it('should sort selections by offset regardless of input order', () => {
    const sel: SelectionData[] = [
      { text: 'goodbye', isEmpty: false, startOffset: 64, endOffset: 71 },
      { text: 'hello', isEmpty: false, startOffset: 9, endOffset: 14 },
    ];
    const result = extractSelectionText(DOCUMENT, sel);
    // hello comes first in document, should be sorted
    expect(result.startsWith('hello')).toBe(true);
  });
});

describe('gap separator integration', () => {
  it('should return empty for adjacent selections', () => {
    expect(inferGapSeparator('')).toBe('');
  });

  it('should return space for whitespace gap', () => {
    expect(inferGapSeparator('   ')).toBe(' ');
  });

  it('should return newline for single newline gap', () => {
    expect(inferGapSeparator('\n')).toBe('\n');
  });

  it('should return double newline for paragraph gap', () => {
    expect(inferGapSeparator('\n\n')).toBe('\n\n');
    expect(inferGapSeparator('\n\n\n')).toBe('\n\n');
  });

  it('should return space for mixed whitespace without newlines', () => {
    expect(inferGapSeparator('\t  ')).toBe(' ');
  });

  it('should return empty for non-whitespace gap', () => {
    // Gap that contains only non-whitespace chars (e.g. code between selections)
    expect(inferGapSeparator('abc')).toBe('');
  });
});

describe('aggregateSelectionLines integration', () => {
  it('should sum line counts across multiple selections', () => {
    const selections: SelectionLineData[] = [
      { startLine: 0, endLine: 2, endCharacter: 5 },
      { startLine: 5, endLine: 7, endCharacter: 10 },
    ];
    // First: 3 lines, Second: 3 lines → total 6
    expect(aggregateSelectionLines(selections)).toBe(6);
  });

  it('should handle trailing empty lines in selections', () => {
    const selections: SelectionLineData[] = [
      { startLine: 0, endLine: 3, endCharacter: 0 },
      { startLine: 5, endLine: 5, endCharacter: 10 },
    ];
    // First: 4 raw - 1 trailing = 3, Second: 1 line → total 4
    expect(aggregateSelectionLines(selections)).toBe(4);
  });

  it('should return 0 for empty selections array', () => {
    expect(aggregateSelectionLines([])).toBe(0);
  });
});
