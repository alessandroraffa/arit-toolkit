import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, Uri, FileType } from '../../../mocks/vscode';
import { RooCodeProvider } from '../../../../../src/features/agentSessionsArchiving/providers/rooCodeProvider';

describe('RooCodeProvider', () => {
  const globalStorageBase = Uri.file('/global/storage');
  let provider: RooCodeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new RooCodeProvider(globalStorageBase as any);
  });

  it('should have correct name and displayName', () => {
    expect(provider.name).toBe('roo-code');
    expect(provider.displayName).toBe('Roo Code');
  });

  it('should find task sessions', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValue([['task-abc', FileType.Directory]]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 2000 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('roo-code-task-abc');
    expect(sessions[0]!.extension).toBe('.json');
    expect(sessions[0]!.displayName).toBe('Roo Code task task-abc');
    expect(sessions[0]!.mtime).toBe(2000);
  });

  it('should return empty array when tasks directory does not exist', async () => {
    workspace.fs.readDirectory = vi.fn().mockRejectedValue(new Error('not found'));

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(0);
  });

  it('should skip non-directory entries', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['task-abc', FileType.Directory],
      ['readme.md', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 500 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(1);
  });

  it('should skip tasks where session file stat fails', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValue([['task-abc', FileType.Directory]]);
    workspace.fs.stat = vi.fn().mockRejectedValue(new Error('not found'));

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(0);
  });

  it('should look in correct globalStorage path', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);

    await provider.findSessions('/workspace');

    const readDirCall = vi.mocked(workspace.fs.readDirectory).mock.calls[0]!;
    expect(readDirCall[0].fsPath).toContain('rooveterinaryinc.roo-cline');
    expect(readDirCall[0].fsPath).toContain('tasks');
  });
});
