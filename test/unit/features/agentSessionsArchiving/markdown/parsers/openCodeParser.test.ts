/**
 * Tests for OpenCodeParser.
 *
 * The parser consumes the PLAN-005 §3 JSON produced by materializeSession.
 * All §3 document shapes are constructed inline here — no DB access.
 *
 * Schema-discovery findings applied (from WS-0022 Task 1.3):
 *   - No per-event compaction events exist in the OpenCode store.
 *     compactionSummaries is always [] for OpenCode sessions.
 *   - Reasoning content lives in part.data.text (same field as text parts).
 *   - step-start and step-finish parts are silently ignored.
 */
import { describe, it, expect } from 'vitest';
import type { ParseResult } from '../../../../../../src/features/agentSessionsArchiving/markdown/types';

// Imported once the parser module exists — fails until implementation:
import { OpenCodeParser } from '../../../../../../src/features/agentSessionsArchiving/markdown/parsers/openCodeParser';

function expectParsed(result: ParseResult) {
  expect(result.status).toBe('parsed');
  if (result.status !== 'parsed') throw new Error('expected parsed');
  return result.session;
}

function makeDoc(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    session: {
      id: 'sess-1',
      directory: '/ws',
      title: 'Test',
      agent: 'claude-4',
      parentId: null,
      timeCreated: 1000,
      timeUpdated: 2000,
      timeCompacting: null,
      summary: { additions: 0, deletions: 0, files: 0, diffs: '' },
    },
    messages: [],
    subagents: [],
    ...overrides,
  });
}

describe('OpenCodeParser', () => {
  const parser = new OpenCodeParser();

  describe('providerName', () => {
    it('is "open-code"', () => {
      expect(parser.providerName).toBe('open-code');
    });
  });

  describe('unrecognized cases', () => {
    it('returns unrecognized for invalid JSON', () => {
      const result = parser.parse('not json', 'sess-1');
      expect(result.status).toBe('unrecognized');
      const reason = (result as { status: 'unrecognized'; reason: string }).reason;
      expect(reason).toMatch(/json/i);
    });

    it('returns unrecognized for wrong schemaVersion', () => {
      const result = parser.parse(
        JSON.stringify({ schemaVersion: 2, session: {}, messages: [], subagents: [] }),
        'sess-1'
      );
      expect(result.status).toBe('unrecognized');
      const reason = (result as { status: 'unrecognized'; reason: string }).reason;
      expect(reason).toContain('2');
    });
  });

  describe('role labels', () => {
    it('maps role "user" to NormalizedTurn.role "user"', () => {
      const doc = makeDoc({
        messages: [{ id: 'm1', role: 'user', timeCreated: 1100, parts: [] }],
      });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      expect(session.turns).toHaveLength(1);
      expect(session.turns[0]!.role).toBe('user');
    });

    it('maps role "assistant" to NormalizedTurn.role "assistant"', () => {
      const doc = makeDoc({
        messages: [{ id: 'm1', role: 'assistant', timeCreated: 1100, parts: [] }],
      });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      expect(session.turns[0]!.role).toBe('assistant');
    });

    it('skips messages with unknown role (defensive)', () => {
      const doc = makeDoc({
        messages: [
          { id: 'm1', role: 'system', timeCreated: 1100, parts: [] },
          { id: 'm2', role: 'user', timeCreated: 1200, parts: [] },
        ],
      });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      // 'system' role is skipped; only 'user' remains
      expect(session.turns).toHaveLength(1);
      expect(session.turns[0]!.role).toBe('user');
    });
  });

  describe('timestamp', () => {
    it('converts epoch ms to UTC ISO 8601', () => {
      const doc = makeDoc({
        messages: [{ id: 'm1', role: 'user', timeCreated: 1700000000000, parts: [] }],
      });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      expect(session.turns[0]!.timestamp).toBe('2023-11-14T22:13:20.000Z');
    });
  });

  describe('text parts', () => {
    it('assembles single text part as turn content', () => {
      const doc = makeDoc({
        messages: [
          {
            id: 'm1',
            role: 'user',
            timeCreated: 1100,
            parts: [
              { id: 'p1', type: 'text', data: { type: 'text', text: 'hello world' } },
            ],
          },
        ],
      });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      expect(session.turns[0]!.content).toBe('hello world');
    });

    it('joins multiple text parts with double newline', () => {
      const doc = makeDoc({
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            timeCreated: 1100,
            parts: [
              { id: 'p1', type: 'text', data: { type: 'text', text: 'first' } },
              { id: 'p2', type: 'text', data: { type: 'text', text: 'second' } },
            ],
          },
        ],
      });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      expect(session.turns[0]!.content).toBe('first\n\nsecond');
    });
  });

  describe('reasoning parts', () => {
    it('sets thinking field from reasoning part data.text', () => {
      const doc = makeDoc({
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            timeCreated: 1100,
            parts: [
              {
                id: 'p1',
                type: 'reasoning',
                data: { type: 'reasoning', text: 'my thoughts' },
              },
              { id: 'p2', type: 'text', data: { type: 'text', text: 'my answer' } },
            ],
          },
        ],
      });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      expect(session.turns[0]!.thinking).toBe('my thoughts');
      expect(session.turns[0]!.content).toBe('my answer');
    });
  });

  describe('tool call parts', () => {
    it('maps tool part with output to ToolCall with name, input, output', () => {
      const doc = makeDoc({
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            timeCreated: 1100,
            parts: [
              {
                id: 'p1',
                type: 'tool',
                data: {
                  type: 'tool',
                  tool: 'read_file',
                  state: {
                    input: '{"path":"foo.ts"}',
                    output: 'content',
                    status: 'completed',
                  },
                },
              },
            ],
          },
        ],
      });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      expect(session.turns[0]!.toolCalls).toHaveLength(1);
      expect(session.turns[0]!.toolCalls[0]).toEqual({
        name: 'read_file',
        input: '{"path":"foo.ts"}',
        output: 'content',
      });
    });

    it('omits output field for incomplete tool (no state.output)', () => {
      const doc = makeDoc({
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            timeCreated: 1100,
            parts: [
              {
                id: 'p1',
                type: 'tool',
                data: {
                  type: 'tool',
                  tool: 'write_file',
                  state: { input: '{"path":"a.ts"}', status: 'running' },
                },
              },
            ],
          },
        ],
      });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      const tc = session.turns[0]!.toolCalls[0]!;
      expect(tc.name).toBe('write_file');
      expect(tc.input).toBe('{"path":"a.ts"}');
      expect('output' in tc).toBe(false);
    });
  });

  describe('step-start and step-finish parts', () => {
    it('ignores step-start and step-finish; turn has no content or tool calls', () => {
      const doc = makeDoc({
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            timeCreated: 1100,
            parts: [
              { id: 'p1', type: 'step-start', data: { type: 'step-start' } },
              { id: 'p2', type: 'step-finish', data: { type: 'step-finish' } },
            ],
          },
        ],
      });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      expect(session.turns).toHaveLength(1);
      expect(session.turns[0]!.content).toBe('');
      expect(session.turns[0]!.toolCalls).toHaveLength(0);
    });
  });

  describe('subagents', () => {
    it('maps subagents array to subagentSessions with agentId, agentType, description, turns', () => {
      const doc = makeDoc({
        subagents: [
          {
            session: {
              id: 'child-1',
              agent: 'claude-4',
              title: 'Refactor task',
              parentId: 'sess-1',
            },
            messages: [
              { id: 'cm1', role: 'user', timeCreated: 1200, parts: [] },
              {
                id: 'cm2',
                role: 'assistant',
                timeCreated: 1300,
                parts: [
                  { id: 'cp1', type: 'text', data: { type: 'text', text: 'done' } },
                ],
              },
            ],
          },
        ],
      });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      expect(session.subagentSessions).toHaveLength(1);
      const sub = session.subagentSessions![0]!;
      expect(sub.agentId).toBe('child-1');
      expect(sub.agentType).toBe('claude-4');
      expect(sub.description).toBe('Refactor task');
      expect(sub.turns).toHaveLength(2);
      expect(sub.turns[1]!.content).toBe('done');
    });

    it('uses "unknown" agentType fallback when session.agent is null', () => {
      const doc = makeDoc({
        subagents: [
          {
            session: { id: 'child-1', agent: null, title: null, parentId: 'sess-1' },
            messages: [],
          },
        ],
      });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      expect(session.subagentSessions![0]!.agentType).toBe('unknown');
    });

    it('uses "unknown" agentType fallback when session.agent is empty string', () => {
      const doc = makeDoc({
        subagents: [
          {
            session: { id: 'child-1', agent: '', title: null, parentId: 'sess-1' },
            messages: [],
          },
        ],
      });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      expect(session.subagentSessions![0]!.agentType).toBe('unknown');
    });
  });

  describe('compaction', () => {
    it('returns compactionSummaries as [] when no compaction events in messages', () => {
      // Confirmed in WS-0022 Task 1.3: OpenCode carries no per-event compaction
      // messages/parts. time_compacting is session-level metadata only.
      const doc = makeDoc({
        session: {
          id: 'sess-1',
          directory: '/ws',
          title: null,
          agent: null,
          parentId: null,
          timeCreated: 1000,
          timeUpdated: 2000,
          timeCompacting: 1500, // metadata — does NOT produce a CompactionSummary
          summary: { additions: 0, deletions: 0, files: 0, diffs: '' },
        },
        messages: [],
        subagents: [],
      });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      expect(session.compactionSummaries ?? []).toEqual([]);
    });

    it('returns compactionSummaries as [] when no compactionSummaries key in §3 JSON', () => {
      const doc = makeDoc();
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      expect(session.compactionSummaries ?? []).toEqual([]);
    });
  });

  describe('empty session', () => {
    it('returns status "parsed" with zero turns for a session with no messages', () => {
      // Parser does not apply the empty-session predicate; archiveService does.
      const doc = makeDoc({ messages: [] });
      const session = expectParsed(parser.parse(doc, 'sess-1'));
      expect(session.turns).toHaveLength(0);
    });
  });

  describe('providerName and providerDisplayName on parsed session', () => {
    it('sets providerName to "open-code" and providerDisplayName to "OpenCode"', () => {
      const session = expectParsed(parser.parse(makeDoc(), 'sess-1'));
      expect(session.providerName).toBe('open-code');
      expect(session.providerDisplayName).toBe('OpenCode');
    });
  });
});

describe('parser registration (Task 3.3)', () => {
  it('getParserForProvider("open-code") returns a non-undefined parser', async () => {
    const { getParserForProvider } =
      await import('../../../../../../src/features/agentSessionsArchiving/markdown/parsers/index');
    const p = getParserForProvider('open-code');
    expect(p).toBeDefined();
    expect(p!.providerName).toBe('open-code');
  });
});
