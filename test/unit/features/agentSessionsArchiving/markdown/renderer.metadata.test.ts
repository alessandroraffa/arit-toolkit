import { describe, it, expect } from 'vitest';
import { renderSessionToMarkdown } from '../../../../../src/features/agentSessionsArchiving/markdown/renderer';
import type { NormalizedSession } from '../../../../../src/features/agentSessionsArchiving/markdown/types';

describe('renderSessionToMarkdown — metadata fields', () => {
  it('should render timestamp adjacent to role label when present', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Hello.',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
          timestamp: '2026-03-15T10:30:00.000Z',
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**Agent:**');
    expect(md).toContain('2026-03-15');
    expect(md).toContain('10:30:00');
  });

  it('should not render timestamp placeholder when timestamp absent', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Hello.',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**Agent:** Hello.');
    expect(md).not.toContain(' — ');
  });

  it('should render agent name in role label when present', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Subagent response.',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
          agentName: 'code-review-agent',
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**Agent(code-review-agent):** Subagent response.');
    expect(md).not.toContain('**Agent:** Subagent response.');
  });

  it('should render plain Agent label when agent name absent', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Response.',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**Agent:** Response.');
    expect(md).not.toContain('**Agent():**');
  });

  it('should render skill annotation after role label line when skill name present', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Skill output.',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
          skillName: 'code-review',
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('> **Skill:** code-review');
    const roleLabelPos = md.indexOf('**Agent:**');
    const skillPos = md.indexOf('> **Skill:** code-review');
    expect(roleLabelPos).toBeGreaterThan(-1);
    expect(skillPos).toBeGreaterThan(roleLabelPos);
  });

  it('should not render skill annotation when skill name absent', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Plain response.',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).not.toContain('> **Skill:**');
  });

  it('should render timestamp on user turn when present', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'user',
          content: 'Hello.',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
          timestamp: '2026-03-15T09:00:00.000Z',
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**User:**');
    expect(md).toContain('2026-03-15');
    expect(md).toContain('09:00:00');
  });

  it('should render timestamp, agent name, and skill annotation when all three fields present', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Full metadata response.',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
          timestamp: '2026-03-15T10:30:00.000Z',
          agentName: 'analysis-agent',
          skillName: 'analysis',
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**Agent(analysis-agent):**');
    expect(md).toContain('2026-03-15');
    const roleLabelPos = md.indexOf('**Agent(analysis-agent):**');
    const skillPos = md.indexOf('> **Skill:** analysis');
    expect(roleLabelPos).toBeGreaterThan(-1);
    expect(skillPos).toBeGreaterThan(roleLabelPos);
  });

  it('should return raw string when format-timestamp receives an invalid date', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Response.',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
          timestamp: 'not-a-valid-date',
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('not-a-valid-date');
  });
});
