import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, FileType } from '../../../mocks/vscode';
import { ClaudeCodeProvider } from '../../../../../src/features/agentSessionsArchiving/providers/claudeCodeProvider';

describe('ClaudeCodeProvider', () => {
  let provider: ClaudeCodeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ClaudeCodeProvider();
  });

  it('should have correct name and displayName', () => {
    expect(provider.name).toBe('claude-code');
    expect(provider.displayName).toBe('Claude Code');
  });

  it('should find session files in project directory', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['session1.jsonl', FileType.File],
      ['session2.jsonl', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1000 });

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.archiveName).toBe('claude-code-session1');
    expect(sessions[0]!.extension).toBe('.jsonl');
    expect(sessions[1]!.archiveName).toBe('claude-code-session2');
  });

  it('should return empty array when project directory does not exist', async () => {
    workspace.fs.readDirectory = vi.fn().mockRejectedValue(new Error('not found'));

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(0);
  });

  it('should skip directories', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['subdir', FileType.Directory],
      ['session.jsonl', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 500 });

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('claude-code-session');
  });

  it('should skip files that fail stat', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['session1.jsonl', FileType.File],
      ['session2.jsonl', FileType.File],
    ]);
    workspace.fs.stat = vi
      .fn()
      .mockResolvedValueOnce({ mtime: 1000 })
      .mockRejectedValueOnce(new Error('permission denied'));

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('claude-code-session1');
  });

  it('should convert workspace path to project dir name', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);

    await provider.findSessions('/Users/dev/my-project');

    const readDirCall = vi.mocked(workspace.fs.readDirectory).mock.calls[0]!;
    expect(readDirCall[0].fsPath).toContain('-Users-dev-my-project');
  });

  it('should set correct displayName', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValue([['abc123.jsonl', FileType.File]]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 100 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions[0]!.displayName).toBe('Claude Code abc123.jsonl');
  });
});
