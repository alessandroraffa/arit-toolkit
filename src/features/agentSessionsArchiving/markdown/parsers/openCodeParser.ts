/**
 * OpenCode session parser.
 *
 * Consumes the PLAN-005 §3 JSON produced by materializeSession in
 * openCodeAdapter.ts. The §3 document shape:
 *
 * {
 *   schemaVersion: 1,
 *   session: { id, directory, title, agent, parentId, timeCreated, timeUpdated,
 *              timeCompacting, summary: { additions, deletions, files, diffs } },
 *   messages: [{ id, role, timeCreated, parts: [{ id, type, data }] }],
 *   subagents: [{ session: { id, agent, title, parentId }, messages: [...] }]
 * }
 *
 * Part mapping:
 *   type "text"         → content (data.text); multiple text parts joined with '\n\n'
 *   type "reasoning"    → thinking (data.text); multiple reasoning parts joined with '\n\n'
 *   type "tool"         → ToolCall: name=data.tool, input=data.state.input,
 *                         output=data.state.output (omitted when absent/non-string)
 *   type "step-start"   → ignored
 *   type "step-finish"  → ignored
 *
 * Compaction model (confirmed in WS-0022 Task 1.3, increment-1):
 *   No per-event compaction messages/parts exist in the OpenCode v1.17.9 store.
 *   time_compacting is session-level metadata only. compactionSummaries is always [].
 *
 * Role mapping: "user" → 'user', "assistant" → 'assistant'; any other value is
 * skipped with a console.debug log (parser has no logger dependency).
 */
import type {
  SessionParser,
  NormalizedTurn,
  ToolCall,
  ParseResult,
  SubagentSession,
} from '../types';

interface Section3Part {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

interface Section3Message {
  id: string;
  role: string;
  timeCreated: number;
  parts: Section3Part[];
}

interface Section3SubagentSession {
  id: string;
  agent: string | null;
  title: string | null;
  parentId: string | null;
}

interface Section3Subagent {
  session: Section3SubagentSession;
  messages: Section3Message[];
}

interface Section3Document {
  schemaVersion: number;
  session: {
    id: string;
    directory: string;
    title: string | null;
    agent: string | null;
    parentId: string | null;
    timeCreated: number;
    timeUpdated: number;
    timeCompacting: number | null;
    summary: { additions: number; deletions: number; files: number; diffs: string };
  };
  messages: Section3Message[];
  subagents: Section3Subagent[];
}

function getStr(val: unknown): string | undefined {
  return typeof val === 'string' && val.length > 0 ? val : undefined;
}

function mapParts(parts: Section3Part[]): {
  content: string;
  thinking: string | undefined;
  toolCalls: ToolCall[];
} {
  const textParts: string[] = [];
  const reasoningParts: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const part of parts) {
    const data = part.data;
    switch (part.type) {
      case 'text': {
        const text = typeof data.text === 'string' ? data.text : '';
        textParts.push(text);
        break;
      }
      case 'reasoning': {
        const text = typeof data.text === 'string' ? data.text : '';
        reasoningParts.push(text);
        break;
      }
      case 'tool': {
        const name = typeof data.tool === 'string' ? data.tool : 'unknown';
        const state = data.state as Record<string, unknown> | undefined;
        const rawInput = state?.input;
        const input =
          typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput ?? {});
        const rawOutput = state?.output;
        const output = getStr(rawOutput);
        const tc: ToolCall =
          output !== undefined ? { name, input, output } : { name, input };
        toolCalls.push(tc);
        break;
      }
      case 'step-start':
      case 'step-finish':
        // silently ignored per WS-0022 Task 3.2
        break;
      default:
        // unknown part type — ignore
        break;
    }
  }

  return {
    content: textParts.join('\n\n'),
    thinking: reasoningParts.length > 0 ? reasoningParts.join('\n\n') : undefined,
    toolCalls,
  };
}

function mapMessage(msg: Section3Message): NormalizedTurn | null {
  const role = msg.role;
  if (role !== 'user' && role !== 'assistant') {
    console.debug(`[OpenCodeParser] skipping message with unknown role "${role}"`);
    return null;
  }
  const { content, thinking, toolCalls } = mapParts(msg.parts);
  const turn: NormalizedTurn = {
    role,
    content,
    toolCalls,
    timestamp: new Date(msg.timeCreated).toISOString(),
    filesRead: [],
    filesModified: [],
    ...(thinking !== undefined ? { thinking } : {}),
  };
  return turn;
}

function mapSubagent(sub: Section3Subagent): SubagentSession {
  const agent = sub.session.agent;
  const agentType =
    typeof agent === 'string' && agent.trim().length > 0 ? agent : 'unknown';
  const turns = sub.messages
    .map(mapMessage)
    .filter((t): t is NormalizedTurn => t !== null);
  const title = sub.session.title;
  return {
    agentId: sub.session.id,
    agentType,
    ...(title !== null ? { description: title } : {}),
    turns,
  };
}

export class OpenCodeParser implements SessionParser {
  public readonly providerName = 'open-code';

  public parse(content: string, sessionId: string): ParseResult {
    let doc: Section3Document;
    try {
      doc = JSON.parse(content) as Section3Document;
    } catch {
      return { status: 'unrecognized', reason: 'invalid JSON' };
    }

    if (doc.schemaVersion !== 1) {
      return {
        status: 'unrecognized',
        reason: `unsupported schemaVersion ${String(doc.schemaVersion)}`,
      };
    }

    const turns: NormalizedTurn[] = doc.messages
      .map(mapMessage)
      .filter((t): t is NormalizedTurn => t !== null);

    const subagentSessions: SubagentSession[] = doc.subagents.map(mapSubagent);

    return {
      status: 'parsed',
      session: {
        providerName: 'open-code',
        providerDisplayName: 'OpenCode',
        sessionId,
        turns,
        subagentSessions,
        compactionSummaries: [],
      },
    };
  }
}
