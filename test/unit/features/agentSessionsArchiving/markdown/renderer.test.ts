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

    expect(md).toContain('## Turn 1 (User)');
    expect(md).toContain('Hello, how are you?');
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

    expect(md).toContain('## Turn 1 (Assistant)');
    expect(md).toContain('Let me read that file.');
    expect(md).toContain('### Tools Called');
    expect(md).toContain('**Read**');
    expect(md).toContain('### Files Read');
    expect(md).toContain('`src/main.ts`');
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

    expect(md).not.toContain('### Tools Called');
    expect(md).not.toContain('### Files Read');
    expect(md).not.toContain('### Files Modified');
    expect(md).not.toContain('<details>');
  });

  it('should render multiple turns with sequential numbering', () => {
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

    expect(md).toContain('## Turn 1 (User)');
    expect(md).toContain('## Turn 2 (Assistant)');
    expect(md).toContain('## Turn 3 (User)');
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
    expect(md).not.toContain('## Turn');
  });
});
