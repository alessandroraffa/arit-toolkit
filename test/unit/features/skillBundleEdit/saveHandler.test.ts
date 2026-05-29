import { describe, it, expect, beforeEach, vi } from 'vitest';
import { window, workspace, FileSystemError, resetAllMocks } from '../../mocks/vscode';

vi.mock('vscode', () => import('../../mocks/vscode'));
vi.mock('../../../../src/features/skillBundleEdit/bundle', () => ({
  writeSkillBundle: vi.fn(),
}));
vi.mock('../../../../src/features/skillBundleEdit/tempStore', () => ({
  deleteTempDir: vi.fn(),
}));

import {
  registerSaveListener,
  registerCloseListener,
} from '../../../../src/features/skillBundleEdit/saveHandler';
import { SessionRegistry } from '../../../../src/features/skillBundleEdit/session';
import { writeSkillBundle } from '../../../../src/features/skillBundleEdit/bundle';
import { deleteTempDir } from '../../../../src/features/skillBundleEdit/tempStore';

const mockWrite = vi.mocked(writeSkillBundle);
const mockDeleteTempDir = vi.mocked(deleteTempDir);

function mkUri(p: string, fsPath?: string): any {
  return {
    path: p,
    fsPath: fsPath ?? p,
    with: (change: { path: string }) => mkUri(change.path, fsPath),
  };
}

function ctx(): never {
  return { globalStorageUri: mkUri('/tmp/global') } as never;
}

const TEMP_PATH = '/tmp/global/skill-edits/h1/SKILL.md';

function setupSession(
  registry: SessionRegistry,
  bundlePath: string,
  opts: { tempPath?: string; fsPath?: string; pendingFailure?: unknown } = {}
): any {
  const bundleUri = mkUri(bundlePath);
  const tempUri = mkUri(opts.tempPath ?? TEMP_PATH, opts.fsPath);
  const document = { uri: tempUri, getText: (): string => 'EDITED CONTENT' };
  const session: any = { bundleUri, tempUri, document, companions: [] };
  if (opts.pendingFailure) session.pendingFailure = opts.pendingFailure;
  registry.set(session);
  return { bundleUri, tempUri, document, session };
}

function saveCb(): (doc: unknown) => Promise<void> {
  return vi.mocked(workspace.onDidSaveTextDocument).mock.calls.at(-1)![0] as never;
}

function closeCb(): (doc: unknown) => Promise<void> {
  return vi.mocked(workspace.onDidCloseTextDocument).mock.calls.at(-1)![0] as never;
}

describe('save listener — success path', () => {
  beforeEach(() => resetAllMocks());

  it('stats the bundle, writes a temp, renames, clears prior failure, shows success', async () => {
    const reg = new SessionRegistry(ctx());
    const { document } = setupSession(reg, '/w/a.skill', {
      pendingFailure: { reason: 'repack-io-error', message: 'old', timestamp: 1 },
    });
    registerSaveListener(reg);
    await saveCb()(document);
    expect(workspace.fs.stat).toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(workspace.fs.rename).toHaveBeenCalledTimes(1);
    expect(workspace.fs.delete).toHaveBeenCalled(); // clearFailure removed the sentinel
    expect(
      (reg.get('/w/a.skill') as { pendingFailure?: unknown }).pendingFailure
    ).toBeUndefined();
    const info = vi
      .mocked(window.showInformationMessage)
      .mock.calls.at(-1)?.[0] as string;
    expect(info).toContain('saved');
    expect(info).not.toContain('Retry');
  });

  it('does not fire for documents outside skill-edits/', async () => {
    const reg = new SessionRegistry(ctx());
    setupSession(reg, '/w/a.skill');
    registerSaveListener(reg);
    await saveCb()({ uri: mkUri('/w/other/file.md'), getText: (): string => 'x' });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('fires for a Windows-style fsPath whose Uri.path contains /skill-edits/', async () => {
    const reg = new SessionRegistry(ctx());
    const winFsPath = 'C:\\Users\\u\\AppData\\Roaming\\Code\\skill-edits\\h\\SKILL.md';
    const winPath = '/c:/Users/u/AppData/Roaming/Code/skill-edits/h/SKILL.md';
    const { document } = setupSession(reg, '/w/a.skill', {
      tempPath: winPath,
      fsPath: winFsPath,
    });
    registerSaveListener(reg);
    await saveCb()(document);
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });
});

describe('save listener — repack atomicity', () => {
  beforeEach(() => resetAllMocks());

  it('repack-io-error: marks failure and surfaces a Retry error; no rename', async () => {
    const reg = new SessionRegistry(ctx());
    const { document } = setupSession(reg, '/w/a.skill');
    mockWrite.mockRejectedValueOnce(new Error('disk full'));
    registerSaveListener(reg);
    await saveCb()(document);
    expect(workspace.fs.rename).not.toHaveBeenCalled();
    expect(workspace.fs.writeFile).toHaveBeenCalled(); // sentinel written by markFailure
    expect(
      (reg.get('/w/a.skill') as { pendingFailure?: { reason: string } }).pendingFailure
        ?.reason
    ).toBe('repack-io-error');
    const err = vi.mocked(window.showErrorMessage).mock.calls.at(-1);
    expect(err?.[0]).toContain('repack failed');
    expect(err?.slice(1)).toContain('Retry');
  });

  it('rename-failed: deletes temp, marks rename-failed, surfaces Retry, leaves bundle intact', async () => {
    const reg = new SessionRegistry(ctx());
    const { bundleUri, document } = setupSession(reg, '/w/a.skill');
    workspace.fs.rename.mockRejectedValueOnce(new Error('rename rejected'));
    registerSaveListener(reg);
    await saveCb()(document);
    // temp file deleted on rename failure (delete called with useTrash:false)
    expect(workspace.fs.delete).toHaveBeenCalled();
    expect(
      (reg.get('/w/a.skill') as { pendingFailure?: { reason: string } }).pendingFailure
        ?.reason
    ).toBe('rename-failed');
    const err = vi.mocked(window.showErrorMessage).mock.calls.at(-1);
    expect(err?.[0]).toContain('rename failed');
    expect(err?.slice(1)).toContain('Retry');
    // the original bundle URI was never written to directly (write went to a temp path)
    const writeTarget = mockWrite.mock.calls[0]?.[0] as { fsPath: string };
    expect(writeTarget.fsPath).not.toBe(bundleUri.fsPath);
  });
});

describe('save listener — bundle-missing and recovery', () => {
  beforeEach(() => resetAllMocks());

  it('bundle-missing: marks failure and offers Retry + Save as new bundle…', async () => {
    const reg = new SessionRegistry(ctx());
    const { document } = setupSession(reg, '/w/a.skill');
    workspace.fs.stat.mockRejectedValueOnce(FileSystemError.FileNotFound());
    registerSaveListener(reg);
    await saveCb()(document);
    expect(mockWrite).not.toHaveBeenCalled();
    expect(
      (reg.get('/w/a.skill') as { pendingFailure?: { reason: string } }).pendingFailure
        ?.reason
    ).toBe('bundle-missing');
    const err = vi.mocked(window.showErrorMessage).mock.calls.at(-1);
    expect(err?.[0]).toContain('bundle missing');
    expect(err?.slice(1)).toEqual(
      expect.arrayContaining(['Retry', 'Save as new bundle…'])
    );
  });

  it('Retry: re-writes the original bundle and clears the failure', async () => {
    const reg = new SessionRegistry(ctx());
    const { bundleUri, document } = setupSession(reg, '/w/a.skill');
    workspace.fs.stat.mockRejectedValueOnce(FileSystemError.FileNotFound());
    vi.mocked(window.showErrorMessage).mockResolvedValueOnce('Retry' as never);
    registerSaveListener(reg);
    await saveCb()(document);
    expect(mockWrite).toHaveBeenCalledWith(
      bundleUri,
      expect.objectContaining({ skillMd: 'EDITED CONTENT' })
    );
    expect(
      (reg.get('/w/a.skill') as { pendingFailure?: unknown }).pendingFailure
    ).toBeUndefined();
  });

  it('Save as new bundle…: writes chosen URI, rebinds session, clears original failure', async () => {
    const reg = new SessionRegistry(ctx());
    const { document, session } = setupSession(reg, '/w/a.skill');
    workspace.fs.stat.mockRejectedValueOnce(FileSystemError.FileNotFound());
    vi.mocked(window.showErrorMessage).mockResolvedValueOnce(
      'Save as new bundle…' as never
    );
    vi.mocked(window.showSaveDialog).mockResolvedValueOnce(
      mkUri('/w/new.skill') as never
    );
    registerSaveListener(reg);
    await saveCb()(document);
    expect(mockWrite).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: '/w/new.skill' }),
      expect.objectContaining({ skillMd: 'EDITED CONTENT' })
    );
    expect(session.bundleUri.fsPath).toBe('/w/new.skill');
    const info = vi
      .mocked(window.showInformationMessage)
      .mock.calls.at(-1)?.[0] as string;
    expect(info).toContain('saved as new');
  });

  it('Save as new bundle… cancel: preserves pendingFailure, no extra clear', async () => {
    const reg = new SessionRegistry(ctx());
    const { document, session } = setupSession(reg, '/w/a.skill');
    workspace.fs.stat.mockRejectedValueOnce(FileSystemError.FileNotFound());
    vi.mocked(window.showErrorMessage).mockResolvedValueOnce(
      'Save as new bundle…' as never
    );
    vi.mocked(window.showSaveDialog).mockResolvedValueOnce(undefined as never);
    registerSaveListener(reg);
    await saveCb()(document);
    expect(session.pendingFailure?.reason).toBe('bundle-missing');
  });

  it('Save as new bundle… failure: no second markFailure, transient Retry…, original failure unchanged', async () => {
    const reg = new SessionRegistry(ctx());
    const markSpy = vi.spyOn(reg, 'markFailure');
    const { document, session } = setupSession(reg, '/w/a.skill');
    workspace.fs.stat.mockRejectedValueOnce(FileSystemError.FileNotFound());
    vi.mocked(window.showErrorMessage)
      .mockResolvedValueOnce('Save as new bundle…' as never)
      .mockResolvedValueOnce(undefined as never);
    vi.mocked(window.showSaveDialog).mockResolvedValueOnce(
      mkUri('/w/new.skill') as never
    );
    mockWrite.mockRejectedValueOnce(new Error('write to new failed'));
    registerSaveListener(reg);
    await saveCb()(document);
    expect(markSpy).toHaveBeenCalledTimes(1); // only the bundle-missing mark, none for save-as-new failure
    expect(session.pendingFailure?.reason).toBe('bundle-missing');
    const lastErr = vi.mocked(window.showErrorMessage).mock.calls.at(-1);
    expect(lastErr?.[0]).toContain('could not save to');
    expect(lastErr?.slice(1)).toContain('Retry…');
  });
});

describe('close listener — sentinel-aware cleanup', () => {
  beforeEach(() => resetAllMocks());

  it('no pending failure: deletes temp dir and removes the registry entry', async () => {
    const reg = new SessionRegistry(ctx());
    const { document } = setupSession(reg, '/w/a.skill');
    registerCloseListener(reg);
    await closeCb()(document);
    expect(mockDeleteTempDir).toHaveBeenCalledTimes(1);
    expect(reg.get('/w/a.skill')).toBeUndefined();
    expect(window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('pending failure: preserves temp + registry, notifies with reason and path', async () => {
    const reg = new SessionRegistry(ctx());
    const { document } = setupSession(reg, '/w/a.skill', {
      pendingFailure: { reason: 'bundle-missing', message: 'gone', timestamp: 7 },
    });
    registerCloseListener(reg);
    await closeCb()(document);
    expect(mockDeleteTempDir).not.toHaveBeenCalled();
    expect(reg.get('/w/a.skill')).toBeDefined();
    const info = vi
      .mocked(window.showInformationMessage)
      .mock.calls.at(-1)?.[0] as string;
    expect(info).toContain('a.skill');
    expect(info).toContain('bundle-missing');
    expect(info).toContain(TEMP_PATH);
  });

  it('ignores documents outside skill-edits/', async () => {
    const reg = new SessionRegistry(ctx());
    setupSession(reg, '/w/a.skill');
    registerCloseListener(reg);
    await closeCb()({ uri: mkUri('/w/other/file.md'), getText: (): string => 'x' });
    expect(mockDeleteTempDir).not.toHaveBeenCalled();
    expect(reg.get('/w/a.skill')).toBeDefined();
  });
});
