export interface ToolCall {
  readonly name: string;
  readonly input?: string;
  readonly output?: string;
}

export interface NormalizedTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly toolCalls: readonly ToolCall[];
  readonly thinking?: string;
  readonly filesRead: readonly string[];
  readonly filesModified: readonly string[];
}

export interface NormalizedSession {
  readonly providerName: string;
  readonly providerDisplayName: string;
  readonly sessionId: string;
  readonly turns: readonly NormalizedTurn[];
}

export interface SessionParser {
  readonly providerName: string;
  parse(content: string, sessionId: string): NormalizedSession;
}
