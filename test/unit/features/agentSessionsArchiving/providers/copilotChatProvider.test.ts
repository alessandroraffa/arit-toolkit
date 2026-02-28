import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, Uri, FileType } from '../../../mocks/vscode';
import { CopilotChatProvider } from '../../../../../src/features/agentSessionsArchiving/providers/copilotChatProvider';

describe('CopilotChatProvider', () => {
  const workspaceStorageDir = Uri.file('/workspace/storage/abc123');
  let provider: CopilotChatProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CopilotChatProvider(workspaceStorageDir as any);
  });

  it('should have correct name and displayName', () => {
    expect(provider.name).toBe('copilot-chat');
    expect(provider.displayName).toBe('GitHub Copilot Chat');
  });

  it('should find json session files', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['3b809804.json', FileType.File],
      ['a1b2c3d4.json', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1500, ctime: 1400 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.archiveName).toBe('copilot-chat-3b809804');
    expect(sessions[0]!.extension).toBe('.json');
    expect(sessions[0]!.displayName).toBe('Copilot Chat 3b809804');
    expect(sessions[1]!.archiveName).toBe('copilot-chat-a1b2c3d4');
  });

  it('should find jsonl session files', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['session-1.jsonl', FileType.File],
      ['session-2.jsonl', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 2000, ctime: 1900 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.archiveName).toBe('copilot-chat-session-1');
    expect(sessions[0]!.extension).toBe('.jsonl');
    expect(sessions[1]!.archiveName).toBe('copilot-chat-session-2');
    expect(sessions[1]!.extension).toBe('.jsonl');
  });

  it('should find both json and jsonl session files', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['old-session.json', FileType.File],
      ['new-session.jsonl', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1500, ctime: 1400 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.extension).toBe('.json');
    expect(sessions[1]!.extension).toBe('.jsonl');
  });

  it('should return empty array when sessions directory does not exist', async () => {
    workspace.fs.readDirectory = vi.fn().mockRejectedValue(new Error('not found'));

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(0);
  });

  it('should skip non-session files', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['session.json', FileType.File],
      ['session.txt', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 100, ctime: 90 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('copilot-chat-session');
  });

  it('should skip directories', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['session.json', FileType.File],
      ['subdir', FileType.Directory],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 100, ctime: 90 });

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
      .mockResolvedValueOnce({ mtime: 100, ctime: 90 })
      .mockRejectedValueOnce(new Error('fail'));

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('copilot-chat-good');
  });

  it('should look directly in workspace storage chatSessions path', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);

    await provider.findSessions('/workspace');

    const readDirCall = vi.mocked(workspace.fs.readDirectory).mock.calls[0]!;
    expect(readDirCall[0].fsPath).toBe('/workspace/storage/abc123/chatSessions');
    expect(readDirCall[0].fsPath).not.toContain('github.copilot-chat');
  });

  it('should return watch patterns for chatSessions directory', () => {
    const patterns = provider.getWatchPatterns('/workspace');

    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.baseUri.fsPath).toBe('/workspace/storage/abc123/chatSessions');
    expect(patterns[0]!.glob).toBe('*.json');
  });
});
