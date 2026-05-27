export interface ArchivePathValidation {
  readonly valid: boolean;
  readonly reason?: string;
}

// Detecting control characters in user input is the explicit purpose of this regex.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/;
const GLOB_CHARS_RE = /[*?[\]]/;
const PARENT_TRAVERSAL_RE = /(^|\/)\.\.($|\/)/;
const WINDOWS_ABSOLUTE_RE = /^[A-Za-z]:[\\/]/;
const MAX_LENGTH = 1024;

export function validateArchivePath(archivePath: string): ArchivePathValidation {
  if (typeof archivePath !== 'string') {
    return { valid: false, reason: 'not a string' };
  }
  const trimmed = archivePath.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: 'empty path' };
  }
  if (trimmed !== archivePath) {
    return { valid: false, reason: 'leading or trailing whitespace' };
  }
  if (trimmed.length > MAX_LENGTH) {
    return { valid: false, reason: `exceeds ${String(MAX_LENGTH)} characters` };
  }
  if (CONTROL_CHARS_RE.test(trimmed)) {
    return { valid: false, reason: 'contains control characters' };
  }
  if (trimmed.startsWith('#') || trimmed.startsWith('!')) {
    return { valid: false, reason: 'must not start with "#" or "!"' };
  }
  if (GLOB_CHARS_RE.test(trimmed)) {
    return { valid: false, reason: 'must not contain glob metacharacters (* ? [ ])' };
  }
  if (trimmed.startsWith('/') || WINDOWS_ABSOLUTE_RE.test(trimmed)) {
    return { valid: false, reason: 'must be workspace-relative (not absolute)' };
  }
  if (PARENT_TRAVERSAL_RE.test(trimmed)) {
    return { valid: false, reason: 'must not contain ".." path segments' };
  }
  return { valid: true };
}
