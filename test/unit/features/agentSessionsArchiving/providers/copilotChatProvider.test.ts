import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, Uri, FileType } from '../../../mocks/vscode';
import { CopilotChatProvider } from '../../../../../src/features/agentSessionsArchiving/providers/copilotChatProvider';

describe('CopilotChatProvider', () => {
  const workspaceStorageBase = Uri.file('/workspace/storage');
  let provider: CopilotChatProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CopilotChatProvider(workspaceStorageBase as any);
  });

  it('should have correct name and displayName', () => {
    expect(provider.name).toBe('copilot-chat');
    expect(provider.displayName).toBe('GitHub Copilot Chat');
  });

  it('should find chat session files', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['3b809804.json', FileType.File],
      ['a1b2c3d4.json', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1500 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.archiveName).toBe('copilot-chat-3b809804');
    expect(sessions[0]!.extension).toBe('.json');
    expect(sessions[0]!.displayName).toBe('Copilot Chat 3b809804');
    expect(sessions[1]!.archiveName).toBe('copilot-chat-a1b2c3d4');
  });

  it('should return empty array when sessions directory does not exist', async () => {
    workspace.fs.readDirectory = vi.fn().mockRejectedValue(new Error('not found'));

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(0);
  });

  it('should skip non-json files', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['session.json', FileType.File],
      ['session.txt', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 100 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('copilot-chat-session');
  });

  it('should skip directories', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['session.json', FileType.File],
      ['subdir', FileType.Directory],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 100 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(1);
  });

  it('should skip files that fail stat', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['good.json', FileType.File],
      ['bad.json', FileType.File],
    ]);
    workspace.fs.stat = vi
      .fn()
      .mockResolvedValueOnce({ mtime: 100 })
      .mockRejectedValueOnce(new Error('fail'));

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('copilot-chat-good');
  });

  it('should look in correct workspaceStorage path', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);

    await provider.findSessions('/workspace');

    const readDirCall = vi.mocked(workspace.fs.readDirectory).mock.calls[0]!;
    expect(readDirCall[0].fsPath).toContain('github.copilot-chat');
    expect(readDirCall[0].fsPath).toContain('chatSessions');
  });
});
