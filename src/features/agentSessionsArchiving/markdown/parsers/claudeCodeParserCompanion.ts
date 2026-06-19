import * as path from 'path';
import { sanitizeName } from './claudeCodeParserUtils';

export function resolveToolResultMarkers(
  content: string,
  toolResultMap: ReadonlyMap<string, string>
): string {
  return content.replace(
    /<persisted-output>([\s\S]*?)<\/persisted-output>/g,
    (match, inner) => {
      const key = path.parse((inner as string).trim()).name;
      return toolResultMap.get(key) ?? match;
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
