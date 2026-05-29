import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Uri, workspace, FileSystemError, resetAllMocks } from '../../mocks/vscode';

vi.mock('vscode', () => import('../../mocks/vscode'));

import {
  resolveTempUri,
  writeTempFile,
  deleteTempDir,
  sweepOrphans,
} from '../../../../src/features/skillBundleEdit/tempStore';

function mockCtx(globalStorage: string): { globalStorageUri: { fsPath: string } } {
  return { globalStorageUri: Uri.file(globalStorage) };
}

describe('resolveTempUri', () => {
  beforeEach(() => resetAllMocks());

  it('maps a bundle fsPath to skill-edits/<sha1>/SKILL.md', () => {
    const bundle = '/workspace/skills/my-skill.skill';
    const ctx = mockCtx('/tmp/global');
    const result = resolveTempUri(Uri.file(bundle) as never, ctx as never);
    const sha1 = createHash('sha1').update(bundle).digest('hex');
    expect(result.fsPath.endsWith(`/skill-edits/${sha1}/SKILL.md`)).toBe(true);
  });

  it('is deterministic across repeated calls', () => {
    const bundle = '/workspace/skills/my-skill.skill';
    const ctx = mockCtx('/tmp/global');
    const a = resolveTempUri(Uri.file(bundle) as never, ctx as never);
    const b = resolveTempUri(Uri.file(bundle) as never, ctx as never);
    expect(a.fsPath).toBe(b.fsPath);
  });
});

describe('writeTempFile / deleteTempDir round-trip', () => {
  beforeEach(() => resetAllMocks());

  it('writes UTF-8 bytes and deletes recursively', async () => {
    const uri = Uri.file('/tmp/global/skill-edits/abc/SKILL.md');
    await writeTempFile(uri as never, 'content');
    expect(workspace.fs.createDirectory).toHaveBeenCalled();
    expect(workspace.fs.writeFile).toHaveBeenCalledWith(
      uri,
      Buffer.from('content', 'utf8')
    );

    const parent = Uri.file('/tmp/global/skill-edits/abc');
    await deleteTempDir(parent as never);
    expect(workspace.fs.delete).toHaveBeenCalledWith(parent, { recursive: true });
  });
});

describe('sweepOrphans', () => {
  beforeEach(() => resetAllMocks());

  it('preserves a subdirectory containing the sentinel and returns a record', async () => {
    const ctx = mockCtx('/tmp/global');
    workspace.fs.readDirectory.mockResolvedValueOnce([['abc', 2]]);
    workspace.fs.readFile.mockResolvedValueOnce(
      Buffer.from(
        JSON.stringify({
          bundleFsPath: '/w/s.skill',
          reason: 'repack-io-error',
          message: 'boom',
          timestamp: 123,
        }),
        'utf8'
      )
    );
    const result = await sweepOrphans(ctx as never);
    expect(result).toHaveLength(1);
    expect(result[0]?.bundleFsPath).toBe('/w/s.skill');
    expect(result[0]?.reason).toBe('repack-io-error');
    expect(result[0]?.preservedTempFilePath.endsWith('/skill-edits/abc/SKILL.md')).toBe(
      true
    );
    expect(workspace.fs.delete).not.toHaveBeenCalled();
  });

  it('deletes a subdirectory without the sentinel and returns no record', async () => {
    const ctx = mockCtx('/tmp/global');
    workspace.fs.readDirectory.mockResolvedValueOnce([['orphan', 2]]);
    workspace.fs.readFile.mockRejectedValueOnce(FileSystemError.FileNotFound());
    const result = await sweepOrphans(ctx as never);
    expect(result).toHaveLength(0);
    expect(workspace.fs.delete).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: expect.stringContaining('/skill-edits/orphan') }),
      { recursive: true }
    );
  });

  it('preserves the sentinel-bearing dir and deletes the sentinel-free dir', async () => {
    const ctx = mockCtx('/tmp/global');
    workspace.fs.readDirectory.mockResolvedValueOnce([
      ['keep', 2],
      ['drop', 2],
    ]);
    workspace.fs.readFile
      .mockResolvedValueOnce(
        Buffer.from(
          JSON.stringify({
            bundleFsPath: '/w/keep.skill',
            reason: 'rename-failed',
            message: 'm',
            timestamp: 1,
          }),
          'utf8'
        )
      )
      .mockRejectedValueOnce(FileSystemError.FileNotFound());
    const result = await sweepOrphans(ctx as never);
    expect(result).toHaveLength(1);
    expect(result[0]?.bundleFsPath).toBe('/w/keep.skill');
    expect(workspace.fs.delete).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array when skill-edits does not exist', async () => {
    const ctx = mockCtx('/tmp/global');
    workspace.fs.readDirectory.mockRejectedValueOnce(FileSystemError.FileNotFound());
    const result = await sweepOrphans(ctx as never);
    expect(result).toHaveLength(0);
    expect(workspace.fs.delete).not.toHaveBeenCalled();
  });
});
