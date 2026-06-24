export type Direction = 'increment' | 'decrement';

export type TransformResult =
  | { success: true; text: string }
  | { success: false; error: string };

export type TransformOutcome =
  | 'changed'
  | 'no-op: no transformable heading in scope'
  | 'no-op: all in-scope headings at the limit';

export interface Line {
  content: string;
  terminator: string;
}

export function splitLines(text: string): Line[] {
  if (text === '') return [];
  const result: Line[] = [];
  let i = 0;
  while (i < text.length) {
    const crlfIdx = text.indexOf('\r\n', i);
    const lfIdx = text.indexOf('\n', i);
    if (crlfIdx !== -1 && (lfIdx === -1 || crlfIdx <= lfIdx)) {
      result.push({ content: text.slice(i, crlfIdx), terminator: '\r\n' });
      i = crlfIdx + 2;
    } else if (lfIdx !== -1) {
      result.push({ content: text.slice(i, lfIdx), terminator: '\n' });
      i = lfIdx + 1;
    } else {
      result.push({ content: text.slice(i), terminator: '' });
      i = text.length;
    }
  }
  return result;
}

export function joinLines(lines: Line[]): string {
  return lines.map((l) => l.content + l.terminator).join('');
}

// ATX headings may be preceded by 0–3 spaces (column 0–3 after tab expansion at 4-column stops).
// A tab counts as 4 columns, so a tab before # places it at column 4 (not a heading).
// This regex matches 0–3 literal spaces before the # sequence.
const HEADING_RE = /^ {0,3}(#{1,6})\s/;
const FENCE_RE = /^(\s*)(```+|~~~+)/;

function isInsideCodeBlock(lines: readonly string[]): boolean[] {
  const result: boolean[] = [];
  let insideCode = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (const line of lines) {
    const fenceMatch = FENCE_RE.exec(line);

    if (fenceMatch && !insideCode) {
      insideCode = true;
      fenceChar = fenceMatch[2]?.[0] ?? '`';
      fenceLen = fenceMatch[2]?.length ?? 3;
      result.push(true);
    } else if (insideCode && isClosingFence(line, fenceChar, fenceLen)) {
      result.push(true);
      insideCode = false;
    } else {
      result.push(insideCode);
    }
  }

  return result;
}

function isClosingFence(line: string, char: string, minLen: number): boolean {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith(char.repeat(minLen))) {
    return false;
  }
  return trimmed.replace(new RegExp(`^\\${char}+`), '').trim() === '';
}

export function isAtLimit(level: number, direction: Direction): boolean {
  return (
    (direction === 'increment' && level >= 6) || (direction === 'decrement' && level <= 1)
  );
}

const LIMIT_ERRORS: Record<Direction, string> = {
  increment: 'Cannot increment: one or more headings are already at level 6 (maximum).',
  decrement: 'Cannot decrement: one or more headings are already at level 1 (minimum).',
};

function validateHeadings(
  lines: readonly string[],
  codeBlockFlags: readonly boolean[],
  direction: Direction
): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (codeBlockFlags[i]) {
      continue;
    }
    const match = HEADING_RE.exec(lines[i] ?? '');
    if (!match) {
      continue;
    }
    if (isAtLimit(match[1]?.length ?? 0, direction)) {
      return LIMIT_ERRORS[direction];
    }
  }
  return undefined;
}

/**
 * Transforms headings in scope within a document.
 *
 * @param text - Full document text.
 * @param direction - 'increment' or 'decrement'.
 * @param scopeLines - Zero-based set of line indices that are in scope.
 *   Lines outside `scopeLines` pass through unchanged.
 *   Code-block context is tracked across ALL lines regardless of scope membership
 *   (SR-1/SR-2 correctness: a heading inside a code block opened before the
 *   selection is not transformed even when its line index is in scope).
 * @returns An object with `outcome` (three-state) and `text` (full reconstructed
 *   document). Outcome values:
 *   - `'changed'`: at least one in-scope heading was shifted. A mixed scope where
 *     some headings are at the limit and others are not produces `'changed'` —
 *     the at-limit headings are left unchanged; the remaining in-scope headings shift.
 *   - `'no-op: no transformable heading in scope'`: no ATX heading was found in scope.
 *   - `'no-op: all in-scope headings at the limit'`: every in-scope heading is already
 *     at the boundary (H6 for increment, H1 for decrement).
 *   When `outcome` starts with `'no-op'`, `text` equals the input exactly.
 */
export function transformHeadingsInScope(
  text: string,
  direction: Direction,
  scopeLines: Set<number>
): { outcome: TransformOutcome; text: string } {
  if (text === '') {
    return { outcome: 'no-op: no transformable heading in scope', text: '' };
  }

  const lines = splitLines(text);
  const contentLines = lines.map((l) => l.content);
  const codeBlockFlags = isInsideCodeBlock(contentLines);

  let changedCount = 0;
  let atLimitCount = 0;
  let inScopeHeadingCount = 0;

  const transformedLines: Line[] = lines.map((line, i) => {
    const inScope = scopeLines.has(i);
    if (!inScope || codeBlockFlags[i]) {
      return line;
    }
    const match = HEADING_RE.exec(line.content);
    if (!match?.[1]) {
      return line;
    }
    inScopeHeadingCount++;
    const hashes = match[1];
    if (isAtLimit(hashes.length, direction)) {
      atLimitCount++;
      return line;
    }
    changedCount++;
    const fullMatch = match[0];
    const leadingSpaces = fullMatch.slice(0, fullMatch.indexOf(hashes));
    const rest = line.content.slice(fullMatch.length - 1);
    const newHashes = direction === 'increment' ? '#' + hashes : hashes.slice(1);
    return { content: leadingSpaces + newHashes + rest, terminator: line.terminator };
  });

  if (inScopeHeadingCount === 0) {
    return { outcome: 'no-op: no transformable heading in scope', text };
  }
  if (changedCount === 0 && atLimitCount > 0) {
    return { outcome: 'no-op: all in-scope headings at the limit', text };
  }
  return { outcome: 'changed', text: joinLines(transformedLines) };
}

export function transformHeadings(text: string, direction: Direction): TransformResult {
  if (text === '') {
    return { success: true, text: '' };
  }

  // Preserve old abort behaviour: validate first; any at-limit heading aborts.
  const rawLines = text.split('\n');
  const codeBlockFlags = isInsideCodeBlock(rawLines);
  const error = validateHeadings(rawLines, codeBlockFlags, direction);
  if (error) {
    return { success: false, error };
  }

  const lineCount = splitLines(text).length;
  const scopeLines = new Set(Array.from({ length: lineCount }, (_, i) => i));
  const result = transformHeadingsInScope(text, direction, scopeLines);
  return { success: true, text: result.text };
}
