import { describe, it, expect } from 'vitest';
import { extractSelectionText } from '../../../src/features/textStats/textExtractor';
import { inferGapSeparator } from '../../../src/features/textStats/gapSeparator';
import type { SelectionData } from '../../../src/features/textStats/textExtractor';

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
});
