export type Direction = 'increment' | 'decrement';

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

// ATX headings may be preceded by 0–3 literal spaces (CommonMark §4.2).
// This regex matches exactly 0–3 literal space characters before the # run; a leading tab
// does not match '^ {0,3}' and therefore correctly fails to match (a tab reaches column 4,
// making the line indented code, not a heading — no explicit tab arithmetic is needed here).
// The '(\s|$)' terminator covers space, tab, OR end-of-line (bare ATX heading, CommonMark §4.2).
const HEADING_RE = /^ {0,3}(#{1,6})(\s|$)/;

// Fence openers and closers must have 0–3 columns of leading indentation (CommonMark §4.5).
// FENCE_RE matches any leading whitespace to extract the prefix for column measurement;
// fence validity is enforced by leadingColumns() before accepting the match.
const FENCE_RE = /^(\s*)(```+|~~~+)/;

/**
 * Measures the leading indentation of a line in columns, per CommonMark §2.2.
 * Each tab advances to the next 4-column tab stop.
 * A single leading tab reaches column 4 (≥ 4), making the line indented code.
 * Three leading spaces occupy columns 0–2 (< 4), so they are within the heading/fence range.
 */
function leadingColumns(line: string): number {
  let col = 0;
  for (const ch of line) {
    if (ch === ' ') {
      col++;
    } else if (ch === '\t') {
      // Advance to the next 4-column tab stop
      col = col + (4 - (col % 4));
    } else {
      break;
    }
  }
  return col;
}

function isInsideCodeBlock(lines: readonly string[]): boolean[] {
  const result: boolean[] = [];
  let insideCode = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (const line of lines) {
    const fenceMatch = FENCE_RE.exec(line);

    // A fence opener is only valid when its leading indentation is 0–3 columns (CommonMark §4.5).
    if (fenceMatch && !insideCode && leadingColumns(line) <= 3) {
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
  // A closing fence must have 0–3 columns of leading indentation (CommonMark §4.5).
  // Lines with 4+ columns of leading indentation are indented code, not fences.
  if (leadingColumns(line) >= 4) {
    return false;
  }
  const trimmed = line.trimStart();
  if (!trimmed.startsWith(char.repeat(minLen))) {
    return false;
  }
  // The remainder after the fence run must be only whitespace (trimming handles \r from CRLF).
  return trimmed.replace(new RegExp(`^\\${char}+`), '').trim() === '';
}

export function isAtLimit(level: number, direction: Direction): boolean {
  return (
    (direction === 'increment' && level >= 6) || (direction === 'decrement' && level <= 1)
  );
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
    // match[2] is the separator: a space/tab character, or an empty string when the
    // heading ends at the line boundary (bare ATX, e.g. '##'). When there is a
    // separator character we keep it in `rest` by starting one character before the
    // full-match end; when there is none ($), rest is empty.
    const hasSeparator = (match[2] ?? '').length > 0;
    const rest = hasSeparator
      ? line.content.slice(fullMatch.length - 1)
      : line.content.slice(fullMatch.length);
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
