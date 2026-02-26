import { describe, it, expect } from 'vitest';
import { inferGapSeparator } from '../../../../src/features/textStats/gapSeparator';

describe('inferGapSeparator', () => {
  it('should return empty string for empty gap', () => {
    expect(inferGapSeparator('')).toBe('');
  });

  it('should return paragraph separator for double newline', () => {
    expect(inferGapSeparator('\n\n')).toBe('\n\n');
  });

  it('should return paragraph separator for triple newline', () => {
    expect(inferGapSeparator('\n\n\n')).toBe('\n\n');
  });

  it('should return paragraph separator when gap has text between double newlines', () => {
    expect(inferGapSeparator('  \n\n  ')).toBe('\n\n');
  });

  it('should return line separator for single newline', () => {
    expect(inferGapSeparator('\n')).toBe('\n');
  });

  it('should return space for space gap', () => {
    expect(inferGapSeparator(' ')).toBe(' ');
  });

  it('should return space for tab gap', () => {
    expect(inferGapSeparator('\t')).toBe(' ');
  });

  it('should return empty string for non-whitespace gap', () => {
    expect(inferGapSeparator('abc')).toBe('');
  });

  it('should return line separator for newline with surrounding spaces', () => {
    expect(inferGapSeparator('  \n  ')).toBe('\n');
  });
});
