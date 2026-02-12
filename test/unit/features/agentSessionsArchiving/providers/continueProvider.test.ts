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

  it('should find session files', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['74d8c74c.json', FileType.File],
      ['abc12345.json', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 3000 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.archiveName).toBe('continue-74d8c74c');
    expect(sessions[0]!.extension).toBe('.json');
    expect(sessions[0]!.displayName).toBe('Continue session 74d8c74c');
    expect(sessions[1]!.archiveName).toBe('continue-abc12345');
  });

  it('should return empty array when sessions directory does not exist', async () => {
    workspace.fs.readDirectory = vi.fn().mockRejectedValue(new Error('not found'));

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(0);
  });

  it('should skip non-json files', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['session.json', FileType.File],
      ['config.yaml', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 100 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('continue-session');
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
    expect(sessions[0]!.archiveName).toBe('continue-good');
  });
});
