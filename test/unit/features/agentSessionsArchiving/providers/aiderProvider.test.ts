import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace } from '../../../mocks/vscode';
import { AiderProvider } from '../../../../../src/features/agentSessionsArchiving/providers/aiderProvider';

describe('AiderProvider', () => {
  let provider: AiderProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AiderProvider();
  });

  it('should have correct name and displayName', () => {
    expect(provider.name).toBe('aider');
    expect(provider.displayName).toBe('Aider');
  });

  it('should find both aider files when they exist', async () => {
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1000 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.archiveName).toBe('aider-chat-history');
    expect(sessions[0]!.extension).toBe('.md');
    expect(sessions[0]!.mtime).toBe(1000);
    expect(sessions[1]!.archiveName).toBe('aider-input-history');
    expect(sessions[1]!.extension).toBe('.txt');
  });

  it('should return empty array when no aider files exist', async () => {
    workspace.fs.stat = vi.fn().mockRejectedValue(new Error('not found'));

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(0);
  });

  it('should return only existing files', async () => {
    workspace.fs.stat = vi
      .fn()
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({ mtime: 2000 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('aider-input-history');
  });

  it('should set correct displayName for each file', async () => {
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 500 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions[0]!.displayName).toBe('Aider .aider.chat.history.md');
    expect(sessions[1]!.displayName).toBe('Aider .aider.input.history');
  });

  it('should construct uri from workspace root path', async () => {
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 100 });

    const sessions = await provider.findSessions('/my/project');

    expect(sessions[0]!.uri.fsPath).toContain('/my/project');
    expect(sessions[0]!.uri.fsPath).toContain('.aider.chat.history.md');
  });
});
