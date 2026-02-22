import { describe, it, expect } from 'vitest';
import { CopilotChatParser } from '../../../../../../src/features/agentSessionsArchiving/markdown/parsers/copilotChatParser';

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

    const result = parser.parse(content, 'chat-1');

    expect(result.providerName).toBe('copilot-chat');
    expect(result.providerDisplayName).toBe('GitHub Copilot Chat');
    expect(result.turns).toHaveLength(2);
    expect(result.turns[0]!.role).toBe('user');
    expect(result.turns[0]!.content).toBe('How do I sort an array?');
    expect(result.turns[1]!.role).toBe('assistant');
    expect(result.turns[1]!.content).toBe('Use Array.sort().');
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

    const result = parser.parse(content, 'chat-1');

    const assistantTurn = result.turns[1]!;
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

    const result = parser.parse(content, 'chat-1');

    expect(result.turns[1]!.thinking).toBe('Analyzing the code...');
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

    const result = parser.parse(content, 'chat-1');

    expect(result.turns[0]!.content).toBe('Part 1\nPart 2');
  });

  it('should return empty session for malformed JSON', () => {
    const result = parser.parse('not json', 'chat-1');
    expect(result.turns).toHaveLength(0);
  });

  it('should return empty session when no requests array', () => {
    const result = parser.parse('{}', 'chat-1');
    expect(result.turns).toHaveLength(0);
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

    const result = parser.parse(content, 'chat-2');

    expect(result.turns).toHaveLength(2);
    expect(result.turns[1]!.content).toBe('Here is the explanation.');
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

    const result = parser.parse(content, 'chat-2');

    const assistant = result.turns[1]!;
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

    const result = parser.parse(content, 'chat-2');

    const assistant = result.turns[1]!;
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

    const result = parser.parse(content, 'chat-2');

    const assistant = result.turns[1]!;
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

    const result = parser.parse(lines, 'chat-jsonl');

    expect(result.providerName).toBe('copilot-chat');
    expect(result.turns).toHaveLength(2);
    expect(result.turns[0]!.role).toBe('user');
    expect(result.turns[0]!.content).toBe('How do I sort an array?');
    expect(result.turns[1]!.role).toBe('assistant');
    expect(result.turns[1]!.content).toBe('Use Array.sort().');
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

    const result = parser.parse(lines, 'chat-jsonl');

    expect(result.turns).toHaveLength(2);
    expect(result.turns[1]!.thinking).toBe('Let me think...');
    expect(result.turns[1]!.content).toBe('Here is the explanation.');
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

    const result = parser.parse(lines, 'chat-jsonl');

    expect(result.turns).toHaveLength(2);
    expect(result.turns[1]!.toolCalls).toHaveLength(1);
    expect(result.turns[1]!.toolCalls[0]!.name).toBe('copilot_findFiles');
    expect(result.turns[1]!.content).toBe('Done.');
  });
});
