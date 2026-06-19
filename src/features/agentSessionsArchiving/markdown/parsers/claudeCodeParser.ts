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
} from './claudeCodeParserUtils';
import type { CompanionDataContext, CompactionEntry } from '../companionDataTypes';
import {
  resolveToolResultMarkers,
  extractSubagentMeta,
  extractCompactionSummaryText,
  parseFirstEventAgentType,
} from './claudeCodeParserCompanion';

export class ClaudeCodeParser implements SessionParser {
  public readonly providerName = 'claude-code';

  public parse(
    content: string,
    sessionId: string,
    companionContext?: CompanionDataContext
  ): ParseResult {
    const resolvedContent = companionContext
      ? resolveToolResultMarkers(content, companionContext.toolResultMap)
      : content;

    const lines = resolvedContent.split('\n').filter((line) => line.trim());
    if (!this.looksLikeJsonl(lines)) {
      return { status: 'unrecognized', reason: 'content is not valid JSONL events' };
    }

    const turns: NormalizedTurn[] = [];
    let pending = emptyPending();

    for (const line of lines) {
      let event: JsonlEvent;
      try {
        event = JSON.parse(line) as JsonlEvent;
      } catch {
        continue;
      }
      pending = this.processEvent(event, turns, pending);
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
    const firstLine = lines[0];
    if (!firstLine) return false;
    try {
      const first = JSON.parse(firstLine) as Record<string, unknown>;
      return typeof first.type === 'string';
    } catch {
      return false;
    }
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
      const resolved = resolveToolResultMarkers(entry.content, context.toolResultMap);
      const lines = resolved.split('\n').filter((line) => line.trim());
      const turns: NormalizedTurn[] = [];
      let pending = emptyPending();
      for (const line of lines) {
        let event: JsonlEvent;
        try {
          event = JSON.parse(line) as JsonlEvent;
        } catch {
          continue;
        }
        pending = this.processEvent(event, turns, pending);
      }
      if (pending.toolCalls.length > 0 || pending.thinking) {
        turns.push(makeTurn({ role: 'assistant', content: '', ...pending }));
      }
      const meta = extractSubagentMeta(entry.metaContent);
      const agentType =
        meta.agentType === 'unknown'
          ? parseFirstEventAgentType(entry.content)
          : meta.agentType;
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
    const sorted = [...entries].sort((a, b) => a.mtime - b.mtime);
    const result: CompactionSummary[] = [];
    for (const entry of sorted) {
      const summaryText = extractCompactionSummaryText(entry.content);
      if (summaryText !== undefined) {
        result.push({ summaryText, timestamp: new Date(entry.mtime).toISOString() });
      }
    }
    return result;
  }
}
