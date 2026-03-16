import type { SessionParser, NormalizedTurn, ParseResult } from '../types';
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

export class ClaudeCodeParser implements SessionParser {
  public readonly providerName = 'claude-code';

  public parse(content: string, sessionId: string): ParseResult {
    const lines = content.split('\n').filter((line) => line.trim());
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

    return {
      status: 'parsed',
      session: {
        providerName: 'claude-code',
        providerDisplayName: 'Claude Code',
        sessionId,
        turns,
      },
    };
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
}
