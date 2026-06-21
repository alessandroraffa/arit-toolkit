import { sanitizeName } from './claudeCodeParserUtils';

/**
 * Derive the basename from a marker payload in a separator-agnostic way.
 * Handles both forward-slash (POSIX) and backslash (Windows) paths.
 * Returns undefined when the payload is empty/whitespace-only to guard
 * against the degenerate `path.basename('') === '.'` artifact.
 */
function markerBasename(payload: string): string | undefined {
  const trimmed = payload.trim();
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : undefined;
}

export function resolveToolResultMarkers(
  content: string,
  toolResultMap: ReadonlyMap<string, string>,
  logger?: { debug: (msg: string) => void }
): string {
  // Build a lowercased secondary index for case-insensitive fallback.
  const lowerMap = new Map<string, string>();
  for (const [key, value] of toolResultMap) {
    lowerMap.set(key.toLowerCase(), value);
  }

  return content.replace(
    /<persisted-output>([\s\S]*?)<\/persisted-output>/g,
    (match, inner) => {
      const filename = markerBasename(inner as string);
      if (filename === undefined) {
        logger?.debug(`resolveToolResultMarkers: empty marker payload — skipping lookup`);
        return match;
      }
      // Exact-case lookup (v2.5.1 full-filename keying preserved)
      const exact = toolResultMap.get(filename);
      if (exact !== undefined) return exact;
      // Case-insensitive fallback (macOS APFS / Windows NTFS)
      const lower = lowerMap.get(filename.toLowerCase());
      if (lower !== undefined) return lower;
      return match;
    }
  );
}

export function extractSubagentMeta(metaContent: string | undefined): {
  agentType: string;
  description?: string;
} {
  if (metaContent === undefined) return { agentType: 'unknown' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(metaContent);
  } catch {
    return { agentType: 'unknown' };
  }
  const record = parsed as Record<string, unknown>;
  const rawType = record.agentType;
  const sanitized = sanitizeName(rawType);
  const agentType = sanitized ?? 'unknown';
  const rawDesc = record.description;
  const description =
    typeof rawDesc === 'string' && rawDesc.length > 0 ? rawDesc : undefined;
  const result: { agentType: string; description?: string } = { agentType };
  if (description !== undefined) result.description = description;
  return result;
}

export function extractCompactionSummaryText(content: string): string | undefined {
  const lines = content.split('\n').filter((line) => line.trim());
  for (const line of lines) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const ev = event as Record<string, unknown>;
    if (ev.type !== 'assistant') continue;
    const message = ev.message as Record<string, unknown> | undefined;
    const messageContent = message?.content;
    if (!Array.isArray(messageContent)) continue;
    for (const block of messageContent as Record<string, unknown>[]) {
      if (block.type === 'text' && typeof block.text === 'string') {
        return block.text;
      }
    }
  }
  return undefined;
}

export function parseFirstEventAgentType(content: string): string {
  const firstLine = content.split('\n').find((line) => line.trim());
  if (!firstLine) return 'unknown';
  let event: unknown;
  try {
    event = JSON.parse(firstLine);
  } catch {
    return 'unknown';
  }
  const ev = event as Record<string, unknown>;
  const agentId = sanitizeName(ev.agentId);
  if (agentId !== undefined) return agentId;
  const subagentType = sanitizeName(ev.subagentType);
  if (subagentType !== undefined) return subagentType;
  return 'unknown';
}
