import { describe, it, expect } from 'vitest';
import { ClaudeCodeParser } from '../../../../../../src/features/agentSessionsArchiving/markdown/parsers/claudeCodeParser';
import type { ParseResult } from '../../../../../../src/features/agentSessionsArchiving/markdown/types';

function jsonl(...events: object[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n');
}

function expectParsed(result: ParseResult) {
  expect(result.status).toBe('parsed');
  if (result.status !== 'parsed') throw new Error('expected parsed');
  return result.session;
}

describe('ClaudeCodeParser — metadata fields', () => {
  const parser = new ClaudeCodeParser();

  it('should extract timestamp from user event when valid ISO 8601', () => {
    const content = jsonl({
      type: 'user',
      timestamp: '2026-03-15T10:30:00.000Z',
      message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.timestamp).toBe('2026-03-15T10:30:00.000Z');
  });

  it('should extract timestamp from assistant event when valid ISO 8601', () => {
    const content = jsonl({
      type: 'assistant',
      timestamp: '2026-03-15T10:31:00.000Z',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there.' }] },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.timestamp).toBe('2026-03-15T10:31:00.000Z');
  });

  it('should treat invalid timestamp as absent', () => {
    const content = jsonl({
      type: 'user',
      timestamp: 'not-a-date',
      message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.timestamp).toBeUndefined();
  });

  it('should leave timestamp undefined when event has no timestamp field', () => {
    const content = jsonl({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.timestamp).toBeUndefined();
  });

  it('should extract agentName from Agent tool_use block', () => {
    const content = jsonl({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'Agent',
            id: 'tool-agent-1',
            input: { subagent_type: 'code-review-agent' },
          },
        ],
      },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.agentName).toBe('code-review-agent');
  });

  it('should treat empty subagent_type as absent agentName', () => {
    const content = jsonl({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'Agent',
            id: 'tool-agent-2',
            input: { subagent_type: '   ' },
          },
        ],
      },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.agentName).toBeUndefined();
  });

  it('should normalize PascalCase subagent_type to kebab-case', () => {
    const content = jsonl({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'Agent',
            id: 'tool-agent-3',
            input: { subagent_type: 'CodeReview' },
          },
          { type: 'text', text: 'Done.' },
        ],
      },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.agentName).toBe('code-review');
  });

  it('should not set agentName for non-Agent tool_use blocks', () => {
    const content = jsonl({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', name: 'Read', id: 'tool-3', input: { file_path: 'a.ts' } },
          { type: 'text', text: 'Done.' },
        ],
      },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.agentName).toBeUndefined();
  });

  it('should extract skillName from Skill tool_use block', () => {
    const content = jsonl({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'Skill',
            id: 'tool-skill-1',
            input: { skill: 'code-review' },
          },
          { type: 'text', text: 'Skill complete.' },
        ],
      },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.skillName).toBe('code-review');
  });

  it('should normalize PascalCase skill name to kebab-case', () => {
    const content = jsonl({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'Skill',
            id: 'tool-skill-3',
            input: { skill: 'CodeReview' },
          },
          { type: 'text', text: 'Done.' },
        ],
      },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.skillName).toBe('code-review');
  });

  it('should treat empty skill field as absent skillName', () => {
    const content = jsonl({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'Skill',
            id: 'tool-skill-2',
            input: { skill: '' },
          },
          { type: 'text', text: 'Done.' },
        ],
      },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.skillName).toBeUndefined();
  });

  it('should populate all three metadata fields when all present in one assistant event', () => {
    const content = jsonl({
      type: 'assistant',
      timestamp: '2026-03-15T11:00:00.000Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'Agent',
            id: 'tool-a',
            input: { subagent_type: 'analysis-agent' },
          },
          {
            type: 'tool_use',
            name: 'Skill',
            id: 'tool-s',
            input: { skill: 'analysis' },
          },
          { type: 'text', text: 'Analysis complete.' },
        ],
      },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.timestamp).toBe('2026-03-15T11:00:00.000Z');
    expect(session.turns[0]!.agentName).toBe('analysis-agent');
    expect(session.turns[0]!.skillName).toBe('analysis');
  });

  it('should extract agentName from Agent tool_use in standalone tool_use event', () => {
    const content = jsonl(
      {
        type: 'tool_use',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Agent',
              id: 'tool-standalone-agent-1',
              input: { subagent_type: 'CodeReview' },
            },
          ],
        },
      },
      {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Agent done.' }] },
      }
    );

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.agentName).toBe('code-review');
  });

  it('should extract skillName from Skill tool_use in standalone tool_use event', () => {
    const content = jsonl(
      {
        type: 'tool_use',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Skill',
              id: 'tool-standalone-skill-1',
              input: { skill: 'DiagnosticProcess' },
            },
          ],
        },
      },
      {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Skill done.' }] },
      }
    );

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.skillName).toBe('diagnostic-process');
  });
});
