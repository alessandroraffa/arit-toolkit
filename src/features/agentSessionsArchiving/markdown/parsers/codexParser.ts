import type { SessionParser, NormalizedTurn, ToolCall, ParseResult } from '../types';

interface PendingCall {
  readonly callId: string;
  readonly name: string;
  readonly input: string;
}

interface ParseState {
  userContent: string;
  textParts: string[];
  pendingCalls: PendingCall[];
  outputs: Map<string, string>;
  thinking: string;
  filesModified: string[];
}

interface EventMsgPayload {
  readonly type?: string;
  readonly message?: string;
  readonly text?: string;
}

interface ResponseItemPayload {
  readonly type?: string;
  readonly role?: string;
  readonly content?: unknown;
  readonly summary?: unknown;
  readonly name?: string;
  readonly arguments?: string;
  readonly call_id?: string;
  readonly input?: string;
  readonly output?: string;
}

type ItemHandler = (payload: ResponseItemPayload, state: ParseState) => void;

function emptyState(): ParseState {
  return {
    userContent: '',
    textParts: [],
    pendingCalls: [],
    outputs: new Map(),
    thinking: '',
    filesModified: [],
  };
}

function toStr(val: string | undefined, fallback: string): string {
  return val ?? fallback;
}

function extractUserRequest(message: string): string {
  const marker = '## My request for Codex:\n';
  const idx = message.indexOf(marker);
  return idx !== -1 ? message.slice(idx + marker.length).trim() : message.trim();
}

function extractOutputText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return (content as { type?: string; text?: string }[])
    .filter((b) => b.type === 'output_text' && b.text)
    .map((b) => b.text ?? '')
    .join('\n\n');
}

function extractSummaryText(summary: unknown): string {
  if (!Array.isArray(summary)) return '';
  return (summary as { type?: string; text?: string }[])
    .filter((b) => b.type === 'summary_text' && b.text)
    .map((b) => b.text ?? '')
    .join('\n\n');
}

function stripExecHeader(raw: string): string {
  const marker = '\nOutput:\n';
  const idx = raw.indexOf(marker);
  return idx !== -1 ? raw.slice(idx + marker.length) : raw;
}

function parseExecCmd(argsStr: string): string {
  try {
    const args = JSON.parse(argsStr) as { cmd?: string };
    return typeof args.cmd === 'string' ? args.cmd : argsStr;
  } catch {
    return argsStr;
  }
}

function parseModifiedFiles(outputJson: string): string[] {
  try {
    const parsed = JSON.parse(outputJson) as { output?: string };
    return (parsed.output ?? '')
      .split('\n')
      .filter((line) => /^[MAD] /.test(line))
      .map((line) => line.slice(2).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildToolCalls(
  pendingCalls: readonly PendingCall[],
  outputs: Map<string, string>
): readonly ToolCall[] {
  return pendingCalls.map(({ callId, name, input }) => {
    const raw = outputs.get(callId);
    const output = raw !== undefined ? stripExecHeader(raw) : undefined;
    const base: ToolCall = input ? { name, input } : { name };
    return output ? { ...base, output } : base;
  });
}

function processEventMsg(payload: EventMsgPayload, state: ParseState): void {
  if (payload.type === 'user_message' && typeof payload.message === 'string') {
    state.userContent = extractUserRequest(payload.message);
    return;
  }
  if (payload.type === 'agent_reasoning' && typeof payload.text === 'string') {
    state.thinking += (state.thinking ? '\n\n' : '') + payload.text;
  }
}

function handleAssistantMessage(payload: ResponseItemPayload, state: ParseState): void {
  const text = extractOutputText(payload.content);
  if (text) state.textParts.push(text);
}

function handleReasoning(payload: ResponseItemPayload, state: ParseState): void {
  const text = extractSummaryText(payload.summary);
  if (text) state.thinking += (state.thinking ? '\n\n' : '') + text;
}

function handleFunctionCall(payload: ResponseItemPayload, state: ParseState): void {
  const name = toStr(payload.name, 'unknown');
  const argsStr = toStr(payload.arguments, '{}');
  const callId = toStr(payload.call_id, '');
  const input = parseExecCmd(argsStr);
  state.pendingCalls.push({ callId, name, input });
}

function handleFunctionCallOutput(payload: ResponseItemPayload, state: ParseState): void {
  const callId = toStr(payload.call_id, '');
  const output = toStr(payload.output, '');
  if (callId) state.outputs.set(callId, output);
}

function handleCustomToolCall(payload: ResponseItemPayload, state: ParseState): void {
  const name = toStr(payload.name, 'unknown');
  const input = toStr(payload.input, '');
  const callId = toStr(payload.call_id, '');
  state.pendingCalls.push({ callId, name, input });
}

function handleCustomToolCallOutput(
  payload: ResponseItemPayload,
  state: ParseState
): void {
  const callId = toStr(payload.call_id, '');
  const output = toStr(payload.output, '');
  if (callId) state.outputs.set(callId, output);
  state.filesModified.push(...parseModifiedFiles(output));
}

const RESPONSE_HANDLERS: Record<string, ItemHandler> = {
  reasoning: handleReasoning,
  function_call: handleFunctionCall,
  function_call_output: handleFunctionCallOutput,
  custom_tool_call: handleCustomToolCall,
  custom_tool_call_output: handleCustomToolCallOutput,
};

function processResponseItem(payload: ResponseItemPayload, state: ParseState): void {
  if (payload.type === 'message' && payload.role === 'assistant') {
    handleAssistantMessage(payload, state);
    return;
  }
  const handler = RESPONSE_HANDLERS[payload.type ?? ''];
  if (handler) handler(payload, state);
}

function buildTurns(state: ParseState): readonly NormalizedTurn[] {
  const turns: NormalizedTurn[] = [];
  if (state.userContent) {
    turns.push({
      role: 'user',
      content: state.userContent,
      toolCalls: [],
      filesRead: [],
      filesModified: [],
    });
  }
  const toolCalls = buildToolCalls(state.pendingCalls, state.outputs);
  const text = state.textParts.join('\n\n');
  const hasContent =
    text || toolCalls.length > 0 || !!state.thinking || state.filesModified.length > 0;
  if (hasContent) {
    const base: NormalizedTurn = {
      role: 'assistant',
      content: text,
      toolCalls,
      filesRead: [],
      filesModified: state.filesModified,
    };
    turns.push(state.thinking ? { ...base, thinking: state.thinking } : base);
  }
  return turns;
}

export class CodexParser implements SessionParser {
  public readonly providerName = 'codex';

  public parse(content: string, sessionId: string): ParseResult {
    const lines = content.split('\n').filter((l) => l.trim());
    if (!this.isCodexJsonl(lines)) {
      return { status: 'unrecognized', reason: 'first line is not a Codex session_meta' };
    }
    const state = emptyState();
    for (const line of lines) {
      this.processLine(line, state);
    }
    return {
      status: 'parsed',
      session: {
        providerName: 'codex',
        providerDisplayName: 'OpenAI Codex',
        sessionId,
        turns: buildTurns(state),
      },
    };
  }

  private isCodexJsonl(lines: string[]): boolean {
    const first = lines[0];
    if (!first) return false;
    try {
      const obj = JSON.parse(first) as { type?: string };
      return obj.type === 'session_meta';
    } catch {
      return false;
    }
  }

  private processLine(line: string, state: ParseState): void {
    let obj: { type?: string; payload?: unknown };
    try {
      obj = JSON.parse(line) as { type?: string; payload?: unknown };
    } catch {
      return;
    }
    if (!obj.payload) return;
    if (obj.type === 'event_msg') processEventMsg(obj.payload as EventMsgPayload, state);
    else if (obj.type === 'response_item')
      processResponseItem(obj.payload as ResponseItemPayload, state);
  }
}
