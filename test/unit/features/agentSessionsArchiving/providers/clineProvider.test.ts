import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, Uri, FileType } from '../../../mocks/vscode';
import { ClineProvider } from '../../../../../src/features/agentSessionsArchiving/providers/clineProvider';

describe('ClineProvider', () => {
  const globalStorageBase = Uri.file('/global/storage');
  let provider: ClineProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ClineProvider(globalStorageBase as any);
  });

  it('should have correct name and displayName', () => {
    expect(provider.name).toBe('cline');
    expect(provider.displayName).toBe('Cline');
  });

  it('should find task sessions that belong to current workspace', async () => {
    const workspacePath = '/projects/my-app';
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['task-001', FileType.Directory],
      ['task-002', FileType.Directory],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1000, ctime: 900 });
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(
        new TextEncoder().encode(
          JSON.stringify([{ role: 'user', content: `<cwd>${workspacePath}</cwd>` }])
        )
      );

    const sessions = await provider.findSessions(workspacePath);

    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.archiveName).toBe('cline-task-001');
    expect(sessions[0]!.extension).toBe('.json');
    expect(sessions[0]!.displayName).toBe('Cline task task-001');
    expect(sessions[1]!.archiveName).toBe('cline-task-002');
  });

  it('should exclude sessions from other workspaces', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['task-001', FileType.Directory],
      ['task-002', FileType.Directory],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1000, ctime: 900 });
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValueOnce(
        new TextEncoder().encode(
          JSON.stringify([{ role: 'user', content: '<cwd>/projects/my-app</cwd>' }])
        )
      )
      .mockResolvedValueOnce(
        new TextEncoder().encode(
          JSON.stringify([{ role: 'user', content: '<cwd>/projects/other-app</cwd>' }])
        )
      );

    const sessions = await provider.findSessions('/projects/my-app');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('cline-task-001');
  });

  it('should exclude sessions when file content cannot be read', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValue([['task-001', FileType.Directory]]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1000, ctime: 900 });
    workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('read error'));

    const sessions = await provider.findSessions('/projects/my-app');

    expect(sessions).toHaveLength(0);
  });

  it('should return empty array when tasks directory does not exist', async () => {
    workspace.fs.readDirectory = vi.fn().mockRejectedValue(new Error('not found'));

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(0);
  });

  it('should skip non-directory entries', async () => {
    const workspacePath = '/workspace';
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['task-001', FileType.Directory],
      ['some-file.txt', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 500, ctime: 400 });
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(
        new TextEncoder().encode(`content containing ${workspacePath} path`)
      );

    const sessions = await provider.findSessions(workspacePath);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('cline-task-001');
  });

  it('should skip tasks where session file stat fails', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['task-001', FileType.Directory],
      ['task-002', FileType.Directory],
    ]);
    workspace.fs.stat = vi
      .fn()
      .mockResolvedValueOnce({ mtime: 1000, ctime: 900 })
      .mockRejectedValueOnce(new Error('not found'));
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode('content with /workspace inside'));

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('cline-task-001');
  });

  it('should look in correct globalStorage path', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);

    await provider.findSessions('/workspace');

    const readDirCall = vi.mocked(workspace.fs.readDirectory).mock.calls[0]!;
    expect(readDirCall[0].fsPath).toContain('saoudrizwan.claude-dev');
    expect(readDirCall[0].fsPath).toContain('tasks');
  });
});
