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
});
