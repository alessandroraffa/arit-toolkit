import type {
  SessionParser,
  NormalizedSession,
  NormalizedTurn,
  ToolCall,
} from '../types';

interface MessagePart {
  text?: string;
  kind?: string;
}

interface ResponseItem {
  kind: string;
  value?: string;
  toolName?: string;
  invocationMessage?: { value?: string };
  pastTenseMessage?: { value?: string };
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

  public parse(content: string, sessionId: string): NormalizedSession {
    let data: CopilotSession;
    try {
      data = JSON.parse(content) as CopilotSession;
    } catch {
      return this.emptySession(sessionId);
    }

    if (!data.requests || !Array.isArray(data.requests)) {
      return this.emptySession(sessionId);
    }

    const turns: NormalizedTurn[] = [];
    for (const req of data.requests) {
      this.processRequest(req, turns);
    }

    return {
      providerName: 'copilot-chat',
      providerDisplayName: 'GitHub Copilot Chat',
      sessionId,
      turns,
    };
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
    let thinking = '';

    for (const item of items) {
      if (item.kind === 'markdownContent' && item.value) {
        textParts.push(item.value);
      }
      if (item.kind === 'thinking' && item.value) {
        thinking += (thinking ? '\n\n' : '') + item.value;
      }
      if (item.kind === 'toolInvocationSerialized' && item.toolName) {
        toolCalls.push(this.makeToolInvocation(item));
      }
    }

    return { text: textParts.join('\n\n'), toolCalls, thinking };
  }

  private makeToolInvocation(item: ResponseItem): ToolCall {
    const tc: ToolCall = { name: item.toolName ?? '' };
    if (item.invocationMessage?.value) {
      return { ...tc, input: item.invocationMessage.value };
    }
    if (item.pastTenseMessage?.value) {
      return { ...tc, output: item.pastTenseMessage.value };
    }
    return tc;
  }

  private emptySession(sessionId: string): NormalizedSession {
    return {
      providerName: 'copilot-chat',
      providerDisplayName: 'GitHub Copilot Chat',
      sessionId,
      turns: [],
    };
  }
}
