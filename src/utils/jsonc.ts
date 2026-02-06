/**
 * Strips single-line (//) and multi-line comments from a JSONC string,
 * then parses it as JSON.
 */
export function parseJsonc(content: string): unknown {
  const stripped = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

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
