import { describe, it, expect } from 'vitest';
import { CopilotChatParser } from '../../../../../../src/features/agentSessionsArchiving/markdown/parsers/copilotChatParser';
import type { ParseResult } from '../../../../../../src/features/agentSessionsArchiving/markdown/types';

function expectParsed(result: ParseResult) {
  expect(result.status).toBe('parsed');
  if (result.status !== 'parsed') throw new Error('expected parsed');
  return result.session;
}

describe('CopilotChatParser toolSpecificData', () => {
  const parser = new CopilotChatParser();

  it('extracts command line and output from terminal toolSpecificData', () => {
    const content = JSON.stringify({
      requests: [
        {
          message: { text: 'Run ls' },
          response: [
            { kind: 'prepareToolInvocation', toolName: 'run_in_terminal' },
            {
              kind: 'toolInvocationSerialized',
              invocationMessage: '',
              toolId: 'run_in_terminal',
              toolCallId: 'tc-1',
              isComplete: true,
              toolSpecificData: {
                kind: 'terminal',
                commandLine: { original: 'ls -la src/' },
                cwd: { path: '/workspace/project' },
                terminalCommandOutput: { text: 'file1.ts\r\nfile2.ts' },
                terminalCommandState: { exitCode: 0 },
              },
            },
          ],
        },
      ],
    });

    const session = expectParsed(parser.parse(content, 'chat-tsd'));
    const assistant = session.turns[1]!;
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls[0]!.name).toBe('run_in_terminal');
    expect(assistant.toolCalls[0]!.input).toBe('ls -la src/');
    expect(assistant.toolCalls[0]!.output).toBe('file1.ts\r\nfile2.ts');
  });

  it('extracts rawInput from MCP tool toolSpecificData', () => {
    const content = JSON.stringify({
      requests: [
        {
          message: { text: 'Navigate to page' },
          response: [
            {
              kind: 'prepareToolInvocation',
              toolName: 'mcp_playwright_browser_navigate',
            },
            {
              kind: 'toolInvocationSerialized',
              invocationMessage: { value: 'Running Navigate to a URL' },
              toolId: 'mcp_playwright_browser_navigate',
              toolCallId: 'tc-2',
              isComplete: true,
              toolSpecificData: {
                kind: 'input',
                rawInput: '{"url":"http://localhost:3000"}',
              },
            },
          ],
        },
      ],
    });

    const session = expectParsed(parser.parse(content, 'chat-mcp'));
    const assistant = session.turns[1]!;
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls[0]!.name).toBe('mcp_playwright_browser_navigate');
    expect(assistant.toolCalls[0]!.input).toBe('Running Navigate to a URL');
    expect(assistant.toolCalls[0]!.output).toBe('{"url":"http://localhost:3000"}');
  });

  it('extracts prompt from subagent toolSpecificData', () => {
    const content = JSON.stringify({
      requests: [
        {
          message: { text: 'Research something' },
          response: [
            { kind: 'prepareToolInvocation', toolName: 'runSubagent' },
            {
              kind: 'toolInvocationSerialized',
              invocationMessage: 'Check codebase',
              toolId: 'runSubagent',
              toolCallId: 'tc-3',
              isComplete: true,
              toolSpecificData: {
                kind: 'subagent',
                description: 'Check codebase',
                prompt: 'Search for all usages of function X',
                modelName: 'claude-sonnet',
              },
            },
          ],
        },
      ],
    });

    const session = expectParsed(parser.parse(content, 'chat-sub'));
    const assistant = session.turns[1]!;
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls[0]!.name).toBe('runSubagent');
    expect(assistant.toolCalls[0]!.input).toBe('Check codebase');
    expect(assistant.toolCalls[0]!.output).toBe('Search for all usages of function X');
  });

  it('prefers invocationMessage over toolSpecificData when both present', () => {
    const content = JSON.stringify({
      requests: [
        {
          message: { text: 'Find files' },
          response: [
            {
              kind: 'toolInvocationSerialized',
              invocationMessage: { value: 'Searching for test files' },
              toolId: 'copilot_findFiles',
              isComplete: true,
              toolSpecificData: { kind: 'input', rawInput: '{"pattern":"*.test.ts"}' },
            },
          ],
        },
      ],
    });

    const session = expectParsed(parser.parse(content, 'chat-pref'));
    const assistant = session.turns[1]!;
    expect(assistant.toolCalls[0]!.input).toBe('Searching for test files');
    expect(assistant.toolCalls[0]!.output).toBe('{"pattern":"*.test.ts"}');
  });

  it('falls back to toolSpecificData when invocationMessage empty', () => {
    const content = JSON.stringify({
      requests: [
        {
          message: { text: 'Run command' },
          response: [
            {
              kind: 'toolInvocationSerialized',
              invocationMessage: '',
              toolId: 'run_in_terminal',
              isComplete: true,
              toolSpecificData: {
                kind: 'terminal',
                commandLine: { original: 'npm test' },
                terminalCommandOutput: { text: 'all tests passed' },
                terminalCommandState: { exitCode: 0 },
              },
            },
          ],
        },
      ],
    });

    const session = expectParsed(parser.parse(content, 'chat-fb'));
    const assistant = session.turns[1]!;
    expect(assistant.toolCalls[0]!.input).toBe('npm test');
    expect(assistant.toolCalls[0]!.output).toBe('all tests passed');
  });
});
