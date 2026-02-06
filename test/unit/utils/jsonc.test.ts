import { describe, it, expect } from 'vitest';
import { parseJsonc, formatJsonc } from '../../../src/utils/jsonc';

describe('parseJsonc', () => {
  it('should parse valid JSON', () => {
    const result = parseJsonc('{ "enabled": true }');
    expect(result).toEqual({ enabled: true });
  });

  it('should parse JSON with single-line comments', () => {
    const input = `// This is a comment
{
  // Another comment
  "enabled": false
}`;
    const result = parseJsonc(input);
    expect(result).toEqual({ enabled: false });
  });

  it('should parse JSON with multi-line comments', () => {
    const input = `/* Header comment
   spanning multiple lines */
{
  "enabled": true
}`;
    const result = parseJsonc(input);
    expect(result).toEqual({ enabled: true });
  });

  it('should parse JSON with mixed comment styles', () => {
    const input = `// Single-line
/* Multi-line */
{
  // Inline
  "enabled": true, /* trailing */
  "name": "test"
}`;
    const result = parseJsonc(input);
    expect(result).toEqual({ enabled: true, name: 'test' });
  });

  it('should throw on empty input', () => {
    expect(() => parseJsonc('')).toThrow();
  });

  it('should throw on whitespace-only input', () => {
    expect(() => parseJsonc('   \n  ')).toThrow();
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseJsonc('{ invalid }')).toThrow();
  });
});

describe('formatJsonc', () => {
  it('should format data as indented JSON with trailing newline', () => {
    const result = formatJsonc({ enabled: true });
    expect(result).toBe('{\n  "enabled": true\n}\n');
  });

  it('should include comment header when provided', () => {
    const result = formatJsonc({ enabled: false }, 'ARIT Toolkit config');
    expect(result).toBe('// ARIT Toolkit config\n{\n  "enabled": false\n}\n');
  });

  it('should handle multi-line header', () => {
    const result = formatJsonc({ enabled: true }, 'Line 1\nLine 2');
    expect(result.startsWith('// Line 1\n// Line 2\n')).toBe(true);
  });

  it('should format without header when header is undefined', () => {
    const result = formatJsonc({ enabled: true });
    expect(result).not.toContain('//');
  });
});
