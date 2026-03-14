export type Direction = 'increment' | 'decrement';

export type TransformResult =
  | { success: true; text: string }
  | { success: false; error: string };

const HEADING_RE = /^(#{1,6})\s/;
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

function isAtLimit(level: number, direction: Direction): boolean {
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

function applyTransform(
  lines: readonly string[],
  codeBlockFlags: readonly boolean[],
  direction: Direction
): string[] {
  return lines.map((line, i) => {
    if (codeBlockFlags[i]) {
      return line;
    }
    const match = HEADING_RE.exec(line);
    if (!match?.[1]) {
      return line;
    }
    const hashes = match[1];
    const rest = line.slice(hashes.length);
    const newHashes = direction === 'increment' ? '#' + hashes : hashes.slice(1);
    return newHashes + rest;
  });
}

export function transformHeadings(text: string, direction: Direction): TransformResult {
  if (text === '') {
    return { success: true, text: '' };
  }

  const lines = text.split('\n');
  const codeBlockFlags = isInsideCodeBlock(lines);

  const error = validateHeadings(lines, codeBlockFlags, direction);
  if (error) {
    return { success: false, error };
  }

  const transformed = applyTransform(lines, codeBlockFlags, direction);
  return { success: true, text: transformed.join('\n') };
}
