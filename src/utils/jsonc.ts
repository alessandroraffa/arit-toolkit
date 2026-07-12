/**
 * Strips single-line (//) and multi-line comments and trailing commas from
 * a JSONC string, then parses it as JSON. Comment and trailing-comma
 * removal never mutate characters inside a string literal.
 */
export function parseJsonc(content: string): unknown {
  const stripped = stripJsoncArtifacts(content);

  return JSON.parse(stripped) as unknown;
}

/**
 * Formats a value as a JSONC string with an optional comment header.
 */
export function formatJsonc(data: unknown, header?: string): string {
  const json = JSON.stringify(data, null, 2);

  if (header) {
    const commentLines = header
      .split('\n')
      .map((line) => `// ${line}`)
      .join('\n');
    return `${commentLines}\n${json}\n`;
  }

  return `${json}\n`;
}

/**
 * Removes `//` line comments, `/* ... *` + `/` block comments, and trailing
 * commas before `}`/`]` from JSONC content — all only outside string
 * literals. String literals are consumed verbatim so escaped characters
 * (including an escaped `"`) never toggle string state early.
 */
function stripJsoncArtifacts(content: string): string {
  let output = '';
  let i = 0;

  while (i < content.length) {
    const literal = consumeStringLiteral(content, i);
    if (literal) {
      output += literal.text;
      i = literal.nextIndex;
      continue;
    }

    if (isLineCommentStart(content, i)) {
      i = skipLineComment(content, i);
      continue;
    }

    if (isBlockCommentStart(content, i)) {
      i = skipBlockComment(content, i);
      continue;
    }

    if (content[i] === ',' && isTrailingComma(content, i)) {
      i += 1;
      continue;
    }

    output += content[i] ?? '';
    i += 1;
  }

  return output;
}

function isLineCommentStart(content: string, i: number): boolean {
  return content[i] === '/' && content[i + 1] === '/';
}

function isBlockCommentStart(content: string, i: number): boolean {
  return content[i] === '/' && content[i + 1] === '*';
}

function skipLineComment(content: string, i: number): number {
  let j = i + 2;
  while (j < content.length && content[j] !== '\n') {
    j += 1;
  }
  return j;
}

function skipBlockComment(content: string, i: number): number {
  const end = content.indexOf('*/', i + 2);
  return end === -1 ? content.length : end + 2;
}

/**
 * When `content[i]` starts a string literal (`"`), consumes it verbatim —
 * including backslash-escaped characters, which never toggle string state
 * — and returns the consumed text and the index immediately after the
 * closing quote. Returns `undefined` when `content[i]` is not a quote.
 */
function consumeStringLiteral(
  content: string,
  i: number
): { text: string; nextIndex: number } | undefined {
  if (content[i] !== '"') {
    return undefined;
  }

  let j = i + 1;
  while (j < content.length && content[j] !== '"') {
    j += content[j] === '\\' ? 2 : 1;
  }
  const nextIndex = Math.min(j + 1, content.length);

  return { text: content.slice(i, nextIndex), nextIndex };
}

/**
 * Determines whether the comma at `content[i]` is a trailing comma: the
 * next significant character — skipping whitespace and comments — is `}`
 * or `]`.
 */
function isTrailingComma(content: string, i: number): boolean {
  let j = i + 1;
  let advanced = true;

  while (advanced) {
    advanced = false;
    while (j < content.length && isWhitespace(content[j])) {
      j += 1;
    }
    if (isLineCommentStart(content, j)) {
      j = skipLineComment(content, j);
      advanced = true;
    } else if (isBlockCommentStart(content, j)) {
      j = skipBlockComment(content, j);
      advanced = true;
    }
  }

  return content[j] === '}' || content[j] === ']';
}

function isWhitespace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}
