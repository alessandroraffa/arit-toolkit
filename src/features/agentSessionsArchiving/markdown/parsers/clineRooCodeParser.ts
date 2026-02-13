import type {
  SessionParser,
  NormalizedSession,
  NormalizedTurn,
  ToolCall,
} from '../types';

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: ContentBlock[] | string;
}

interface Message {
  role: string;
  content: ContentBlock[] | string;
}

function makeToolCall(name: string, input?: Record<string, unknown>): ToolCall {
  const inputStr = input ? JSON.stringify(input, null, 2) : '';
  return inputStr ? { name, input: inputStr } : { name };
}

function extractText(content: ContentBlock[] | string | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text ?? '')
    .join('\n\n');
}

function extractFileRefs(
  block: ContentBlock,
  filesRead: string[],
  filesModified: string[]
): void {
  if (!block.input) return;
  const name = block.name ?? '';
  if (name === 'read_file' && typeof block.input.path === 'string') {
    filesRead.push(block.input.path);
  }
  if (
    (name === 'write_to_file' || name === 'apply_diff') &&
    typeof block.input.path === 'string'
  ) {
    filesModified.push(block.input.path);
  }
}

function processBlock(
  block: ContentBlock,
  ctx: {
    textParts: string[];
    toolCalls: ToolCall[];
    filesRead: string[];
    filesModified: string[];
  }
): void {
  if (block.type === 'text' && block.text) ctx.textParts.push(block.text);
  if (block.type === 'tool_use' && block.name) {
    ctx.toolCalls.push(makeToolCall(block.name, block.input));
    extractFileRefs(block, ctx.filesRead, ctx.filesModified);
  }
  if (block.type === 'tool_result') {
    const resultText = extractText(block.content);
    const unresolved = ctx.toolCalls.find((tc) => !tc.output);
    if (unresolved && resultText) {
      const idx = ctx.toolCalls.indexOf(unresolved);
      ctx.toolCalls[idx] = { ...unresolved, output: resultText };
    }
  }
}

export class ClineRooCodeParser implements SessionParser {
  constructor(
    public readonly providerName: string,
    private readonly displayName: string
  ) {}

  public parse(content: string, sessionId: string): NormalizedSession {
    let messages: Message[];
    try {
      messages = JSON.parse(content) as Message[];
    } catch {
      return this.emptySession(sessionId);
    }

    if (!Array.isArray(messages)) return this.emptySession(sessionId);

    const turns: NormalizedTurn[] = [];
    for (const msg of messages) {
      const turn = this.processMessage(msg);
      if (turn) turns.push(turn);
    }

    return {
      providerName: this.providerName,
      providerDisplayName: this.displayName,
      sessionId,
      turns,
    };
  }

  private processMessage(msg: Message): NormalizedTurn | null {
    const role = msg.role === 'user' ? 'user' : 'assistant';
    const blocks = typeof msg.content === 'string' ? [] : msg.content;
    const ctx = {
      textParts: [] as string[],
      toolCalls: [] as ToolCall[],
      filesRead: [] as string[],
      filesModified: [] as string[],
    };

    for (const block of blocks) processBlock(block, ctx);

    const text =
      typeof msg.content === 'string' ? msg.content : ctx.textParts.join('\n\n');
    if (!text && ctx.toolCalls.length === 0) return null;

    return {
      role,
      content: text,
      toolCalls: ctx.toolCalls,
      filesRead: ctx.filesRead,
      filesModified: ctx.filesModified,
    };
  }

  private emptySession(sessionId: string): NormalizedSession {
    return {
      providerName: this.providerName,
      providerDisplayName: this.displayName,
      sessionId,
      turns: [],
    };
  }
}
