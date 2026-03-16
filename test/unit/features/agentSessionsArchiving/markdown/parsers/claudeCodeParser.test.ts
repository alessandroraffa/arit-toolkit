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

describe('ClaudeCodeParser', () => {
  const parser = new ClaudeCodeParser();

  it('should parse user message', () => {
    const content = jsonl({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Hello world' }],
      },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.providerName).toBe('claude-code');
    expect(session.providerDisplayName).toBe('Claude Code');
    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.role).toBe('user');
    expect(session.turns[0]!.content).toBe('Hello world');
  });

  it('should parse assistant message with text', () => {
    const content = jsonl({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'I can help with that.' }],
      },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.role).toBe('assistant');
    expect(session.turns[0]!.content).toBe('I can help with that.');
  });

  it('should parse assistant message with thinking', () => {
    const content = jsonl({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Let me consider...' },
          { type: 'text', text: 'Here is my answer.' },
        ],
      },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.thinking).toBe('Let me consider...');
    expect(session.turns[0]!.content).toBe('Here is my answer.');
  });

  it('should parse tool_use events', () => {
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
              input: { file_path: 'src/main.ts' },
            },
          ],
        },
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Done reading.' }],
        },
      }
    );

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.toolCalls).toHaveLength(1);
    expect(session.turns[0]!.toolCalls[0]!.name).toBe('Read');
    expect(session.turns[0]!.filesRead).toContain('src/main.ts');
  });

  it('should extract file refs for Edit and Write tools', () => {
    const content = jsonl(
      {
        type: 'tool_use',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Edit',
              id: 'tool-1',
              input: { file_path: 'src/foo.ts' },
            },
          ],
        },
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Edited.' }],
        },
      }
    );

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.filesModified).toContain('src/foo.ts');
  });

  it('should return unrecognized for empty content', () => {
    const result = parser.parse('', 'session-1');
    expect(result.status).toBe('unrecognized');
  });

  it('should skip malformed JSON lines after valid first line', () => {
    const content =
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      }) + '\nnot json';

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.content).toBe('Hello');
  });

  it('should return unrecognized when first line is not valid JSONL', () => {
    const content =
      'not json\n' +
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      });

    const result = parser.parse(content, 'session-1');
    expect(result.status).toBe('unrecognized');
  });

  it('should skip unknown event types', () => {
    const content = jsonl(
      { type: 'queue-operation', operation: 'dequeue' },
      { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Hi' }] } }
    );

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns).toHaveLength(1);
  });

  it('should process tool_result events and attach output to tool calls', () => {
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
            { type: 'tool_result', tool_use_id: 'tool-1', content: 'file contents here' },
          ],
        },
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'I read the file.' }],
        },
      }
    );

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.toolCalls[0]!.output).toBe('file contents here');
  });

  it('should flush pending tool calls when session ends without assistant event', () => {
    const content = jsonl({
      type: 'tool_use',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', name: 'Bash', id: 'tool-2', input: { command: 'ls' } },
        ],
      },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.role).toBe('assistant');
    expect(session.turns[0]!.toolCalls).toHaveLength(1);
    expect(session.turns[0]!.toolCalls[0]!.name).toBe('Bash');
  });

  it('should handle user message with string content', () => {
    const content = jsonl({
      type: 'user',
      message: { role: 'user', content: 'plain string content' },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.content).toBe('plain string content');
  });

  it('should concatenate multiple thinking blocks', () => {
    const content = jsonl({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'First thought.' },
          { type: 'thinking', thinking: 'Second thought.' },
          { type: 'text', text: 'Answer.' },
        ],
      },
    });

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.thinking).toBe('First thought.\n\nSecond thought.');
  });

  it('should extract file refs for Write tool', () => {
    const content = jsonl(
      {
        type: 'tool_use',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              id: 'tool-1',
              input: { file_path: 'new.ts' },
            },
          ],
        },
      },
      {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
      }
    );

    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.filesModified).toContain('new.ts');
  });
});
