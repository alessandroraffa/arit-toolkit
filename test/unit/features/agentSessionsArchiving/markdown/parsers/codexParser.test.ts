import { describe, it, expect } from 'vitest';
import { CodexParser } from '../../../../../../src/features/agentSessionsArchiving/markdown/parsers/codexParser';
import type { ParseResult } from '../../../../../../src/features/agentSessionsArchiving/markdown/types';

function jsonl(...events: object[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n');
}

function expectParsed(result: ParseResult) {
  expect(result.status).toBe('parsed');
  if (result.status !== 'parsed') throw new Error('expected parsed');
  return result.session;
}

const SESSION_META = {
  type: 'session_meta',
  payload: { id: 'test-session-1', cwd: '/workspace' },
};

const TASK_STARTED = {
  type: 'event_msg',
  payload: { type: 'task_started', turn_id: 'turn-1' },
};

const TASK_COMPLETE = {
  type: 'event_msg',
  payload: { type: 'task_complete', turn_id: 'turn-1' },
};

function userMessage(message: string) {
  return { type: 'event_msg', payload: { type: 'user_message', message, kind: 'plain' } };
}

function assistantMessage(text: string, phase = 'commentary') {
  return {
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text }],
      phase,
    },
  };
}

function reasoning(summaryText: string) {
  return {
    type: 'response_item',
    payload: {
      type: 'reasoning',
      summary: [{ type: 'summary_text', text: summaryText }],
      content: null,
    },
  };
}

function functionCall(name: string, args: object, callId: string) {
  return {
    type: 'response_item',
    payload: {
      type: 'function_call',
      name,
      arguments: JSON.stringify(args),
      call_id: callId,
    },
  };
}

function functionCallOutput(callId: string, output: string) {
  return {
    type: 'response_item',
    payload: { type: 'function_call_output', call_id: callId, output },
  };
}

function customToolCall(name: string, input: string, callId: string) {
  return {
    type: 'response_item',
    payload: {
      type: 'custom_tool_call',
      name,
      input,
      call_id: callId,
      status: 'completed',
    },
  };
}

function customToolCallOutput(callId: string, output: string) {
  return {
    type: 'response_item',
    payload: { type: 'custom_tool_call_output', call_id: callId, output },
  };
}

const EXEC_OUTPUT_HEADER =
  'Chunk ID: abc\nWall time: 0.1 seconds\nProcess exited with code 0\nOriginal token count: 10\nOutput:\n';

describe('CodexParser', () => {
  const parser = new CodexParser();

  it('should have providerName codex', () => {
    expect(parser.providerName).toBe('codex');
  });

  it('should return unrecognized for empty content', () => {
    const result = parser.parse('', 'session-1');
    expect(result.status).toBe('unrecognized');
  });

  it('should return unrecognized when first line is not session_meta', () => {
    const content = jsonl({
      type: 'event_msg',
      payload: { type: 'user_message', message: 'hi' },
    });
    const result = parser.parse(content, 'session-1');
    expect(result.status).toBe('unrecognized');
  });

  it('should parse session metadata', () => {
    const content = jsonl(
      SESSION_META,
      TASK_STARTED,
      userMessage('hello'),
      TASK_COMPLETE
    );
    const session = expectParsed(parser.parse(content, 'test-session-1'));

    expect(session.providerName).toBe('codex');
    expect(session.providerDisplayName).toBe('OpenAI Codex');
    expect(session.sessionId).toBe('test-session-1');
  });

  it('should extract user message from event_msg:user_message', () => {
    const content = jsonl(
      SESSION_META,
      TASK_STARTED,
      userMessage('Fix the bug in auth.ts'),
      TASK_COMPLETE
    );
    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.role).toBe('user');
    expect(session.turns[0]!.content).toBe('Fix the bug in auth.ts');
  });

  it('should strip IDE context from user message', () => {
    const message =
      '# Context from my IDE setup:\n\n## Active file: foo.ts\n\n## My request for Codex:\nRefactor this function';
    const content = jsonl(
      SESSION_META,
      TASK_STARTED,
      userMessage(message),
      TASK_COMPLETE
    );
    const session = expectParsed(parser.parse(content, 'session-1'));

    expect(session.turns[0]!.content).toBe('Refactor this function');
  });

  it('should extract assistant text from response_item:message role=assistant', () => {
    const content = jsonl(
      SESSION_META,
      TASK_STARTED,
      userMessage('hi'),
      assistantMessage('Done.'),
      TASK_COMPLETE
    );
    const session = expectParsed(parser.parse(content, 'session-1'));

    const assistantTurn = session.turns.find((t) => t.role === 'assistant');
    expect(assistantTurn?.content).toBe('Done.');
  });

  it('should concatenate multiple assistant messages', () => {
    const content = jsonl(
      SESSION_META,
      TASK_STARTED,
      userMessage('hi'),
      assistantMessage('Part one.'),
      assistantMessage('Part two.'),
      TASK_COMPLETE
    );
    const session = expectParsed(parser.parse(content, 'session-1'));

    const assistantTurn = session.turns.find((t) => t.role === 'assistant');
    expect(assistantTurn?.content).toBe('Part one.\n\nPart two.');
  });

  it('should extract reasoning from response_item:reasoning', () => {
    const content = jsonl(
      SESSION_META,
      TASK_STARTED,
      userMessage('hi'),
      reasoning('Planning the approach'),
      assistantMessage('Done.'),
      TASK_COMPLETE
    );
    const session = expectParsed(parser.parse(content, 'session-1'));

    const assistantTurn = session.turns.find((t) => t.role === 'assistant');
    expect(assistantTurn?.thinking).toBe('Planning the approach');
  });

  it('should extract reasoning from event_msg:agent_reasoning', () => {
    const content = jsonl(
      SESSION_META,
      TASK_STARTED,
      userMessage('hi'),
      { type: 'event_msg', payload: { type: 'agent_reasoning', text: 'Thinking hard' } },
      assistantMessage('Done.'),
      TASK_COMPLETE
    );
    const session = expectParsed(parser.parse(content, 'session-1'));

    const assistantTurn = session.turns.find((t) => t.role === 'assistant');
    expect(assistantTurn?.thinking).toBe('Thinking hard');
  });

  it('should extract exec_command tool call with cmd as input', () => {
    const content = jsonl(
      SESSION_META,
      TASK_STARTED,
      userMessage('check status'),
      functionCall(
        'exec_command',
        { cmd: 'git status', workdir: '/workspace' },
        'call-1'
      ),
      functionCallOutput('call-1', EXEC_OUTPUT_HEADER + 'On branch main'),
      assistantMessage('Done.'),
      TASK_COMPLETE
    );
    const session = expectParsed(parser.parse(content, 'session-1'));

    const assistantTurn = session.turns.find((t) => t.role === 'assistant');
    expect(assistantTurn?.toolCalls).toHaveLength(1);
    expect(assistantTurn?.toolCalls[0]!.name).toBe('exec_command');
    expect(assistantTurn?.toolCalls[0]!.input).toBe('git status');
    expect(assistantTurn?.toolCalls[0]!.output).toBe('On branch main');
  });

  it('should strip exec_command output header', () => {
    const content = jsonl(
      SESSION_META,
      TASK_STARTED,
      userMessage('ls'),
      functionCall('exec_command', { cmd: 'ls -la', workdir: '/workspace' }, 'call-1'),
      functionCallOutput('call-1', EXEC_OUTPUT_HEADER + 'file1.ts\nfile2.ts'),
      assistantMessage('Listed.'),
      TASK_COMPLETE
    );
    const session = expectParsed(parser.parse(content, 'session-1'));

    const tool = session.turns.find((t) => t.role === 'assistant')?.toolCalls[0];
    expect(tool?.output).toBe('file1.ts\nfile2.ts');
  });

  it('should extract apply_patch custom tool call', () => {
    const patch = '*** Begin Patch\n*** Update File: src/foo.ts\n@@\n-old\n+new';
    const patchOutput = JSON.stringify({
      output: 'Success. Updated the following files:\nM src/foo.ts\n',
      metadata: { exit_code: 0 },
    });
    const content = jsonl(
      SESSION_META,
      TASK_STARTED,
      userMessage('fix'),
      customToolCall('apply_patch', patch, 'call-p1'),
      customToolCallOutput('call-p1', patchOutput),
      assistantMessage('Fixed.'),
      TASK_COMPLETE
    );
    const session = expectParsed(parser.parse(content, 'session-1'));

    const assistantTurn = session.turns.find((t) => t.role === 'assistant');
    expect(assistantTurn?.toolCalls[0]!.name).toBe('apply_patch');
    expect(assistantTurn?.toolCalls[0]!.input).toBe(patch);
    expect(assistantTurn?.filesModified).toContain('src/foo.ts');
  });

  it('should extract multiple modified files from apply_patch output', () => {
    const patchOutput = JSON.stringify({
      output:
        'Success. Updated the following files:\nM src/a.ts\nM src/b.ts\nA src/c.ts\n',
      metadata: { exit_code: 0 },
    });
    const content = jsonl(
      SESSION_META,
      TASK_STARTED,
      userMessage('fix'),
      customToolCall('apply_patch', '*** patch', 'call-p2'),
      customToolCallOutput('call-p2', patchOutput),
      assistantMessage('Done.'),
      TASK_COMPLETE
    );
    const session = expectParsed(parser.parse(content, 'session-1'));

    const assistantTurn = session.turns.find((t) => t.role === 'assistant');
    expect(assistantTurn?.filesModified).toContain('src/a.ts');
    expect(assistantTurn?.filesModified).toContain('src/b.ts');
    expect(assistantTurn?.filesModified).toContain('src/c.ts');
  });

  it('should skip developer and user-role response_item messages', () => {
    const content = jsonl(
      SESSION_META,
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'developer',
          content: [{ type: 'input_text', text: 'system context' }],
        },
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'AGENTS.md instructions' }],
        },
      },
      TASK_STARTED,
      userMessage('actual request'),
      assistantMessage('Response.'),
      TASK_COMPLETE
    );
    const session = expectParsed(parser.parse(content, 'session-1'));

    const userTurn = session.turns.find((t) => t.role === 'user');
    expect(userTurn?.content).toBe('actual request');
  });

  it('should skip malformed JSON lines', () => {
    const content =
      JSON.stringify(SESSION_META) +
      '\nnot json\n' +
      JSON.stringify(TASK_STARTED) +
      '\n' +
      JSON.stringify(userMessage('hello')) +
      '\n' +
      JSON.stringify(assistantMessage('Hi.')) +
      '\n' +
      JSON.stringify(TASK_COMPLETE);

    const session = expectParsed(parser.parse(content, 'session-1'));
    expect(session.turns.find((t) => t.role === 'user')?.content).toBe('hello');
  });

  it('should produce empty turns array for session with only metadata', () => {
    const content = jsonl(SESSION_META, TASK_STARTED, TASK_COMPLETE);
    const session = expectParsed(parser.parse(content, 'session-1'));
    expect(session.turns).toHaveLength(0);
  });

  it('should match tool calls with outputs by call_id', () => {
    const content = jsonl(
      SESSION_META,
      TASK_STARTED,
      userMessage('check'),
      functionCall('exec_command', { cmd: 'cmd-A' }, 'id-A'),
      functionCall('exec_command', { cmd: 'cmd-B' }, 'id-B'),
      functionCallOutput('id-B', EXEC_OUTPUT_HEADER + 'output-B'),
      functionCallOutput('id-A', EXEC_OUTPUT_HEADER + 'output-A'),
      assistantMessage('Done.'),
      TASK_COMPLETE
    );
    const session = expectParsed(parser.parse(content, 'session-1'));

    const tools = session.turns.find((t) => t.role === 'assistant')?.toolCalls ?? [];
    const callA = tools.find((t) => t.input === 'cmd-A');
    const callB = tools.find((t) => t.input === 'cmd-B');
    expect(callA?.output).toBe('output-A');
    expect(callB?.output).toBe('output-B');
  });
});
