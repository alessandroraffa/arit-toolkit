import { describe, it, expect } from 'vitest';
import { CopilotChatParser } from '../../../../../../src/features/agentSessionsArchiving/markdown/parsers/copilotChatParser';
import type { ParseResult } from '../../../../../../src/features/agentSessionsArchiving/markdown/types';

function expectParsed(result: ParseResult) {
  expect(result.status).toBe('parsed');
  if (result.status !== 'parsed') throw new Error('expected parsed');
  return result.session;
}

describe('CopilotChatParser', () => {
  const parser = new CopilotChatParser();

  it('should parse user and assistant turns from requests', () => {
    const content = JSON.stringify({
      requests: [
        {
          message: { text: 'How do I sort an array?' },
          response: [{ kind: 'markdownContent', value: 'Use Array.sort().' }],
        },
      ],
    });

    const session = expectParsed(parser.parse(content, 'chat-1'));

    expect(session.providerName).toBe('copilot-chat');
    expect(session.providerDisplayName).toBe('GitHub Copilot Chat');
    expect(session.turns).toHaveLength(2);
    expect(session.turns[0]!.role).toBe('user');
    expect(session.turns[0]!.content).toBe('How do I sort an array?');
    expect(session.turns[1]!.role).toBe('assistant');
    expect(session.turns[1]!.content).toBe('Use Array.sort().');
  });

  it('should parse tool invocations', () => {
    const content = JSON.stringify({
      requests: [
        {
          message: { text: 'Find test files' },
          response: [
            {
              kind: 'toolInvocationSerialized',
              toolName: 'copilot_findFiles',
              invocationMessage: { value: 'Searching for test files' },
              pastTenseMessage: { value: 'Found 3 test files' },
            },
            { kind: 'markdownContent', value: 'Found them.' },
          ],
        },
      ],
    });

    const session = expectParsed(parser.parse(content, 'chat-1'));

    const assistantTurn = session.turns[1]!;
    expect(assistantTurn.toolCalls).toHaveLength(1);
    expect(assistantTurn.toolCalls[0]!.name).toBe('copilot_findFiles');
    expect(assistantTurn.toolCalls[0]!.input).toBe('Searching for test files');
  });

  it('should parse thinking blocks', () => {
    const content = JSON.stringify({
      requests: [
        {
          message: { text: 'Explain this code' },
          response: [
            { kind: 'thinking', value: 'Analyzing the code...' },
            { kind: 'markdownContent', value: 'This code does X.' },
          ],
        },
      ],
    });

    const session = expectParsed(parser.parse(content, 'chat-1'));

    expect(session.turns[1]!.thinking).toBe('Analyzing the code...');
  });

  it('should handle message with parts instead of text', () => {
    const content = JSON.stringify({
      requests: [
        {
          message: {
            parts: [{ text: 'Part 1' }, { text: 'Part 2' }],
          },
          response: [],
        },
      ],
    });

    const session = expectParsed(parser.parse(content, 'chat-1'));

    expect(session.turns[0]!.content).toBe('Part 1\nPart 2');
  });

  it('should return unrecognized for malformed non-JSONL content', () => {
    const result = parser.parse('not json at all %%%', 'chat-1');
    expect(result.status).toBe('unrecognized');
  });

  it('should return unrecognized when no requests array', () => {
    const result = parser.parse('{}', 'chat-1');
    expect(result.status).toBe('unrecognized');
  });

  // --- Real-world Copilot Chat format (kind: null for text, prepareToolInvocation + toolInvocationSerialized for tools) ---

  it('handles null-kind response items as text content (current Copilot format)', () => {
    const content = JSON.stringify({
      requests: [
        {
          message: { text: 'Explain this' },
          response: [
            {
              value: 'Here is the explanation.',
              supportThemeIcons: false,
              supportHtml: false,
              baseUri: {},
            },
          ],
        },
      ],
    });

    const session = expectParsed(parser.parse(content, 'chat-2'));

    expect(session.turns).toHaveLength(2);
    expect(session.turns[1]!.content).toBe('Here is the explanation.');
  });

  it('handles prepareToolInvocation + toolInvocationSerialized pattern (current Copilot format)', () => {
    const content = JSON.stringify({
      requests: [
        {
          message: { text: 'Find test files' },
          response: [
            { kind: 'prepareToolInvocation', toolName: 'copilot_findFiles' },
            {
              kind: 'toolInvocationSerialized',
              invocationMessage: {
                value: 'Searching for test files',
                supportThemeIcons: false,
              },
              pastTenseMessage: { value: 'Found 3 test files', supportThemeIcons: false },
              toolId: 'copilot_findFiles',
              toolCallId: 'abc-123',
              isConfirmed: { type: 1 },
              isComplete: true,
            },
            { value: 'Done.' },
          ],
        },
      ],
    });

    const session = expectParsed(parser.parse(content, 'chat-2'));

    const assistant = session.turns[1]!;
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls[0]!.name).toBe('copilot_findFiles');
    expect(assistant.toolCalls[0]!.input).toBe('Searching for test files');
    expect(assistant.content).toBe('Done.');
  });

  it('handles string invocationMessage in toolInvocationSerialized', () => {
    const content = JSON.stringify({
      requests: [
        {
          message: { text: 'Replace something' },
          response: [
            { kind: 'prepareToolInvocation', toolName: 'copilot_multiReplaceString' },
            {
              kind: 'toolInvocationSerialized',
              invocationMessage: 'Using "Multi-Replace String in Files"',
              toolId: 'copilot_multiReplaceString',
              toolCallId: 'xyz-789',
              isConfirmed: { type: 1 },
              isComplete: true,
            },
          ],
        },
      ],
    });

    const session = expectParsed(parser.parse(content, 'chat-2'));

    const assistant = session.turns[1]!;
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls[0]!.name).toBe('copilot_multiReplaceString');
    expect(assistant.toolCalls[0]!.input).toBe('Using "Multi-Replace String in Files"');
  });

  it('uses toolId as fallback tool name when prepareToolInvocation is absent', () => {
    const content = JSON.stringify({
      requests: [
        {
          message: { text: 'Do something' },
          response: [
            {
              kind: 'toolInvocationSerialized',
              invocationMessage: { value: 'Running tool' },
              toolId: 'copilot_someOrphanTool',
              toolCallId: 'orphan-1',
              isComplete: true,
            },
          ],
        },
      ],
    });

    const session = expectParsed(parser.parse(content, 'chat-2'));

    const assistant = session.turns[1]!;
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls[0]!.name).toBe('copilot_someOrphanTool');
  });

  // --- JSONL (append-only delta) format support ---

  it('should parse JSONL content with initialize + append operations', () => {
    const lines = [
      JSON.stringify({
        kind: 0,
        v: { requests: [] },
      }),
      JSON.stringify({
        kind: 2,
        k: ['requests'],
        v: [
          {
            message: { text: 'How do I sort an array?' },
            response: [{ value: 'Use Array.sort().' }],
          },
        ],
      }),
    ].join('\n');

    const session = expectParsed(parser.parse(lines, 'chat-jsonl'));

    expect(session.providerName).toBe('copilot-chat');
    expect(session.turns).toHaveLength(2);
    expect(session.turns[0]!.role).toBe('user');
    expect(session.turns[0]!.content).toBe('How do I sort an array?');
    expect(session.turns[1]!.role).toBe('assistant');
    expect(session.turns[1]!.content).toBe('Use Array.sort().');
  });

  it('should parse JSONL with streamed response appends', () => {
    const lines = [
      JSON.stringify({
        kind: 0,
        v: {
          requests: [{ message: { text: 'Explain this' }, response: [] }],
        },
      }),
      JSON.stringify({
        kind: 2,
        k: ['requests', 0, 'response'],
        v: [{ kind: 'thinking', value: 'Let me think...' }],
      }),
      JSON.stringify({
        kind: 2,
        k: ['requests', 0, 'response'],
        v: [{ value: 'Here is the explanation.' }],
      }),
    ].join('\n');

    const session = expectParsed(parser.parse(lines, 'chat-jsonl'));

    expect(session.turns).toHaveLength(2);
    expect(session.turns[1]!.thinking).toBe('Let me think...');
    expect(session.turns[1]!.content).toBe('Here is the explanation.');
  });

  it('should parse JSONL with tool invocations', () => {
    const lines = [
      JSON.stringify({
        kind: 0,
        v: { requests: [] },
      }),
      JSON.stringify({
        kind: 2,
        k: ['requests'],
        v: [
          {
            message: { text: 'Find files' },
            response: [
              { kind: 'prepareToolInvocation', toolName: 'copilot_findFiles' },
              {
                kind: 'toolInvocationSerialized',
                invocationMessage: 'Searching...',
                toolId: 'copilot_findFiles',
                isComplete: true,
              },
              { value: 'Done.' },
            ],
          },
        ],
      }),
    ].join('\n');

    const session = expectParsed(parser.parse(lines, 'chat-jsonl'));

    expect(session.turns).toHaveLength(2);
    expect(session.turns[1]!.toolCalls).toHaveLength(1);
    expect(session.turns[1]!.toolCalls[0]!.name).toBe('copilot_findFiles');
    expect(session.turns[1]!.content).toBe('Done.');
  });

  // --- VS Code envelope format ({kind: 0, v: {...}}) support ---

  it('should parse an envelope-format session with kind 0 and v containing requests', () => {
    const content = JSON.stringify({
      kind: 0,
      v: {
        requests: [
          {
            message: { text: 'Hello' },
            response: [{ kind: 'markdownContent', value: 'Hi there.' }],
          },
        ],
      },
    });

    const session = expectParsed(parser.parse(content, 'envelope-1'));

    expect(session.turns).toHaveLength(2);
    expect(session.turns[0]!.role).toBe('user');
    expect(session.turns[0]!.content).toBe('Hello');
    expect(session.turns[1]!.role).toBe('assistant');
    expect(session.turns[1]!.content).toBe('Hi there.');
  });

  it('should parse an envelope-format session where v.requests is empty', () => {
    const content = JSON.stringify({ kind: 0, v: { requests: [] } });

    const result = parser.parse(content, 'envelope-empty');

    expect(result.status).toBe('parsed');
    if (result.status !== 'parsed') throw new Error('expected parsed');
    expect(result.session.turns).toHaveLength(0);
  });

  it('should parse an envelope-format session with multiple requests', () => {
    const content = JSON.stringify({
      kind: 0,
      v: {
        requests: [
          {
            message: { text: 'Q1' },
            response: [{ kind: 'markdownContent', value: 'A1' }],
          },
          {
            message: { text: 'Q2' },
            response: [{ kind: 'markdownContent', value: 'A2' }],
          },
        ],
      },
    });

    const session = expectParsed(parser.parse(content, 'envelope-multi'));

    expect(session.turns).toHaveLength(4);
    expect(session.turns[0]!.role).toBe('user');
    expect(session.turns[0]!.content).toBe('Q1');
    expect(session.turns[1]!.role).toBe('assistant');
    expect(session.turns[1]!.content).toBe('A1');
    expect(session.turns[2]!.role).toBe('user');
    expect(session.turns[2]!.content).toBe('Q2');
    expect(session.turns[3]!.role).toBe('assistant');
    expect(session.turns[3]!.content).toBe('A2');
  });

  it('should continue to parse direct-format sessions without envelope', () => {
    const content = JSON.stringify({
      requests: [
        {
          message: { text: 'How do I sort an array?' },
          response: [{ kind: 'markdownContent', value: 'Use Array.sort().' }],
        },
      ],
    });

    const session = expectParsed(parser.parse(content, 'direct-format'));

    expect(session.turns).toHaveLength(2);
    expect(session.turns[0]!.role).toBe('user');
    expect(session.turns[0]!.content).toBe('How do I sort an array?');
    expect(session.turns[1]!.role).toBe('assistant');
    expect(session.turns[1]!.content).toBe('Use Array.sort().');
  });
});
