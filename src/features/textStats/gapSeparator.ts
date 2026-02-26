/**
 * Infer the minimal separator that preserves structural boundaries
 * between two consecutive selections based on the gap text between them.
 */
export function inferGapSeparator(gap: string): string {
  if (gap.length === 0) {
    return '';
  }
  if (/\n{2,}/.test(gap)) {
    return '\n\n';
  }
  if (gap.includes('\n')) {
    return '\n';
  }
  if (/\s/.test(gap)) {
    return ' ';
  }
  return '';
}
