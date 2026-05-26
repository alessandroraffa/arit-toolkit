import { describe, it, expect } from 'vitest';
import { validateArchivePath } from '../../../../src/features/agentSessionsArchiving/archivePathValidation';

describe('validateArchivePath', () => {
  it('should accept the default workspace-relative path', () => {
    expect(validateArchivePath('docs/archive/agent-sessions')).toEqual({ valid: true });
  });

  it('should accept other realistic workspace-relative paths', () => {
    expect(validateArchivePath('archive')).toEqual({ valid: true });
    expect(validateArchivePath('data/2026/sessions')).toEqual({ valid: true });
    expect(validateArchivePath('a/b/c')).toEqual({ valid: true });
  });

  it('should reject non-string values with type guard', () => {
    expect(validateArchivePath(null as unknown as string)).toEqual({
      valid: false,
      reason: 'not a string',
    });
    expect(validateArchivePath(undefined as unknown as string)).toEqual({
      valid: false,
      reason: 'not a string',
    });
    expect(validateArchivePath(123 as unknown as string)).toEqual({
      valid: false,
      reason: 'not a string',
    });
  });

  it('should reject empty paths', () => {
    expect(validateArchivePath('')).toEqual({ valid: false, reason: 'empty path' });
  });

  it('should reject whitespace-only paths', () => {
    expect(validateArchivePath('   ')).toEqual({ valid: false, reason: 'empty path' });
  });

  it('should reject paths with leading whitespace', () => {
    expect(validateArchivePath(' docs/archive')).toEqual({
      valid: false,
      reason: 'leading or trailing whitespace',
    });
  });

  it('should reject paths with trailing whitespace', () => {
    expect(validateArchivePath('docs/archive ')).toEqual({
      valid: false,
      reason: 'leading or trailing whitespace',
    });
  });

  it('should reject paths with leading tab', () => {
    expect(validateArchivePath('\ttext')).toEqual({
      valid: false,
      reason: 'leading or trailing whitespace',
    });
  });

  it('should reject paths exceeding 1024 characters', () => {
    expect(validateArchivePath('a'.repeat(1025))).toEqual({
      valid: false,
      reason: 'exceeds 1024 characters',
    });
  });

  it('should reject paths with newline control character', () => {
    expect(validateArchivePath('docs/archive\nfoo')).toEqual({
      valid: false,
      reason: 'contains control characters',
    });
  });

  it('should reject paths with carriage-return control character', () => {
    expect(validateArchivePath('a\rb')).toEqual({
      valid: false,
      reason: 'contains control characters',
    });
  });

  it('should reject paths with null control character', () => {
    expect(validateArchivePath('a\0b')).toEqual({
      valid: false,
      reason: 'contains control characters',
    });
  });

  it('should reject paths with embedded tab control character', () => {
    expect(validateArchivePath('a\tb')).toEqual({
      valid: false,
      reason: 'contains control characters',
    });
  });

  it('should reject paths starting with "#"', () => {
    expect(validateArchivePath('# comment')).toEqual({
      valid: false,
      reason: 'must not start with "#" or "!"',
    });
    expect(validateArchivePath('#archive')).toEqual({
      valid: false,
      reason: 'must not start with "#" or "!"',
    });
  });

  it('should reject paths starting with "!"', () => {
    expect(validateArchivePath('!archive')).toEqual({
      valid: false,
      reason: 'must not start with "#" or "!"',
    });
  });

  it('should reject paths containing glob metacharacters', () => {
    const expected = {
      valid: false,
      reason: 'must not contain glob metacharacters (* ? [ ])',
    } as const;
    expect(validateArchivePath('docs/*')).toEqual(expected);
    expect(validateArchivePath('a?b')).toEqual(expected);
    expect(validateArchivePath('a[b')).toEqual(expected);
    expect(validateArchivePath('a]b')).toEqual(expected);
  });

  it('should reject Unix absolute paths', () => {
    expect(validateArchivePath('/abs/path')).toEqual({
      valid: false,
      reason: 'must be workspace-relative (not absolute)',
    });
  });

  it('should reject Windows absolute paths', () => {
    const expected = {
      valid: false,
      reason: 'must be workspace-relative (not absolute)',
    } as const;
    expect(validateArchivePath('C:\\path')).toEqual(expected);
    expect(validateArchivePath('C:/path')).toEqual(expected);
    expect(validateArchivePath('d:\\path')).toEqual(expected);
  });

  it('should reject paths with parent traversal segments', () => {
    const expected = {
      valid: false,
      reason: 'must not contain ".." path segments',
    } as const;
    expect(validateArchivePath('../escape')).toEqual(expected);
    expect(validateArchivePath('a/../b')).toEqual(expected);
    expect(validateArchivePath('a/b/..')).toEqual(expected);
    expect(validateArchivePath('..')).toEqual(expected);
  });

  it('should accept "..hidden" — segment starts with ".." but is not exactly ".."', () => {
    expect(validateArchivePath('..hidden')).toEqual({ valid: true });
  });

  it('should accept "archive.md" — contains "." in segment', () => {
    expect(validateArchivePath('archive.md')).toEqual({ valid: true });
  });

  it('should accept "a..b" — double dot embedded inside segment', () => {
    expect(validateArchivePath('a..b')).toEqual({ valid: true });
  });
});
