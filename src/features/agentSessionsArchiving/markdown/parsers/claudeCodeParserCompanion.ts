import { sanitizeName } from './claudeCodeParserUtils';
import { COMPACTION_SCAN_BUDGET, COMPANION_FILE_BYTE_CAP } from '../../constants';

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
      // L-07: log unresolved markers so externalization gaps are diagnosable
      logger?.debug(
        `resolveToolResultMarkers: unresolved marker for "${filename}" — retained verbatim`
      );
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

export function extractCompactionSummaryText(
  content: string,
  logger?: { warn: (msg: string) => void }
): string | undefined {
  // H-07: bound the scan to the first COMPACTION_SCAN_BUDGET bytes to avoid
  // materializing a full line array for very large compaction files.
  const budgetExceeded = content.length > COMPACTION_SCAN_BUDGET;
  const head = budgetExceeded ? content.slice(0, COMPACTION_SCAN_BUDGET) : content;

  const lines = head.split('\n').filter((line) => line.trim());
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
    // H-09: handle string-form message.content (older/variant Claude Code schema)
    if (typeof messageContent === 'string' && messageContent.length > 0) {
      // Apply summary text cap with elision note if needed
      if (messageContent.length > COMPANION_FILE_BYTE_CAP) {
        return (
          messageContent.slice(0, COMPANION_FILE_BYTE_CAP) +
          '\n… summary truncated (see compaction file)'
        );
      }
      return messageContent;
    }
    if (!Array.isArray(messageContent)) continue;
    for (const block of messageContent as Record<string, unknown>[]) {
      if (block.type === 'text' && typeof block.text === 'string') {
        const text = block.text;
        // Apply summary text cap with elision note if needed
        if (text.length > COMPANION_FILE_BYTE_CAP) {
          return (
            text.slice(0, COMPANION_FILE_BYTE_CAP) +
            '\n… summary truncated (see compaction file)'
          );
        }
        return text;
      }
    }
  }

  // R-06: warn when no assistant event was found AND the content was truncated
  // to the scan budget — the summary may exist beyond the budget boundary.
  if (budgetExceeded) {
    logger?.warn(
      `extractCompactionSummaryText: no assistant event found within ` +
        `COMPACTION_SCAN_BUDGET (${String(COMPACTION_SCAN_BUDGET)} bytes) — ` +
        `compaction summary may be beyond the scan budget and will be omitted`
    );
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
