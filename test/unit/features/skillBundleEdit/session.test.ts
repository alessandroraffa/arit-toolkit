import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Uri, workspace, FileSystemError, resetAllMocks } from '../../mocks/vscode';

vi.mock('vscode', () => import('../../mocks/vscode'));

import { SessionRegistry } from '../../../../src/features/skillBundleEdit/session';

const GLOBAL = '/tmp/global';

function ctx(): unknown {
  return { globalStorageUri: Uri.file(GLOBAL) };
}

function makeSession(fsPath: string): unknown {
  return {
    bundleUri: Uri.file(fsPath),
    tempUri: Uri.file('/tmp/global/skill-edits/x/SKILL.md'),
    document: { getText: (): string => '' },
    companions: [],
  };
}

function sentinelPath(fsPath: string): string {
  const hash = createHash('sha1').update(fsPath).digest('hex');
  return `${GLOBAL}/skill-edits/${hash}/.pending-failure.json`;
}

const FAILURE = { reason: 'repack-io-error' as const, message: 'boom', timestamp: 42 };

describe('SessionRegistry — basic operations', () => {
  beforeEach(() => resetAllMocks());

  it('get returns undefined for an unknown key', () => {
    const reg = new SessionRegistry(ctx() as never);
    expect(reg.get('/nope.skill')).toBeUndefined();
  });

  it('set then get returns the session; delete removes it; entries lists pairs', () => {
    const reg = new SessionRegistry(ctx() as never);
    const session = makeSession('/w/a.skill');
    reg.set(session as never);
    expect(reg.get('/w/a.skill')).toBe(session);
    expect([...reg.entries()].map(([k]) => k)).toEqual(['/w/a.skill']);
    reg.delete('/w/a.skill');
    expect(reg.get('/w/a.skill')).toBeUndefined();
  });
});

describe('SessionRegistry — markFailure', () => {
  beforeEach(() => resetAllMocks());

  it('resolves only after sentinel is on disk', async () => {
    const reg = new SessionRegistry(ctx() as never);
    const session = makeSession('/w/a.skill');
    reg.set(session as never);
    await reg.markFailure('/w/a.skill', FAILURE);
    expect(workspace.fs.writeFile).toHaveBeenCalledTimes(1);
    const call = workspace.fs.writeFile.mock.calls[0]!;
    expect((call[0] as { fsPath: string }).fsPath).toBe(sentinelPath('/w/a.skill'));
    const written = JSON.parse(Buffer.from(call[1] as Uint8Array).toString('utf8'));
    expect(written).toMatchObject({
      reason: 'repack-io-error',
      message: 'boom',
      timestamp: 42,
      bundleFsPath: '/w/a.skill',
    });
    expect(
      (reg.get('/w/a.skill') as { pendingFailure?: unknown }).pendingFailure
    ).toEqual(FAILURE);
  });

  it('rejects when writeFile fails', async () => {
    const reg = new SessionRegistry(ctx() as never);
    reg.set(makeSession('/w/a.skill') as never);
    workspace.fs.writeFile.mockRejectedValueOnce(new Error('disk full'));
    await expect(reg.markFailure('/w/a.skill', FAILURE)).rejects.toThrow('disk full');
  });

  it('logs a warn and returns when the session is absent (no writeFile)', async () => {
    const reg = new SessionRegistry(ctx() as never);
    await expect(reg.markFailure('/w/missing.skill', FAILURE)).resolves.toBeUndefined();
    expect(workspace.fs.writeFile).not.toHaveBeenCalled();
  });
});

describe('SessionRegistry — clearFailure', () => {
  beforeEach(() => resetAllMocks());

  it('resolves only after sentinel is absent', async () => {
    const reg = new SessionRegistry(ctx() as never);
    reg.set(makeSession('/w/a.skill') as never);
    await reg.markFailure('/w/a.skill', FAILURE);
    await reg.clearFailure('/w/a.skill');
    expect(workspace.fs.delete).toHaveBeenCalledTimes(1);
    expect(
      (reg.get('/w/a.skill') as { pendingFailure?: unknown }).pendingFailure
    ).toBeUndefined();
  });

  it('treats FileNotFound as success', async () => {
    const reg = new SessionRegistry(ctx() as never);
    reg.set(makeSession('/w/a.skill') as never);
    await reg.markFailure('/w/a.skill', FAILURE);
    workspace.fs.delete.mockRejectedValueOnce(FileSystemError.FileNotFound());
    await expect(reg.clearFailure('/w/a.skill')).resolves.toBeUndefined();
  });

  it('rejects on a non-FileNotFound delete error', async () => {
    const reg = new SessionRegistry(ctx() as never);
    reg.set(makeSession('/w/a.skill') as never);
    await reg.markFailure('/w/a.skill', FAILURE);
    workspace.fs.delete.mockRejectedValueOnce(new Error('permission denied'));
    await expect(reg.clearFailure('/w/a.skill')).rejects.toThrow('permission denied');
  });

  it('does not call delete when pendingFailure is already undefined', async () => {
    const reg = new SessionRegistry(ctx() as never);
    reg.set(makeSession('/w/a.skill') as never);
    await reg.clearFailure('/w/a.skill');
    expect(workspace.fs.delete).not.toHaveBeenCalled();
  });
});

describe('SessionRegistry — in-memory/on-disk sync', () => {
  beforeEach(() => resetAllMocks());

  it('mark, clear, mark again yields two writes and one delete', async () => {
    const reg = new SessionRegistry(ctx() as never);
    reg.set(makeSession('/w/a.skill') as never);
    await reg.markFailure('/w/a.skill', FAILURE);
    await reg.clearFailure('/w/a.skill');
    await reg.markFailure('/w/a.skill', FAILURE);
    expect(workspace.fs.writeFile).toHaveBeenCalledTimes(2);
    expect(workspace.fs.delete).toHaveBeenCalledTimes(1);
  });
});
