import { describe, it, expect } from 'vitest';
import {
  extractSelectionText,
  aggregateSelectionLines,
} from '../../../../src/features/textStats/textExtractor';

describe('extractSelectionText', () => {
  it('should return full document text when no selections', () => {
    const result = extractSelectionText('hello world', []);
    expect(result).toBe('hello world');
  });

  it('should return selection text for single selection', () => {
    const result = extractSelectionText('full text', [{ text: 'sel', isEmpty: false }]);
    expect(result).toBe('sel');
  });

  it('should aggregate multiple selections', () => {
    const result = extractSelectionText('full text', [
      { text: 'first', isEmpty: false },
      { text: 'second', isEmpty: false },
    ]);
    expect(result).toBe('firstsecond');
  });

  it('should return full text when all selections are empty (cursors)', () => {
    const result = extractSelectionText('full text', [{ text: '', isEmpty: true }]);
    expect(result).toBe('full text');
  });

  it('should ignore empty selections in mixed set', () => {
    const result = extractSelectionText('full text', [
      { text: 'sel', isEmpty: false },
      { text: '', isEmpty: true },
    ]);
    expect(result).toBe('sel');
  });
});

describe('aggregateSelectionLines', () => {
  it('should return 0 for empty selections', () => {
    expect(aggregateSelectionLines([])).toBe(0);
  });

  it('should count lines for a single selection', () => {
    const result = aggregateSelectionLines([
      { startLine: 0, endLine: 2, endCharacter: 5 },
    ]);
    expect(result).toBe(3);
  });

  it('should sum lines across multiple selections', () => {
    const result = aggregateSelectionLines([
      { startLine: 0, endLine: 1, endCharacter: 5 },
      { startLine: 5, endLine: 7, endCharacter: 3 },
    ]);
    expect(result).toBe(5); // 2 + 3
  });

  it('should subtract trailing empty line', () => {
    const result = aggregateSelectionLines([
      { startLine: 0, endLine: 3, endCharacter: 0 },
    ]);
    expect(result).toBe(3); // 4 - 1
  });

  it('should not subtract when single line at col 0', () => {
    const result = aggregateSelectionLines([
      { startLine: 5, endLine: 5, endCharacter: 0 },
    ]);
    expect(result).toBe(1);
  });
});
