/**
 * Count lines in a text string (for full document fallback).
 * Matches the behavior of splitting on newlines.
 */
export function countLines(text: string): number {
  if (text.length === 0) {
    return 1;
  }
  let count = 1;
  for (const ch of text) {
    if (ch === '\n') {
      count++;
    }
  }
  return count;
}

/**
 * Count lines spanned by a selection.
 * If the selection ends at column 0 (and spans more than one line),
 * subtract 1 to avoid counting the empty trailing line.
 */
export function countSelectionLines(
  startLine: number,
  endLine: number,
  endCharacter: number
): number {
  const raw = endLine - startLine + 1;
  if (endCharacter === 0 && raw > 1) {
    return raw - 1;
  }
  return raw;
}
