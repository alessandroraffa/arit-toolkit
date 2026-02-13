import { describe, it, expect } from 'vitest';
import { ContinueParser } from '../../../../../../src/features/agentSessionsArchiving/markdown/parsers/continueParser';

describe('ContinueParser', () => {
  const parser = new ContinueParser();

  it('should parse history messages', () => {
    const content = JSON.stringify({
      history: [
        { role: 'user', content: 'What is TypeScript?' },
        { role: 'assistant', content: 'TypeScript is a typed JavaScript.' },
      ],
    });

    const result = parser.parse(content, 'session-1');

    expect(result.providerName).toBe('continue');
    expect(result.providerDisplayName).toBe('Continue');
    expect(result.turns).toHaveLength(2);
    expect(result.turns[0]!.role).toBe('user');
    expect(result.turns[0]!.content).toBe('What is TypeScript?');
    expect(result.turns[1]!.role).toBe('assistant');
  });

  it('should extract context files for first user message', () => {
    const content = JSON.stringify({
      history: [{ role: 'user', content: 'Explain this' }],
      context: [
        { name: 'src/main.ts', uri: { value: 'file:///src/main.ts' } },
        { name: 'src/utils.ts' },
      ],
    });

    const result = parser.parse(content, 'session-1');

    expect(result.turns[0]!.filesRead).toEqual(['file:///src/main.ts', 'src/utils.ts']);
  });

  it('should attach steps as tool calls to first assistant message', () => {
    const content = JSON.stringify({
      history: [
        { role: 'user', content: 'Do something' },
        { role: 'assistant', content: 'Done.' },
      ],
      steps: [{ name: 'runCommand', params: { cmd: 'ls' }, output: 'file1.ts' }],
    });

    const result = parser.parse(content, 'session-1');

    const assistantTurn = result.turns[1]!;
    expect(assistantTurn.toolCalls).toHaveLength(1);
    expect(assistantTurn.toolCalls[0]!.name).toBe('runCommand');
    expect(assistantTurn.toolCalls[0]!.output).toBe('file1.ts');
  });

  it('should return empty session for malformed JSON', () => {
    const result = parser.parse('not json', 'session-1');
    expect(result.turns).toHaveLength(0);
  });

  it('should handle missing history', () => {
    const result = parser.parse('{}', 'session-1');
    expect(result.turns).toHaveLength(0);
  });
});
