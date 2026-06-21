import type {
  SessionParser,
  NormalizedTurn,
  ParseResult,
  SubagentSession,
  CompactionSummary,
} from '../types';
import type { ContentBlock, JsonlEvent, PendingState } from './claudeCodeParserUtils';
import {
  parseTimestamp,
  makeTurn,
  emptyPending,
  extractText,
  getBlocks,
  processToolUseBlock,
  processToolResult,
  extractToolMetadata,
  sanitizeName,
} from './claudeCodeParserUtils';
import type { CompanionDataContext, CompactionEntry } from '../companionDataTypes';
import {
  resolveToolResultMarkers,
  extractSubagentMeta,
  extractCompactionSummaryText,
  parseFirstEventAgentType,
} from './claudeCodeParserCompanion';

/**
 * L-03: Unified agentType resolver — chains meta → first-event → filename-derived
 * fallback so the heading is never 'unknown' when the entry.agentId is available.
 *
 * Resolution order:
 * 1. meta.agentType (sanitized via extractSubagentMeta → sanitizeName)
 * 2. first-event agentId / subagentType (parseFirstEventAgentType)
 * 3. filename-derived label from entry.agentId when non-empty
 * 4. 'unknown' only as the last resort (agentId also empty)
 */
function resolveAgentType(
  metaContent: string | undefined,
  rawContent: string,
  agentId: string
): string {
  const meta = extractSubagentMeta(metaContent);
  if (meta.agentType !== 'unknown') return meta.agentType;

  const fromFirstEvent = parseFirstEventAgentType(rawContent);
  if (fromFirstEvent !== 'unknown') return fromFirstEvent;

  // Final fallback: derive a label from the filename-embedded agentId.
  // sanitizeName converts CamelCase/PascalCase to kebab-case and drops
  // all-symbol names to undefined — in that case fall back to 'unknown'.
  if (agentId.length > 0) {
    const derived = sanitizeName(agentId);
    return derived ?? agentId; // keep raw agentId if sanitizeName strips it entirely
  }

  return 'unknown';
}

/**
 * L-04: Extract the displayed compaction timestamp from the assistant event's
 * own `timestamp` field when present; fall back to the file mtime otherwise.
 */
function resolveCompactionTimestamp(content: string, mtime: number): string {
  // Scan the first few lines for an assistant event with a timestamp field.
  const lines = content.split('\n');
  const window = lines.slice(0, 10); // small window — timestamp is usually near the top
  for (const line of window) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line) as Record<string, unknown>;
      if (ev.type === 'assistant' && typeof ev.timestamp === 'string' && ev.timestamp) {
        const d = new Date(ev.timestamp);
        if (!isNaN(d.getTime())) return ev.timestamp;
      }
    } catch {
      // non-JSON line — continue
    }
  }
  return new Date(mtime).toISOString();
}

export class ClaudeCodeParser implements SessionParser {
  public readonly providerName = 'claude-code';

  /** L-07: optional logger for observability; injected at construction time. */
  private readonly logger: { debug: (msg: string) => void } | undefined;

  constructor(logger?: { debug: (msg: string) => void }) {
    this.logger = logger ?? undefined;
  }

  public parse(
    content: string,
    sessionId: string,
    companionContext?: CompanionDataContext
  ): ParseResult {
    const resolvedContent = companionContext
      ? resolveToolResultMarkers(content, companionContext.toolResultMap, this.logger)
      : content;

    const lines = resolvedContent.split('\n').filter((line) => line.trim());
    if (!this.looksLikeJsonl(lines)) {
      return { status: 'unrecognized', reason: 'content is not valid JSONL events' };
    }

    const turns: NormalizedTurn[] = [];
    let pending = emptyPending();
    // L-07: count skipped malformed lines for the debug tally
    let skippedLines = 0;

    for (const line of lines) {
      let event: JsonlEvent;
      try {
        event = JSON.parse(line) as JsonlEvent;
      } catch {
        skippedLines++;
        continue;
      }
      pending = this.processEvent(event, turns, pending);
    }
    // L-07: emit tally when at least one line was skipped
    if (skippedLines > 0) {
      this.logger?.debug(
        `ClaudeCodeParser.parse "${sessionId}": skipped ${String(skippedLines)} malformed JSONL line(s)`
      );
    }

    if (pending.toolCalls.length > 0 || pending.thinking) {
      turns.push(makeTurn({ role: 'assistant', content: '', ...pending }));
    }

    const subagentSessions = companionContext
      ? this.processSubagentEntries(companionContext, sessionId)
      : undefined;

    const compactionSummaries = companionContext
      ? this.processCompactionEntries(companionContext.compactionEntries)
      : undefined;

    const sessionBase: {
      providerName: string;
      providerDisplayName: string;
      sessionId: string;
      turns: readonly NormalizedTurn[];
      subagentSessions?: readonly SubagentSession[];
      compactionSummaries?: readonly CompactionSummary[];
    } = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId,
      turns,
    };
    if (subagentSessions && subagentSessions.length > 0) {
      sessionBase.subagentSessions = subagentSessions;
    }
    if (compactionSummaries && compactionSummaries.length > 0) {
      sessionBase.compactionSummaries = compactionSummaries;
    }
    return { status: 'parsed', session: sessionBase };
  }

  private looksLikeJsonl(lines: string[]): boolean {
    // H-10: scan the first ~5 non-blank lines and return true if ANY parses
    // to an object with a string `type` field.  This handles files whose
    // leading record is a summary/index object without a string `type` — the
    // file still contains real events and should produce structured markdown.
    const window = lines.slice(0, 5);
    for (const line of window) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (typeof parsed.type === 'string') return true;
      } catch {
        // Not valid JSON — continue scanning
      }
    }
    return false;
  }

  private processEvent(
    event: JsonlEvent,
    turns: NormalizedTurn[],
    pending: PendingState
  ): PendingState {
    if (event.type === 'user') {
      this.processUserEvent(event, turns);
      return pending;
    }
    if (event.type === 'assistant') {
      return this.processAssistantEvent(event, turns, pending);
    }
    if (event.type === 'tool_use') {
      this.processToolUseEvent(event, pending);
      return pending;
    }
    if (event.type === 'tool_result') {
      this.processToolResultEvent(event, pending);
    }
    return pending;
  }

  private processUserEvent(event: JsonlEvent, turns: NormalizedTurn[]): void {
    const text = extractText(event.message?.content);
    if (text) {
      const validTimestamp = parseTimestamp(event.timestamp);
      const turnParams: Parameters<typeof makeTurn>[0] = {
        role: 'user',
        content: text,
        toolCalls: [],
        thinking: '',
        filesRead: [],
        filesModified: [],
      };
      if (validTimestamp) turnParams.timestamp = validTimestamp;
      turns.push(makeTurn(turnParams));
    }
  }

  private processAssistantEvent(
    event: JsonlEvent,
    turns: NormalizedTurn[],
    pending: PendingState
  ): PendingState {
    const validTimestamp = parseTimestamp(event.timestamp);
    if (validTimestamp) pending.timestamp = validTimestamp;

    const textParts: string[] = [];
    for (const block of getBlocks(event.message?.content)) {
      this.processAssistantBlock(block, textParts, pending);
    }

    const text = textParts.join('\n\n');
    if (text || pending.toolCalls.length > 0 || pending.thinking) {
      turns.push(makeTurn({ role: 'assistant', content: text, ...pending }));
    }
    return emptyPending();
  }

  private processAssistantBlock(
    block: ContentBlock,
    textParts: string[],
    pending: PendingState
  ): void {
    if (block.type === 'text' && block.text) textParts.push(block.text);
    if (block.type === 'thinking' && block.thinking) {
      pending.thinking += (pending.thinking ? '\n\n' : '') + block.thinking;
    }
    if (block.type === 'tool_use') {
      processToolUseBlock(block, pending);
      extractToolMetadata(block, pending);
    }
  }

  private processToolUseEvent(event: JsonlEvent, pending: PendingState): void {
    for (const b of getBlocks(event.message?.content)) {
      if (b.type === 'tool_use') {
        processToolUseBlock(b, pending);
        extractToolMetadata(b, pending);
      }
    }
  }

  private processToolResultEvent(event: JsonlEvent, pending: PendingState): void {
    for (const b of getBlocks(event.message?.content)) {
      if (b.type === 'tool_result') processToolResult(b, pending);
    }
  }

  private processSubagentEntries(
    context: CompanionDataContext,
    _sessionId: string
  ): SubagentSession[] {
    const result: SubagentSession[] = [];
    for (const entry of context.subagentEntries) {
      if (entry.unreadable === true) {
        result.push({
          agentId: entry.agentId,
          agentType: 'unknown',
          turns: [],
          unreadable: true,
        });
        continue;
      }
      const resolved = resolveToolResultMarkers(
        entry.content,
        context.toolResultMap,
        this.logger
      );
      const lines = resolved.split('\n').filter((line) => line.trim());
      const turns: NormalizedTurn[] = [];
      let pending = emptyPending();
      // L-07: tally malformed lines for observability
      let skippedSubagentLines = 0;
      for (const line of lines) {
        let event: JsonlEvent;
        try {
          event = JSON.parse(line) as JsonlEvent;
        } catch {
          skippedSubagentLines++;
          continue;
        }
        pending = this.processEvent(event, turns, pending);
      }
      if (skippedSubagentLines > 0) {
        this.logger?.debug(
          `ClaudeCodeParser subagent "${entry.agentId}": skipped ${String(skippedSubagentLines)} malformed JSONL line(s)`
        );
      }
      if (pending.toolCalls.length > 0 || pending.thinking) {
        turns.push(makeTurn({ role: 'assistant', content: '', ...pending }));
      }
      // L-03: use the unified resolver (meta → first-event → filename-derived fallback)
      const agentType = resolveAgentType(entry.metaContent, entry.content, entry.agentId);
      const meta = extractSubagentMeta(entry.metaContent);
      const session: {
        agentId: string;
        agentType: string;
        turns: readonly NormalizedTurn[];
        description?: string;
      } = { agentId: entry.agentId, agentType, turns };
      if (meta.description) session.description = meta.description;
      result.push(session);
    }
    return result;
  }

  private processCompactionEntries(
    entries: readonly CompactionEntry[]
  ): CompactionSummary[] {
    // L-04: sort by mtime ascending; use filename as a deterministic tiebreaker
    // for same-tick entries so archive output is stable across runs.
    const sorted = [...entries].sort((a, b) => {
      const mtimeDiff = a.mtime - b.mtime;
      if (mtimeDiff !== 0) return mtimeDiff;
      // Secondary key: source filename (embeds an ordering token)
      const fa = a.filename ?? '';
      const fb = b.filename ?? '';
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    });
    const result: CompactionSummary[] = [];
    for (const entry of sorted) {
      const summaryText = extractCompactionSummaryText(entry.content);
      if (summaryText !== undefined) {
        // L-04: derive displayed timestamp from the assistant event's own timestamp
        // field when present; fall back to the file mtime when absent.
        const timestamp = resolveCompactionTimestamp(entry.content, entry.mtime);
        result.push({ summaryText, timestamp });
      }
    }
    return result;
  }
}
