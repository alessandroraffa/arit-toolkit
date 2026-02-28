import type { SessionParser, NormalizedTurn, ToolCall, ParseResult } from '../types';
import { reconstructSessionFromJsonl } from './copilotJsonlReconstructor';
import { extractFromToolSpecificData } from './toolSpecificDataExtractor';

interface MessagePart {
  text?: string;
  kind?: string;
}

// invocationMessage / pastTenseMessage can be a plain string (newer Copilot
// format) or an object with a nested `value` (older format).
type CopilotMessage = { value?: string } | string;

interface ResponseItem {
  // `kind` is null for plain-text response items in the current Copilot format.
  kind?: string | null;
  value?: string;
  // `toolName` appears on `prepareToolInvocation` items (current format).
  toolName?: string;
  // `toolId` is present on `toolInvocationSerialized` items (current format).
  toolId?: string;
  invocationMessage?: CopilotMessage;
  pastTenseMessage?: CopilotMessage;
  toolSpecificData?: unknown;
}

interface CopilotRequest {
  message?: {
    text?: string;
    parts?: MessagePart[];
  };
  response?: ResponseItem[];
}

interface CopilotSession {
  requests?: CopilotRequest[];
}

export class CopilotChatParser implements SessionParser {
  public readonly providerName = 'copilot-chat';

  public parse(content: string, sessionId: string): ParseResult {
    const data = this.parseContent(content);
    if (!data.requests || !Array.isArray(data.requests)) {
      return {
        status: 'unrecognized',
        reason: 'no requests array found in session data',
      };
    }

    const turns: NormalizedTurn[] = [];
    for (const req of data.requests) {
      this.processRequest(req, turns);
    }

    return {
      status: 'parsed',
      session: {
        providerName: 'copilot-chat',
        providerDisplayName: 'GitHub Copilot Chat',
        sessionId,
        turns,
      },
    };
  }

  private parseContent(content: string): CopilotSession {
    try {
      return JSON.parse(content) as CopilotSession;
    } catch {
      return this.tryJsonl(content);
    }
  }

  private tryJsonl(content: string): CopilotSession {
    return reconstructSessionFromJsonl(content) as CopilotSession;
  }

  private processRequest(req: CopilotRequest, turns: NormalizedTurn[]): void {
    const userText = this.extractUserMessage(req);
    if (userText) {
      turns.push({
        role: 'user',
        content: userText,
        toolCalls: [],
        filesRead: [],
        filesModified: [],
      });
    }
    if (req.response && Array.isArray(req.response)) {
      this.addAssistantTurn(req.response, turns);
    }
  }

  private addAssistantTurn(response: ResponseItem[], turns: NormalizedTurn[]): void {
    const { text, toolCalls, thinking } = this.extractResponse(response);
    if (!text && toolCalls.length === 0 && !thinking) return;
    const base: NormalizedTurn = {
      role: 'assistant',
      content: text,
      toolCalls,
      filesRead: [],
      filesModified: [],
    };
    turns.push(thinking ? { ...base, thinking } : base);
  }

  private extractUserMessage(req: CopilotRequest): string {
    if (req.message?.text) {
      return req.message.text;
    }
    if (req.message?.parts) {
      return req.message.parts
        .filter((p) => p.text)
        .map((p) => p.text ?? '')
        .join('\n');
    }
    return '';
  }

  private extractResponse(items: ResponseItem[]): {
    text: string;
    toolCalls: ToolCall[];
    thinking: string;
  } {
    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];
    const thinkingParts: string[] = [];
    let pendingToolName: string | undefined;

    for (const item of items) {
      if (item.kind === 'prepareToolInvocation') {
        pendingToolName = item.toolName;
      } else if (item.kind === 'toolInvocationSerialized') {
        const tool = this.buildToolCall(item, pendingToolName);
        pendingToolName = undefined;
        if (tool) toolCalls.push(tool);
      } else if (item.kind === 'thinking' && item.value) {
        thinkingParts.push(item.value);
      } else if ((!item.kind || item.kind === 'markdownContent') && item.value) {
        textParts.push(item.value);
      }
    }

    return {
      text: textParts.join('\n\n'),
      toolCalls,
      thinking: thinkingParts.join('\n\n'),
    };
  }

  private resolveToolName(item: ResponseItem, pendingName: string | undefined): string {
    return item.toolName ?? pendingName ?? item.toolId ?? '';
  }

  private buildToolCall(
    item: ResponseItem,
    pendingName: string | undefined
  ): ToolCall | undefined {
    const name = this.resolveToolName(item, pendingName);
    if (!name) return undefined;
    const extra = extractFromToolSpecificData(item.toolSpecificData);
    const input = this.extractMessageText(item.invocationMessage) || extra?.input;
    const output = this.extractMessageText(item.pastTenseMessage) || extra?.output;
    return { name, ...(input ? { input } : {}), ...(output ? { output } : {}) };
  }

  private extractMessageText(msg: CopilotMessage | undefined): string {
    if (typeof msg === 'string') return msg;
    return msg?.value ?? '';
  }
}
