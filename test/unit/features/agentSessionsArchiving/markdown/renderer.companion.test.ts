import { describe, it, expect } from 'vitest';
import { renderSessionToMarkdown } from '../../../../../src/features/agentSessionsArchiving/markdown/renderer';
import type { NormalizedSession } from '../../../../../src/features/agentSessionsArchiving/markdown/types';

describe('renderSessionToMarkdown — subagent sections', () => {
  it('session without subagent data produces unchanged output', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'user',
          content: 'Hello',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const output = renderSessionToMarkdown(session);

    expect(output).not.toContain('## Subagent:');
  });

  it('session with one subagent produces a subagent section', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [],
      subagentSessions: [
        {
          agentId: 'abc',
          agentType: 'explore',
          turns: [
            {
              role: 'user',
              content: 'Hi',
              toolCalls: [],
              filesRead: [],
              filesModified: [],
            },
            {
              role: 'assistant',
              content: 'Hello',
              toolCalls: [],
              filesRead: [],
              filesModified: [],
            },
          ],
        },
      ],
    };

    const output = renderSessionToMarkdown(session);

    expect(output).toContain('## Subagent: explore (abc)');
  });

  it('subagent with description renders description', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [],
      subagentSessions: [
        {
          agentId: 'abc',
          agentType: 'explore',
          description: 'Explore the repo',
          turns: [
            {
              role: 'user',
              content: 'Hi',
              toolCalls: [],
              filesRead: [],
              filesModified: [],
            },
          ],
        },
      ],
    };

    const output = renderSessionToMarkdown(session);

    expect(output).toContain('_Explore the repo_');
  });

  it('subagent without description omits description line', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [],
      subagentSessions: [
        {
          agentId: 'abc',
          agentType: 'explore',
          turns: [
            {
              role: 'user',
              content: 'Hi',
              toolCalls: [],
              filesRead: [],
              filesModified: [],
            },
          ],
        },
      ],
    };

    const output = renderSessionToMarkdown(session);
    const subagentHeadingPos = output.indexOf('## Subagent: explore (abc)');
    const textAfterHeading = output.slice(subagentHeadingPos);

    expect(textAfterHeading).not.toContain('_');
  });

  it('multiple subagents ordered chronologically', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [],
      subagentSessions: [
        {
          agentId: 'a',
          agentType: 'explore',
          turns: [
            {
              role: 'user',
              content: 'Hi',
              toolCalls: [],
              filesRead: [],
              filesModified: [],
              timestamp: '2026-01-02T00:00:00.000Z',
            },
          ],
        },
        {
          agentId: 'b',
          agentType: 'explore',
          turns: [
            {
              role: 'user',
              content: 'Hi',
              toolCalls: [],
              filesRead: [],
              filesModified: [],
              timestamp: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
    };

    const output = renderSessionToMarkdown(session);

    expect(output.indexOf('## Subagent: explore (b)')).toBeLessThan(
      output.indexOf('## Subagent: explore (a)')
    );
  });

  it('compaction summary renders as details block', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [],
      compactionSummaries: [
        { summaryText: 'Context summary.', timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    };

    const output = renderSessionToMarkdown(session);

    expect(output).toContain('<details>');
    expect(output).toContain('Compaction Summary');
    expect(output).toContain('Context summary.');
  });

  it('Agent tool call output replaced with reference when subagents present', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Delegating.',
          toolCalls: [{ name: 'Agent', output: 'compressed result' }],
          filesRead: [],
          filesModified: [],
        },
      ],
      subagentSessions: [
        {
          agentId: 'abc',
          agentType: 'explore',
          turns: [
            {
              role: 'user',
              content: 'Hi',
              toolCalls: [],
              filesRead: [],
              filesModified: [],
            },
          ],
        },
      ],
    };

    const output = renderSessionToMarkdown(session);

    expect(output).not.toContain('compressed result');
    expect(output).toContain('See Subagent section below.');
  });

  it('unreadable subagent renders a note instead of turns', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'user',
          content: 'Hello',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
        },
      ],
      subagentSessions: [
        {
          agentId: 'abc',
          agentType: 'explore',
          turns: [],
          unreadable: true,
        },
      ],
    };

    const output = renderSessionToMarkdown(session);
    const subagentHeadingPos = output.indexOf('## Subagent: explore (abc)');
    const textAfterHeading = output.slice(subagentHeadingPos);

    expect(output).toContain('## Subagent: explore (abc)');
    expect(output).toContain('⚠ Subagent transcript could not be read.');
    expect(textAfterHeading).not.toContain('**User:**');
    expect(textAfterHeading).not.toContain('**Agent:**');
  });
});
