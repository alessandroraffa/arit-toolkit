import type { SessionParser, NormalizedTurn, ToolCall, ParseResult } from '../types';

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: ContentBlock[] | string;
}

interface JsonlEvent {
  type: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: ContentBlock[] | string;
  };
}

interface PendingState {
  toolCalls: ToolCall[];
  thinking: string;
  filesRead: string[];
  filesModified: string[];
  timestamp?: string;
  agentName?: string;
  skillName?: string;
}

function parseTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : value;
}

function toKebabCase(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function sanitizeName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const kebab = toKebabCase(value);
  return kebab.length > 0 ? kebab : undefined;
}

function makeToolCall(name: string, input?: Record<string, unknown>): ToolCall {
  const inputStr = input ? JSON.stringify(input, null, 2) : '';
  return inputStr ? { name, input: inputStr } : { name };
}

function makeTurn(params: {
  role: 'user' | 'assistant';
  content: string;
  toolCalls: readonly ToolCall[];
  thinking: string;
  filesRead: readonly string[];
  filesModified: readonly string[];
  timestamp?: string;
  agentName?: string;
  skillName?: string;
}): NormalizedTurn {
  const {
    role,
    content,
    toolCalls,
    filesRead,
    filesModified,
    thinking,
    timestamp,
    agentName,
    skillName,
  } = params;
  const base: NormalizedTurn = { role, content, toolCalls, filesRead, filesModified };
  const withThinking: NormalizedTurn = thinking ? { ...base, thinking } : base;
  const withTimestamp: NormalizedTurn = timestamp
    ? { ...withThinking, timestamp }
    : withThinking;
  const withAgentName: NormalizedTurn = agentName
    ? { ...withTimestamp, agentName }
    : withTimestamp;
  return skillName ? { ...withAgentName, skillName } : withAgentName;
}

function emptyPending(): PendingState {
  return { toolCalls: [], thinking: '', filesRead: [], filesModified: [] };
}

function extractText(content: ContentBlock[] | string | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text ?? '')
    .join('\n\n');
}

function getBlocks(content: ContentBlock[] | string | undefined): ContentBlock[] {
  if (!content || typeof content === 'string') return [];
  return content;
}

function extractFileRefs(block: ContentBlock, pending: PendingState): void {
  if (!block.input) return;
  const name = block.name ?? '';
  if (name === 'Read' && typeof block.input.file_path === 'string') {
    pending.filesRead.push(block.input.file_path);
  }
  if (
    (name === 'Edit' || name === 'Write') &&
    typeof block.input.file_path === 'string'
  ) {
    pending.filesModified.push(block.input.file_path);
  }
}

function processToolUseBlock(block: ContentBlock, pending: PendingState): void {
  pending.toolCalls.push(makeToolCall(block.name ?? 'unknown', block.input));
  extractFileRefs(block, pending);
}

function processToolResult(block: ContentBlock, pending: PendingState): void {
  if (!block.tool_use_id) return;
  const resultText = extractText(block.content);
  const existing = pending.toolCalls.find((tc) => !tc.output);
  if (existing && resultText) {
    const idx = pending.toolCalls.indexOf(existing);
    pending.toolCalls[idx] = { ...existing, output: resultText };
  }
}

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
      if (block.name === 'Agent') {
        const agentName = sanitizeName(block.input?.subagent_type);
        if (agentName) pending.agentName = agentName;
      }
      if (block.name === 'Skill') {
        const skillName = sanitizeName(block.input?.skill);
        if (skillName) pending.skillName = skillName;
      }
    }
  }

  private processToolUseEvent(event: JsonlEvent, pending: PendingState): void {
    for (const b of getBlocks(event.message?.content)) {
      if (b.type === 'tool_use') processToolUseBlock(b, pending);
    }
  }

  private processToolResultEvent(event: JsonlEvent, pending: PendingState): void {
    for (const b of getBlocks(event.message?.content)) {
      if (b.type === 'tool_result') processToolResult(b, pending);
    }
  }
}
