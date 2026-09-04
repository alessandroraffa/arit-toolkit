import { describe, it, expect } from 'vitest';
import { renderSessionToMarkdown } from '../../../../../src/features/agentSessionsArchiving/markdown/renderer';
import type {
  NormalizedSession,
  NormalizedTurn,
} from '../../../../../src/features/agentSessionsArchiving/markdown/types';

describe('renderSessionToMarkdown with very large sessions', () => {
  function manyTurns(count: number): NormalizedTurn[] {
    return Array.from({ length: count }, (_, i) => ({
      role: 'assistant' as const,
      content: `subagent line ${String(i)}`,
      toolCalls: [],
      filesRead: [],
      filesModified: [],
    }));
  }

  it('should render subagent output larger than the argument-spread limit', () => {
    // Every turn renders to a handful of lines, so 40k turns push the aggregated
    // subagent array past V8's ~125k argument ceiling for `push(...array)`.
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'huge',
      turns: [],
      subagentSessions: [
        { agentId: 'a1', agentType: 'explore', turns: manyTurns(40000) },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('subagent line 39999');
  });

  it('should render a turn with more tool lines than the argument-spread limit', () => {
    // Each tool call with an output renders ~10 lines, so 20k calls push the
    // aggregated tool section past the same ceiling one level further down.
    const toolCalls = Array.from({ length: 20000 }, (_, i) => ({
      name: `tool_${String(i)}`,
      output: 'ok',
    }));
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'huge-tools',
      turns: [
        {
          role: 'assistant',
          content: 'done',
          toolCalls,
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('tool_19999');
  });
});
