import type { NormalizedTurn, ToolCall } from '../types';

export interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: ContentBlock[] | string;
}

export interface JsonlEvent {
  type: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: ContentBlock[] | string;
  };
}

export interface PendingState {
  toolCalls: ToolCall[];
  thinking: string;
  filesRead: string[];
  filesModified: string[];
  timestamp?: string;
  agentName?: string;
  skillName?: string;
}

export function parseTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : value;
}

function toKebabCase(value: string): string {
  return value
    .trim()
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function sanitizeName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const kebab = toKebabCase(value);
  return kebab.length > 0 ? kebab : undefined;
}

function makeToolCall(name: string, input?: Record<string, unknown>): ToolCall {
  const inputStr = input ? JSON.stringify(input, null, 2) : '';
  return inputStr ? { name, input: inputStr } : { name };
}

export function makeTurn(params: {
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
  const turn: {
    role: 'user' | 'assistant';
    content: string;
    toolCalls: readonly ToolCall[];
    filesRead: readonly string[];
    filesModified: readonly string[];
    thinking?: string;
    timestamp?: string;
    agentName?: string;
    skillName?: string;
  } = { role, content, toolCalls, filesRead, filesModified };
  if (thinking) turn.thinking = thinking;
  if (timestamp) turn.timestamp = timestamp;
  if (agentName) turn.agentName = agentName;
  if (skillName) turn.skillName = skillName;
  return turn;
}

export function emptyPending(): PendingState {
  return { toolCalls: [], thinking: '', filesRead: [], filesModified: [] };
}

export function extractText(content: ContentBlock[] | string | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text ?? '')
    .join('\n\n');
}

export function getBlocks(content: ContentBlock[] | string | undefined): ContentBlock[] {
  if (!content || typeof content === 'string') return [];
  return content;
}

export function extractFileRefs(block: ContentBlock, pending: PendingState): void {
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

export function processToolUseBlock(block: ContentBlock, pending: PendingState): void {
  pending.toolCalls.push(makeToolCall(block.name ?? 'unknown', block.input));
  extractFileRefs(block, pending);
}

export function processToolResult(block: ContentBlock, pending: PendingState): void {
  if (!block.tool_use_id) return;
  const resultText = extractText(block.content);
  const existing = pending.toolCalls.find((tc) => !tc.output);
  if (existing && resultText) {
    const idx = pending.toolCalls.indexOf(existing);
    pending.toolCalls[idx] = { ...existing, output: resultText };
  }
}

export function extractToolMetadata(block: ContentBlock, pending: PendingState): void {
  if (block.name === 'Agent') {
    const agentName = sanitizeName(block.input?.subagent_type);
    if (agentName) pending.agentName = agentName;
  }
  if (block.name === 'Skill') {
    const skillName = sanitizeName(block.input?.skill);
    if (skillName) pending.skillName = skillName;
  }
}
