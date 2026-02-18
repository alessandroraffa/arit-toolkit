import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, FileType } from '../../../mocks/vscode';
import { ContinueProvider } from '../../../../../src/features/agentSessionsArchiving/providers/continueProvider';

describe('ContinueProvider', () => {
  let provider: ContinueProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ContinueProvider();
  });

  it('should have correct name and displayName', () => {
    expect(provider.name).toBe('continue');
    expect(provider.displayName).toBe('Continue');
  });

  it('should find session files that belong to current workspace', async () => {
    const workspacePath = '/projects/my-app';
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['74d8c74c.json', FileType.File],
      ['abc12345.json', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 3000, ctime: 2900 });
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(
        new TextEncoder().encode(
          JSON.stringify({ workspaceDirectory: workspacePath, history: [] })
        )
      );

    const sessions = await provider.findSessions(workspacePath);

    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.archiveName).toBe('continue-74d8c74c');
    expect(sessions[0]!.extension).toBe('.json');
    expect(sessions[0]!.displayName).toBe('Continue session 74d8c74c');
    expect(sessions[1]!.archiveName).toBe('continue-abc12345');
  });

  it('should exclude sessions from other workspaces', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['session-a.json', FileType.File],
      ['session-b.json', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 3000, ctime: 2900 });
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValueOnce(
        new TextEncoder().encode(
          JSON.stringify({ workspaceDirectory: '/projects/my-app', history: [] })
        )
      )
      .mockResolvedValueOnce(
        new TextEncoder().encode(
          JSON.stringify({ workspaceDirectory: '/projects/other-app', history: [] })
        )
      );

    const sessions = await provider.findSessions('/projects/my-app');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('continue-session-a');
  });

  it('should exclude sessions when file content cannot be read', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValue([['session.json', FileType.File]]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 3000, ctime: 2900 });
    workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('read error'));

    const sessions = await provider.findSessions('/projects/my-app');

    expect(sessions).toHaveLength(0);
  });

  it('should return empty array when sessions directory does not exist', async () => {
    workspace.fs.readDirectory = vi.fn().mockRejectedValue(new Error('not found'));

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(0);
  });

  it('should skip non-json files', async () => {
    const workspacePath = '/workspace';
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['session.json', FileType.File],
      ['config.yaml', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 100, ctime: 90 });
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(
        new TextEncoder().encode(`content containing ${workspacePath} path`)
      );

    const sessions = await provider.findSessions(workspacePath);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('continue-session');
  });

  it('should skip directories', async () => {
    const workspacePath = '/workspace';
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['session.json', FileType.File],
      ['subdir', FileType.Directory],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 100, ctime: 90 });
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(
        new TextEncoder().encode(`content containing ${workspacePath} path`)
      );

    const sessions = await provider.findSessions(workspacePath);

    expect(sessions).toHaveLength(1);
  });

  it('should skip files that fail stat', async () => {
    const workspacePath = '/workspace';
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['good.json', FileType.File],
      ['bad.json', FileType.File],
    ]);
    workspace.fs.stat = vi
      .fn()
      .mockResolvedValueOnce({ mtime: 100, ctime: 90 })
      .mockRejectedValueOnce(new Error('fail'));
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(
        new TextEncoder().encode(`content containing ${workspacePath} path`)
      );

    const sessions = await provider.findSessions(workspacePath);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('continue-good');
  });
});
