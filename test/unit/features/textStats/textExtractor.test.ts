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
    const result = extractSelectionText('full text', [
      { text: 'sel', isEmpty: false, startOffset: 0, endOffset: 3 },
    ]);
    expect(result).toBe('sel');
  });

  it('should return full text when all selections are empty (cursors)', () => {
    const result = extractSelectionText('full text', [
      { text: '', isEmpty: true, startOffset: 3, endOffset: 3 },
    ]);
    expect(result).toBe('full text');
  });

  it('should ignore empty selections in mixed set', () => {
    const result = extractSelectionText('hello world', [
      { text: 'hello', isEmpty: false, startOffset: 0, endOffset: 5 },
      { text: '', isEmpty: true, startOffset: 8, endOffset: 8 },
    ]);
    expect(result).toBe('hello');
  });

  it('should insert space when gap contains whitespace', () => {
    const fullText = 'hello world';
    const result = extractSelectionText(fullText, [
      { text: 'hello', isEmpty: false, startOffset: 0, endOffset: 5 },
      { text: 'world', isEmpty: false, startOffset: 6, endOffset: 11 },
    ]);
    expect(result).toBe('hello world');
  });

  it('should insert paragraph separator when gap contains double newline', () => {
    const fullText = 'para one\n\npara two';
    const result = extractSelectionText(fullText, [
      { text: 'para one', isEmpty: false, startOffset: 0, endOffset: 8 },
      { text: 'para two', isEmpty: false, startOffset: 10, endOffset: 18 },
    ]);
    expect(result).toBe('para one\n\npara two');
  });

  it('should insert line separator when gap contains single newline', () => {
    const fullText = 'line one\nline two';
    const result = extractSelectionText(fullText, [
      { text: 'line one', isEmpty: false, startOffset: 0, endOffset: 8 },
      { text: 'line two', isEmpty: false, startOffset: 9, endOffset: 17 },
    ]);
    expect(result).toBe('line one\nline two');
  });

  it('should not insert separator for adjacent selections', () => {
    const fullText = 'helloworld';
    const result = extractSelectionText(fullText, [
      { text: 'hello', isEmpty: false, startOffset: 0, endOffset: 5 },
      { text: 'world', isEmpty: false, startOffset: 5, endOffset: 10 },
    ]);
    expect(result).toBe('helloworld');
  });

  it('should sort selections by offset before joining', () => {
    const fullText = 'alpha beta gamma';
    const result = extractSelectionText(fullText, [
      { text: 'gamma', isEmpty: false, startOffset: 11, endOffset: 16 },
      { text: 'alpha', isEmpty: false, startOffset: 0, endOffset: 5 },
    ]);
    expect(result).toBe('alpha gamma');
  });

  it('should handle three selections with mixed gap types', () => {
    const fullText = 'word1 word2\n\nparagraph2';
    const result = extractSelectionText(fullText, [
      { text: 'word1', isEmpty: false, startOffset: 0, endOffset: 5 },
      { text: 'word2', isEmpty: false, startOffset: 6, endOffset: 11 },
      { text: 'paragraph2', isEmpty: false, startOffset: 13, endOffset: 23 },
    ]);
    expect(result).toBe('word1 word2\n\nparagraph2');
  });

  it('should handle overlapping selections without extra separator', () => {
    const fullText = 'hello world';
    const result = extractSelectionText(fullText, [
      { text: 'hello wo', isEmpty: false, startOffset: 0, endOffset: 8 },
      { text: 'o world', isEmpty: false, startOffset: 4, endOffset: 11 },
    ]);
    expect(result).toBe('hello woo world');
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
