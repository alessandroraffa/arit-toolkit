import { describe, it, expect } from 'vitest';
import { ClineRooCodeParser } from '../../../../../../src/features/agentSessionsArchiving/markdown/parsers/clineRooCodeParser';

describe('ClineRooCodeParser', () => {
  const parser = new ClineRooCodeParser('cline', 'Cline');

  it('should parse user and assistant messages', () => {
    const content = JSON.stringify([
      { role: 'user', content: [{ type: 'text', text: 'Fix the bug' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'I will fix it.' }] },
    ]);

    const result = parser.parse(content, 'task-1');

    expect(result.providerName).toBe('cline');
    expect(result.providerDisplayName).toBe('Cline');
    expect(result.turns).toHaveLength(2);
    expect(result.turns[0]!.role).toBe('user');
    expect(result.turns[0]!.content).toBe('Fix the bug');
    expect(result.turns[1]!.role).toBe('assistant');
    expect(result.turns[1]!.content).toBe('I will fix it.');
  });

  it('should parse tool_use blocks', () => {
    const content = JSON.stringify([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'read_file',
            input: { path: 'src/app.ts' },
          },
        ],
      },
    ]);

    const result = parser.parse(content, 'task-1');

    expect(result.turns[0]!.toolCalls).toHaveLength(1);
    expect(result.turns[0]!.toolCalls[0]!.name).toBe('read_file');
    expect(result.turns[0]!.filesRead).toContain('src/app.ts');
  });

  it('should extract write_to_file as files modified', () => {
    const content = JSON.stringify([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'write_to_file',
            input: { path: 'src/new.ts' },
          },
        ],
      },
    ]);

    const result = parser.parse(content, 'task-1');

    expect(result.turns[0]!.filesModified).toContain('src/new.ts');
  });

  it('should handle string content', () => {
    const content = JSON.stringify([{ role: 'user', content: 'Simple text message' }]);

    const result = parser.parse(content, 'task-1');

    expect(result.turns[0]!.content).toBe('Simple text message');
  });

  it('should return empty session for malformed JSON', () => {
    const result = parser.parse('not json', 'task-1');
    expect(result.turns).toHaveLength(0);
  });

  it('should return empty session for non-array JSON', () => {
    const result = parser.parse('{"not": "array"}', 'task-1');
    expect(result.turns).toHaveLength(0);
  });

  it('should work for Roo Code provider name', () => {
    const rooParser = new ClineRooCodeParser('roo-code', 'Roo Code');
    const content = JSON.stringify([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]);

    const result = rooParser.parse(content, 'task-1');

    expect(result.providerName).toBe('roo-code');
    expect(result.providerDisplayName).toBe('Roo Code');
  });
});
