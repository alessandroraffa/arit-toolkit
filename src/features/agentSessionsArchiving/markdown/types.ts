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

/**
 * Discriminated union returned by `SessionParser.parse()`.
 *
 * - `parsed`  — session was understood and converted (may still have 0 turns).
 * - `unrecognized` — the content did not match any format the parser supports.
 *   `reason` explains why so the archiveService can log it.
 */
export type ParseResult =
  | { readonly status: 'parsed'; readonly session: NormalizedSession }
  | { readonly status: 'unrecognized'; readonly reason: string };

export interface SessionParser {
  readonly providerName: string;
  parse(content: string, sessionId: string): ParseResult;
}
