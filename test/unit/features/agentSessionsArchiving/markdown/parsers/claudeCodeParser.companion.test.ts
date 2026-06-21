import { describe, it, expect, vi } from 'vitest';
import { ClaudeCodeParser } from '../../../../../../src/features/agentSessionsArchiving/markdown/parsers/claudeCodeParser';
import type { ParseResult } from '../../../../../../src/features/agentSessionsArchiving/markdown/types';
import type { CompanionDataContext } from '../../../../../../src/features/agentSessionsArchiving/markdown/companionDataTypes';

function jsonl(...events: object[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n');
}

function expectParsed(result: ParseResult) {
  expect(result.status).toBe('parsed');
  if (result.status !== 'parsed') throw new Error('expected parsed');
  return result.session;
}

const userEvent = {
  type: 'user',
  message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
};

const assistantEvent = {
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there.' }] },
};

const baseContent = jsonl(userEvent, assistantEvent);

describe('ClaudeCodeParser — companion data', () => {
  const parser = new ClaudeCodeParser();

  it('session without companion context produces identical output', () => {
    const session = expectParsed(parser.parse(baseContent, 'session-1'));
    expect(session.subagentSessions).toBeUndefined();
    expect(session.compactionSummaries).toBeUndefined();
  });

  it('empty companion context produces no subagent sessions', () => {
    const ctx: CompanionDataContext = {
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    expect(session.subagentSessions).toBeUndefined();
    expect(session.compactionSummaries).toBeUndefined();
  });

  it('tool-result marker in main session content is resolved', () => {
    const content = jsonl(
      {
        type: 'tool_use',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              id: 'tool-1',
              input: { file_path: 'a.ts' },
            },
          ],
        },
      },
      {
        type: 'tool_result',
        message: {
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: '<persisted-output>/path/to/toolu_abc.txt</persisted-output>',
            },
          ],
        },
      },
      assistantEvent
    );
    const ctx: CompanionDataContext = {
      subagentEntries: [],
      toolResultMap: new Map([['toolu_abc.txt', 'actual tool output']]),
      compactionEntries: [],
    };
    const session = expectParsed(parser.parse(content, 'session-1', ctx));
    expect(session.turns[0]!.toolCalls[0]!.output).toBe('actual tool output');
  });

  it('unresolvable tool-result marker is retained', () => {
    const content = jsonl(
      {
        type: 'tool_use',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              id: 'tool-1',
              input: { file_path: 'a.ts' },
            },
          ],
        },
      },
      {
        type: 'tool_result',
        message: {
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: '<persisted-output>/path/to/toolu_abc.txt</persisted-output>',
            },
          ],
        },
      },
      assistantEvent
    );
    const ctx: CompanionDataContext = {
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [],
    };
    const session = expectParsed(parser.parse(content, 'session-1', ctx));
    expect(session.turns[0]!.toolCalls[0]!.output).toContain('<persisted-output>');
  });

  it('subagent entry is parsed into subagentSessions', () => {
    const subagentContent = jsonl(userEvent, assistantEvent);
    const ctx: CompanionDataContext = {
      subagentEntries: [{ agentId: 'sub-1', content: subagentContent }],
      toolResultMap: new Map(),
      compactionEntries: [],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    expect(session.subagentSessions).toHaveLength(1);
    expect(session.subagentSessions![0]!.turns).toHaveLength(2);
  });

  it('subagent metadata extracted from metaContent', () => {
    const subagentContent = jsonl(userEvent);
    const ctx: CompanionDataContext = {
      subagentEntries: [
        {
          agentId: 'sub-1',
          content: subagentContent,
          metaContent: '{"agentType":"Explore","description":"Explore the codebase"}',
        },
      ],
      toolResultMap: new Map(),
      compactionEntries: [],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    expect(session.subagentSessions![0]!.agentType).toBe('explore');
    expect(session.subagentSessions![0]!.description).toBe('Explore the codebase');
  });

  it('subagent type falls back to JSONL event when no metaContent', () => {
    const subagentContent = jsonl({
      type: 'user',
      agentId: 'reviewer-id',
      message: { role: 'user', content: 'hi' },
    });
    const ctx: CompanionDataContext = {
      subagentEntries: [{ agentId: 'sub-1', content: subagentContent }],
      toolResultMap: new Map(),
      compactionEntries: [],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    expect(session.subagentSessions![0]!.agentType).toBe('reviewer-id');
  });

  it('compaction entry produces compaction summary', () => {
    const compactionContent = jsonl({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'This is the summary.' }],
      },
    });
    const ctx: CompanionDataContext = {
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [{ content: compactionContent, mtime: 1700000000000 }],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    expect(session.compactionSummaries).toHaveLength(1);
    expect(session.compactionSummaries![0]!.summaryText).toBe('This is the summary.');
    expect(session.compactionSummaries![0]!.timestamp).toBe(
      new Date(1700000000000).toISOString()
    );
  });

  it('malformed subagent JSONL recovers gracefully', () => {
    const subagentContent =
      'not json\n' +
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      });
    const ctx: CompanionDataContext = {
      subagentEntries: [{ agentId: 'sub-1', content: subagentContent }],
      toolResultMap: new Map(),
      compactionEntries: [],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    expect(session.subagentSessions![0]!.turns).toHaveLength(1);
  });

  it('unreadable subagent entry produces session with unreadable: true and zero turns', () => {
    const ctx: CompanionDataContext = {
      subagentEntries: [{ agentId: 'abc', content: '', unreadable: true }],
      toolResultMap: new Map(),
      compactionEntries: [],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    expect(session.subagentSessions).toHaveLength(1);
    expect(session.subagentSessions![0]!.turns).toHaveLength(0);
    expect(session.subagentSessions![0]!.unreadable).toBe(true);
  });

  // L-03 tests: unified agentType resolution with filename-derived fallback

  it('L-03: meta agentType present → used as agentType', () => {
    const ctx: CompanionDataContext = {
      subagentEntries: [
        {
          agentId: 'sub-1',
          content: jsonl(userEvent),
          metaContent: '{"agentType":"CodeReview"}',
        },
      ],
      toolResultMap: new Map(),
      compactionEntries: [],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    expect(session.subagentSessions![0]!.agentType).toBe('code-review');
  });

  it('L-03: meta unknown but first event has subagentType → used as agentType', () => {
    const subContent = jsonl({
      type: 'user',
      subagentType: 'SecurityAudit',
      message: { role: 'user', content: 'hi' },
    });
    const ctx: CompanionDataContext = {
      subagentEntries: [{ agentId: 'sub-1', content: subContent }],
      toolResultMap: new Map(),
      compactionEntries: [],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    expect(session.subagentSessions![0]!.agentType).toBe('security-audit');
  });

  it('L-03: both meta and first-event unknown but agentId non-empty → agentId-derived label', () => {
    // No metaContent, no agentId/subagentType in first event → fall back to entry.agentId
    const subContent = jsonl({ type: 'user', message: { role: 'user', content: 'hi' } });
    const ctx: CompanionDataContext = {
      subagentEntries: [{ agentId: 'ReviewerAgent', content: subContent }],
      toolResultMap: new Map(),
      compactionEntries: [],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    // Should be 'reviewer-agent' (kebab-case of ReviewerAgent), not 'unknown'
    expect(session.subagentSessions![0]!.agentType).toBe('reviewer-agent');
    expect(session.subagentSessions![0]!.agentType).not.toBe('unknown');
  });

  it('L-03: all-symbol agentId that sanitizes to empty still yields a non-empty value', () => {
    // sanitizeName('!!!') returns undefined → resolveAgentType keeps the raw agentId
    const subContent = jsonl({ type: 'user', message: { role: 'user', content: 'hi' } });
    const ctx: CompanionDataContext = {
      subagentEntries: [{ agentId: '!!!', content: subContent }],
      toolResultMap: new Map(),
      compactionEntries: [],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    // Falls back to raw agentId '!!!' rather than dropping identity silently
    expect(session.subagentSessions![0]!.agentType).toBe('!!!');
  });

  // L-04 tests: compaction timestamp from event field + deterministic sort tiebreaker

  it('L-04: two entries with equal mtime but different filenames sort deterministically', () => {
    const makeCompaction = (text: string) =>
      jsonl({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text }] },
      });
    const ctx: CompanionDataContext = {
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [
        {
          content: makeCompaction('second'),
          mtime: 1000,
          filename: 'agent-acompact-z.jsonl',
        },
        {
          content: makeCompaction('first'),
          mtime: 1000,
          filename: 'agent-acompact-a.jsonl',
        },
      ],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    // filename 'agent-acompact-a' < 'agent-acompact-z' → 'first' renders before 'second'
    expect(session.compactionSummaries![0]!.summaryText).toBe('first');
    expect(session.compactionSummaries![1]!.summaryText).toBe('second');
  });

  it('L-04: rendered timestamp uses assistant event timestamp when present', () => {
    const eventTimestamp = '2025-01-15T10:30:00.000Z';
    const compactionContent = jsonl({
      type: 'assistant',
      timestamp: eventTimestamp,
      message: { role: 'assistant', content: [{ type: 'text', text: 'Summary.' }] },
    });
    const ctx: CompanionDataContext = {
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [{ content: compactionContent, mtime: 9999999999999 }],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    // Should use the event timestamp, not the mtime
    expect(session.compactionSummaries![0]!.timestamp).toBe(eventTimestamp);
    expect(session.compactionSummaries![0]!.timestamp).not.toBe(
      new Date(9999999999999).toISOString()
    );
  });

  it('L-04: falls back to mtime timestamp when event has no timestamp field', () => {
    const compactionContent = jsonl({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Summary.' }] },
    });
    const mtime = 1700000000000;
    const ctx: CompanionDataContext = {
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [{ content: compactionContent, mtime }],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    expect(session.compactionSummaries![0]!.timestamp).toBe(
      new Date(mtime).toISOString()
    );
  });

  it('L-04: distinct mtimes still sort ascending by mtime (regression)', () => {
    const makeCompaction = (text: string) =>
      jsonl({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text }] },
      });
    const ctx: CompanionDataContext = {
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [
        {
          content: makeCompaction('later'),
          mtime: 2000,
          filename: 'agent-acompact-a.jsonl',
        },
        {
          content: makeCompaction('earlier'),
          mtime: 1000,
          filename: 'agent-acompact-b.jsonl',
        },
      ],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-1', ctx));
    // mtime 1000 < 2000 → 'earlier' renders first
    expect(session.compactionSummaries![0]!.summaryText).toBe('earlier');
    expect(session.compactionSummaries![1]!.summaryText).toBe('later');
  });

  // L-07 tests: skipped-line tally observability

  it('L-07: parse emits debug tally when malformed lines are skipped', () => {
    const debugFn = vi.fn();
    const parserWithLogger = new ClaudeCodeParser({ debug: debugFn });

    const validLine = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
    });
    const content = [validLine, 'BAD LINE 1', 'BAD LINE 2'].join('\n');

    const session = expectParsed(parserWithLogger.parse(content, 'session-x'));

    // Valid event is parsed, bad lines skipped
    expect(session.turns).toHaveLength(1);
    // Debug tally must have been emitted with count 2
    expect(debugFn).toHaveBeenCalled();
    const calls = debugFn.mock.calls.map((c) => String(c[0]));
    expect(calls.some((m) => m.includes('2') && m.includes('session-x'))).toBe(true);
  });

  it('L-07: subagent parse emits debug tally when malformed lines are skipped', () => {
    const debugFn = vi.fn();
    const parserWithLogger = new ClaudeCodeParser({ debug: debugFn });

    const validSubagentLine = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'Sub' }] },
    });
    const subContent = [validSubagentLine, 'CORRUPT'].join('\n');
    const ctx: CompanionDataContext = {
      subagentEntries: [{ agentId: 'sub-abc', content: subContent }],
      toolResultMap: new Map(),
      compactionEntries: [],
    };

    const session = expectParsed(parserWithLogger.parse(baseContent, 'session-1', ctx));

    expect(session.subagentSessions![0]!.turns).toHaveLength(1);
    expect(debugFn).toHaveBeenCalled();
    const calls = debugFn.mock.calls.map((c) => String(c[0]));
    expect(calls.some((m) => m.includes('sub-abc'))).toBe(true);
  });

  it('L-07: no debug tally emitted when all lines parse cleanly', () => {
    const debugFn = vi.fn();
    const parserWithLogger = new ClaudeCodeParser({ debug: debugFn });

    const session = expectParsed(parserWithLogger.parse(baseContent, 'session-1'));

    expect(session.turns).toHaveLength(2);
    // debug may be called by resolveToolResultMarkers for other reasons,
    // but must NOT contain a 'skipped' tally message
    const skipCalls = debugFn.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes('skipped'));
    expect(skipCalls).toHaveLength(0);
  });

  // B-01 regression tests: post-parse marker resolution does not drop turns

  it('B-01: tool-result value containing a literal newline resolves without dropping the turn', () => {
    // The resolved value contains a raw newline and a double-quote — characters
    // that would break JSON parsing if substituted into the raw JSONL string.
    const valueWithNewlineAndQuote = 'line one\nline two with "quotes" inside';
    const content = jsonl(
      {
        type: 'tool_use',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              id: 'tool-nl',
              input: { file_path: 'b.ts' },
            },
          ],
        },
      },
      {
        type: 'tool_result',
        message: {
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-nl',
              content: '<persisted-output>/path/to/toolu_nl.txt</persisted-output>',
            },
          ],
        },
      },
      assistantEvent
    );
    const ctx: CompanionDataContext = {
      subagentEntries: [],
      toolResultMap: new Map([['toolu_nl.txt', valueWithNewlineAndQuote]]),
      compactionEntries: [],
    };
    // The tool_use + tool_result + assistant events collapse into one assistant turn
    // that carries the toolCall with its resolved output.  The turn must not be
    // dropped even though the resolved value contains raw newlines and quotes.
    const session = expectParsed(parser.parse(content, 'session-nl', ctx));
    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.toolCalls).toHaveLength(1);
    expect(session.turns[0]!.toolCalls[0]!.output).toBe(valueWithNewlineAndQuote);
  });

  it('B-01: tool-result value containing a backslash resolves without dropping the turn', () => {
    const valueWithBackslash = 'path\\to\\file and trailing\\';
    const content = jsonl(
      {
        type: 'tool_use',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              id: 'tool-bs',
              input: { file_path: 'c.ts' },
            },
          ],
        },
      },
      {
        type: 'tool_result',
        message: {
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-bs',
              content: '<persisted-output>/path/to/toolu_bs.txt</persisted-output>',
            },
          ],
        },
      },
      assistantEvent
    );
    const ctx: CompanionDataContext = {
      subagentEntries: [],
      toolResultMap: new Map([['toolu_bs.txt', valueWithBackslash]]),
      compactionEntries: [],
    };
    const session = expectParsed(parser.parse(content, 'session-bs', ctx));
    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.toolCalls).toHaveLength(1);
    expect(session.turns[0]!.toolCalls[0]!.output).toBe(valueWithBackslash);
  });

  it('B-01: large tool-result (>256KB) renders elided output and does not drop the turn', () => {
    // Simulate a tool-result that exceeded the byte cap and got the elision note.
    // The elision note starts with '\n', which would have broken pre-parse substitution.
    const bigValue =
      'A'.repeat(256 * 1024) + '\n… 1000 bytes elided, see tool-results/toolu_big.txt';
    const content = jsonl(
      {
        type: 'tool_use',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              id: 'tool-big',
              input: { file_path: 'd.ts' },
            },
          ],
        },
      },
      {
        type: 'tool_result',
        message: {
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-big',
              content: '<persisted-output>/path/to/toolu_big.txt</persisted-output>',
            },
          ],
        },
      },
      assistantEvent
    );
    const ctx: CompanionDataContext = {
      subagentEntries: [],
      toolResultMap: new Map([['toolu_big.txt', bigValue]]),
      compactionEntries: [],
    };
    // The turn must not be dropped despite the embedded newline in the elision note.
    const session = expectParsed(parser.parse(content, 'session-big', ctx));
    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.toolCalls).toHaveLength(1);
    expect(session.turns[0]!.toolCalls[0]!.output).toContain('… 1000 bytes elided');
    expect(session.turns[0]!.toolCalls[0]!.output).toContain('AAAA');
  });

  it('B-01: subagent tool-result marker containing newline resolves without dropping the subagent turn', () => {
    const valueWithNewline = 'first line\nsecond line';
    const subagentContent = jsonl(
      {
        type: 'tool_use',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              id: 'sub-tool-1',
              input: { file_path: 'x.ts' },
            },
          ],
        },
      },
      {
        type: 'tool_result',
        message: {
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'sub-tool-1',
              content: '<persisted-output>/path/to/toolu_sub.txt</persisted-output>',
            },
          ],
        },
      },
      assistantEvent
    );
    const ctx: CompanionDataContext = {
      subagentEntries: [{ agentId: 'sub-b01', content: subagentContent }],
      toolResultMap: new Map([['toolu_sub.txt', valueWithNewline]]),
      compactionEntries: [],
    };
    const session = expectParsed(parser.parse(baseContent, 'session-sub-b01', ctx));
    expect(session.subagentSessions).toHaveLength(1);
    // tool_use + tool_result + assistantEvent collapse into one assistant turn
    // that carries the toolCall with its resolved output.
    expect(session.subagentSessions![0]!.turns).toHaveLength(1);
    expect(session.subagentSessions![0]!.turns[0]!.toolCalls).toHaveLength(1);
    expect(session.subagentSessions![0]!.turns[0]!.toolCalls[0]!.output).toBe(
      valueWithNewline
    );
  });
});
