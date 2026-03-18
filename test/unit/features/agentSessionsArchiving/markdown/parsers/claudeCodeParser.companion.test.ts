import { describe, it, expect } from 'vitest';
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
      toolResultMap: new Map([['toolu_abc', 'actual tool output']]),
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
});
