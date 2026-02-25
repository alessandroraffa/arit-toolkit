import { describe, it, expect } from 'vitest';
import {
  countLines,
  countSelectionLines,
} from '../../../../../src/features/textStats/metrics/lines';

describe('countLines', () => {
  it('should return 1 for empty string', () => {
    expect(countLines('')).toBe(1);
  });

  it('should return 1 for single line', () => {
    expect(countLines('hello')).toBe(1);
  });

  it('should count multiple lines', () => {
    expect(countLines('a\nb\nc')).toBe(3);
  });

  it('should count trailing newline as an extra line', () => {
    expect(countLines('a\nb\n')).toBe(3);
  });

  it('should handle multiple blank lines', () => {
    expect(countLines('a\n\n\nb')).toBe(4);
  });
});

describe('countSelectionLines', () => {
  it('should count single line selection', () => {
    expect(countSelectionLines(0, 0, 5)).toBe(1);
  });

  it('should count multi-line selection', () => {
    expect(countSelectionLines(2, 5, 10)).toBe(4);
  });

  it('should subtract 1 when selection ends at column 0 of last line', () => {
    // User selected lines 2-4, cursor ended up at start of line 5
    expect(countSelectionLines(2, 5, 0)).toBe(3);
  });

  it('should not subtract when selection starts and ends on same line at col 0', () => {
    // Edge case: single line, cursor at column 0 — still 1 line
    expect(countSelectionLines(3, 3, 0)).toBe(1);
  });
});
