import { describe, it, expect } from 'vitest';
import { renderSessionToMarkdown } from '../../../../../src/features/agentSessionsArchiving/markdown/renderer';
import { renderCompactionSummaries } from '../../../../../src/features/agentSessionsArchiving/markdown/rendererSubagent';
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

  it('compaction summary text with HTML special characters is escaped', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [],
      compactionSummaries: [
        {
          summaryText: 'Result: a < b && x > y with <script>alert("xss")</script>',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    const output = renderSessionToMarkdown(session);

    expect(output).toContain('&lt;');
    expect(output).toContain('&gt;');
    expect(output).toContain('&amp;');
    expect(output).not.toContain('<script>');
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

describe('renderCompactionSummaries — H-11: per-line indentation', () => {
  it('H-11: multi-line summary has every line indented with two spaces', () => {
    const summaries = [
      {
        summaryText: 'Line one\nLine two\nLine three',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ];

    const lines = renderCompactionSummaries(summaries);
    const output = lines.join('\n');

    // Every non-empty body line must start with two spaces
    expect(output).toContain('  Line one');
    expect(output).toContain('  Line two');
    expect(output).toContain('  Line three');
    // No line after the opening blank should be unindented
    const bodyLines = output
      .split('\n')
      .filter((l) => l === 'Line one' || l === 'Line two' || l === 'Line three');
    expect(bodyLines).toHaveLength(0);
  });

  it('H-11: single-line summary is still indented with two spaces', () => {
    const summaries = [
      { summaryText: 'Single line.', timestamp: '2026-01-01T00:00:00.000Z' },
    ];

    const lines = renderCompactionSummaries(summaries);
    const output = lines.join('\n');

    expect(output).toContain('  Single line.');
  });

  it('H-11: body containing </details> is html-escaped (BK-005 regression)', () => {
    const summaries = [
      { summaryText: 'Safe </details> end', timestamp: '2026-01-01T00:00:00.000Z' },
    ];

    const lines = renderCompactionSummaries(summaries);

    // The body line must contain the escaped form — the literal tag must NOT
    // appear in the body (the only </details> in the output is the structural
    // closing tag that the renderer itself emits as the last line).
    const bodyLine = lines.find((l) => l.includes('Safe'));
    expect(bodyLine).toBeDefined();
    expect(bodyLine).toContain('&lt;/details&gt;');
    expect(bodyLine).not.toContain('</details>');
    // The structural closing tag is still present as the last element
    expect(lines[lines.length - 1]).toBe('</details>');
  });

  it('H-11: a body line starting with # stays inside the block when indented', () => {
    const summaries = [
      { summaryText: '# Heading\nParagraph', timestamp: '2026-01-01T00:00:00.000Z' },
    ];

    const lines = renderCompactionSummaries(summaries);
    const output = lines.join('\n');

    // The heading line must be indented (not a bare # at start of a rendered line)
    expect(output).toContain('  # Heading');
    expect(output).not.toMatch(/^# Heading/m);
  });
});
