import { describe, it, expect } from 'vitest';
import { renderSessionToMarkdown } from '../../../../../src/features/agentSessionsArchiving/markdown/renderer';
import type { NormalizedSession } from '../../../../../src/features/agentSessionsArchiving/markdown/types';

describe('renderSessionToMarkdown', () => {
  it('should render session header', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'abc123',
      turns: [],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('# Claude Code Session');
    expect(md).toContain('**Provider:** Claude Code');
    expect(md).toContain('**Session ID:** abc123');
  });

  it('should render user turn', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'user',
          content: 'Hello, how are you?',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**User:** Hello, how are you?');
    expect(md).not.toContain('## Turn');
  });

  it('should render assistant turn with tools', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Let me read that file.',
          toolCalls: [{ name: 'Read', input: 'file_path: src/main.ts' }],
          filesRead: ['src/main.ts'],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**Agent:** Let me read that file.');
    expect(md).toContain('### Tools Called');
    expect(md).toContain('**Read**');
    expect(md).toContain('### Files Read');
    expect(md).toContain('`src/main.ts`');
    expect(md).not.toContain('## Turn');
  });

  it('should render thinking in details block', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Done.',
          toolCalls: [],
          thinking: 'Let me think about this...',
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**Agent:** Done.');
    expect(md).toContain('<details>');
    expect(md).toContain('<summary>Reasoning</summary>');
    expect(md).toContain('Let me think about this...');
    expect(md).toContain('</details>');
  });

  it('should render files modified', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Updated.',
          toolCalls: [],
          filesRead: [],
          filesModified: ['src/foo.ts', 'src/bar.ts'],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**Agent:** Updated.');
    expect(md).toContain('### Files Modified');
    expect(md).toContain('`src/foo.ts`');
    expect(md).toContain('`src/bar.ts`');
  });

  it('should not render empty sections', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Just text.',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**Agent:** Just text.');
    expect(md).not.toContain('### Tools Called');
    expect(md).not.toContain('### Files Read');
    expect(md).not.toContain('### Files Modified');
    expect(md).not.toContain('<details>');
  });

  it('should render multiple turns with role prefixes', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'user',
          content: 'Question',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
        },
        {
          role: 'assistant',
          content: 'Answer',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
        },
        {
          role: 'user',
          content: 'Follow-up',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**User:** Question');
    expect(md).toContain('**Agent:** Answer');
    expect(md).toContain('**User:** Follow-up');
    expect(md).not.toContain('## Turn');
  });

  it('should skip empty assistant turns', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'user',
          content: 'Hello',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
        },
        {
          role: 'assistant',
          content: '',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
        },
        {
          role: 'assistant',
          content: 'Real response.',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    const assistantMatches = md.match(/\*\*Agent:\*\*/g) ?? [];
    expect(assistantMatches).toHaveLength(1);
    expect(md).toContain('**Agent:** Real response.');
  });

  it('should skip whitespace-only assistant turns', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: '\n\n',
          toolCalls: [],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).not.toContain('**Assistant:**');
  });

  it('should keep turn with only thinking', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [],
          thinking: 'Some reasoning...',
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**Agent:**');
    expect(md).toContain('Some reasoning...');
  });

  it('should render tool call output in details block', () => {
    const session: NormalizedSession = {
      providerName: 'copilot-chat',
      providerDisplayName: 'GitHub Copilot Chat',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Done.',
          toolCalls: [
            { name: 'run_in_terminal', input: 'ls -la', output: 'file1.ts\nfile2.ts' },
          ],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**run_in_terminal**');
    expect(md).toContain('ls -la');
    expect(md).toContain('<details>');
    expect(md).toContain('<summary>Output</summary>');
    expect(md).toContain('file1.ts');
    expect(md).toContain('file2.ts');
    expect(md).toContain('</details>');
  });

  it('should not render output section when output absent', () => {
    const session: NormalizedSession = {
      providerName: 'copilot-chat',
      providerDisplayName: 'GitHub Copilot Chat',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Done.',
          toolCalls: [{ name: 'copilot_findFiles', input: 'Searching files' }],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('**copilot_findFiles**');
    expect(md).toContain('Searching files');
    expect(md).not.toContain('<summary>Output</summary>');
  });

  it('should render empty session with just header', () => {
    const session: NormalizedSession = {
      providerName: 'test',
      providerDisplayName: 'Test',
      sessionId: 'empty',
      turns: [],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('# Test Session');
    expect(md).not.toContain('**User:**');
    expect(md).not.toContain('**Assistant:**');
  });

  // L-05 tests: CommonMark-safe code fences

  it('L-05: tool output containing triple backtick is wrapped in a 4-backtick fence', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Done.',
          toolCalls: [
            { name: 'Bash', input: 'ls', output: 'file1\n```\nfenced\n```\nfile2' },
          ],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    // The fence must be 4 backticks because the content contains ```
    expect(md).toContain('````');
    // The output content must still appear
    expect(md).toContain('fenced');
  });

  it('L-05: tool output containing 4-backtick run is wrapped in a 5-backtick fence', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Done.',
          toolCalls: [{ name: 'Bash', input: 'echo', output: 'start\n````\nend' }],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('`````');
  });

  it('L-05: plain text (no backticks) uses the minimum 3-backtick fence', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Done.',
          toolCalls: [{ name: 'Read', input: 'a.ts', output: 'plain content here' }],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    expect(md).toContain('```');
    // Must NOT contain a 4-backtick fence (no reason to expand)
    expect(md).not.toContain('````');
  });

  it('L-05: per-line indentation is preserved with expanded fence', () => {
    const session: NormalizedSession = {
      providerName: 'claude-code',
      providerDisplayName: 'Claude Code',
      sessionId: 'test',
      turns: [
        {
          role: 'assistant',
          content: 'Done.',
          toolCalls: [{ name: 'Bash', input: 'cmd', output: 'line1\n```\nline2' }],
          filesRead: [],
          filesModified: [],
        },
      ],
    };

    const md = renderSessionToMarkdown(session);

    // Each line of the code block content should be indented (2 spaces for output details)
    expect(md).toMatch(/ {2}line1/);
    expect(md).toMatch(/ {2}line2/);
  });
});

describe('renderSessionToMarkdown with malformed tool payloads', () => {
  function sessionWithToolCall(tool: unknown): NormalizedSession {
    return {
      providerName: 'copilot-chat',
      providerDisplayName: 'Copilot Chat',
      sessionId: 'malformed',
      turns: [
        {
          role: 'assistant',
          content: 'opening the pull request',
          toolCalls: [tool as NormalizedSession['turns'][number]['toolCalls'][number]],
          filesRead: [],
          filesModified: [],
        },
      ],
    };
  }

  it('should render a structured object tool output as JSON instead of throwing', () => {
    const md = renderSessionToMarkdown(
      sessionWithToolCall({
        name: 'create_pull_request',
        input: 'Creating pull request',
        output: { title: 'Add workstream', draft: false },
      })
    );

    expect(md).toContain('"title": "Add workstream"');
    expect(md).toContain('"draft": false');
  });

  it('should render an array tool output as JSON instead of throwing', () => {
    const md = renderSessionToMarkdown(
      sessionWithToolCall({
        name: 'shell',
        output: [{ type: 'input_text', text: 'hello' }],
      })
    );

    expect(md).toContain('"text": "hello"');
  });

  it('should render an unserializable tool output as a placeholder', () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;

    const md = renderSessionToMarkdown(
      sessionWithToolCall({ name: 'shell', output: circular })
    );

    expect(md).toContain('[unserializable tool payload]');
    expect(md).not.toContain('[object Object]');
  });

  it('should render a non-string tool input as JSON instead of throwing', () => {
    const md = renderSessionToMarkdown(
      sessionWithToolCall({ name: 'shell', input: { cmd: 'ls -la' } })
    );

    expect(md).toContain('"cmd": "ls -la"');
  });
});
