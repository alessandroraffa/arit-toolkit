import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Uri, window, workspace, resetAllMocks } from '../../mocks/vscode';

vi.mock('vscode', () => import('../../mocks/vscode'));
vi.mock('../../../../src/features/skillBundleEdit/bundle', () => ({
  readSkillBundle: vi.fn(),
  writeSkillBundle: vi.fn(),
}));
vi.mock('../../../../src/features/skillBundleEdit/tempStore', () => ({
  resolveTempUri: vi.fn(),
  writeTempFile: vi.fn(),
  deleteTempDir: vi.fn(),
}));

import { editSkillBundleCommand } from '../../../../src/features/skillBundleEdit/command';
import { SessionRegistry } from '../../../../src/features/skillBundleEdit/session';
import { SKILL_MD_TEMPLATE } from '../../../../src/features/skillBundleEdit/template';
import { readSkillBundle } from '../../../../src/features/skillBundleEdit/bundle';
import {
  resolveTempUri,
  writeTempFile,
} from '../../../../src/features/skillBundleEdit/tempStore';

const mockRead = vi.mocked(readSkillBundle);
const mockResolveTempUri = vi.mocked(resolveTempUri);
const mockWriteTempFile = vi.mocked(writeTempFile);

function ctx(): never {
  return { globalStorageUri: Uri.file('/tmp/global') } as never;
}

function makeRegistry(): SessionRegistry {
  return new SessionRegistry(ctx());
}

describe('editSkillBundleCommand', () => {
  beforeEach(() => {
    resetAllMocks();
    mockResolveTempUri.mockReturnValue(
      Uri.file('/tmp/global/skill-edits/x/SKILL.md') as never
    );
    mockWriteTempFile.mockResolvedValue(undefined);
  });

  it('concurrent open — focuses existing tab', async () => {
    const registry = makeRegistry();
    const bundleUri = Uri.file('/w/a.skill');
    const document = { getText: (): string => '' };
    registry.set({
      bundleUri,
      tempUri: Uri.file('/t'),
      document,
      companions: [],
    } as never);
    await editSkillBundleCommand(bundleUri as never, ctx(), registry);
    expect(window.showTextDocument).toHaveBeenCalledWith(document, { preview: false });
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('fresh open — SKILL.md present', async () => {
    const registry = makeRegistry();
    const bundleUri = Uri.file('/w/a.skill');
    mockRead.mockResolvedValue({ skillMd: '# content', companions: [] } as never);
    await editSkillBundleCommand(bundleUri as never, ctx(), registry);
    expect(mockResolveTempUri).toHaveBeenCalled();
    expect(mockWriteTempFile).toHaveBeenCalledWith(expect.anything(), '# content');
    expect(workspace.openTextDocument).toHaveBeenCalled();
    expect(window.showTextDocument).toHaveBeenCalled();
    expect(registry.get('/w/a.skill')).toBeDefined();
    const infoArg = vi.mocked(window.showInformationMessage).mock.calls[0]?.[0] as string;
    expect(infoArg).toContain('a.skill');
  });

  it('fresh open — SKILL.md absent, user accepts template', async () => {
    const registry = makeRegistry();
    const bundleUri = Uri.file('/w/b.skill');
    mockRead.mockResolvedValue({ skillMd: undefined, companions: [] } as never);
    vi.mocked(window.showInformationMessage).mockResolvedValueOnce(
      'Create from template' as never
    );
    await editSkillBundleCommand(bundleUri as never, ctx(), registry);
    expect(mockWriteTempFile).toHaveBeenCalledWith(expect.anything(), SKILL_MD_TEMPLATE);
    expect(registry.get('/w/b.skill')).toBeDefined();
    expect(window.showTextDocument).toHaveBeenCalled();
  });

  it('fresh open — SKILL.md absent, user declines', async () => {
    const registry = makeRegistry();
    const bundleUri = Uri.file('/w/c.skill');
    mockRead.mockResolvedValue({ skillMd: undefined, companions: [] } as never);
    vi.mocked(window.showInformationMessage).mockResolvedValueOnce(undefined as never);
    await editSkillBundleCommand(bundleUri as never, ctx(), registry);
    expect(mockWriteTempFile).not.toHaveBeenCalled();
    expect(registry.get('/w/c.skill')).toBeUndefined();
    expect(window.showTextDocument).not.toHaveBeenCalled();
  });

  it('fresh open — corrupted bundle (readSkillBundle throws)', async () => {
    const registry = makeRegistry();
    const bundleUri = Uri.file('/w/bad.skill');
    mockRead.mockRejectedValue(new Error('invalid ZIP signature'));
    await editSkillBundleCommand(bundleUri as never, ctx(), registry);
    const errArg = vi.mocked(window.showErrorMessage).mock.calls[0]?.[0] as string;
    expect(errArg).toContain('bad.skill');
    expect(errArg).toContain('invalid ZIP signature');
    expect(mockWriteTempFile).not.toHaveBeenCalled();
    expect(registry.get('/w/bad.skill')).toBeUndefined();
  });
});
