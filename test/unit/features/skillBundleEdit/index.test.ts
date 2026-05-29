import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Uri, window, resetAllMocks } from '../../mocks/vscode';

vi.mock('vscode', () => import('../../mocks/vscode'));
vi.mock('../../../../src/features/skillBundleEdit/tempStore', () => ({
  sweepOrphans: vi.fn(),
  resolveTempUri: vi.fn(),
  writeTempFile: vi.fn(),
  deleteTempDir: vi.fn(),
}));

import {
  COMMAND_ID_EDIT_SKILL_BUNDLE,
  SKILL_EDITS_DIR_NAME,
  SKILL_MD_BASENAME,
  registerSkillBundleEditFeature,
} from '../../../../src/features/skillBundleEdit/index';
import { sweepOrphans } from '../../../../src/features/skillBundleEdit/tempStore';

const mockSweep = vi.mocked(sweepOrphans);

describe('skillBundleEdit index constants', () => {
  it('COMMAND_ID_EDIT_SKILL_BUNDLE equals tangyr.editSkillBundle', () => {
    expect(COMMAND_ID_EDIT_SKILL_BUNDLE).toBe('tangyr.editSkillBundle');
  });

  it('SKILL_EDITS_DIR_NAME equals skill-edits', () => {
    expect(SKILL_EDITS_DIR_NAME).toBe('skill-edits');
  });

  it('SKILL_MD_BASENAME equals SKILL.md', () => {
    expect(SKILL_MD_BASENAME).toBe('SKILL.md');
  });
});

describe('registerSkillBundleEditFeature — activation notifications', () => {
  beforeEach(() => resetAllMocks());

  // [Cross-WS regression check for WS-0018 behavior] verifies the activation
  // notification loop in registerSkillBundleEditFeature still emits one message
  // per PreservedFailureRecord. Failures route to a WS-0018 fix, not WS-0019.
  it('emits one information message per PreservedFailureRecord', async () => {
    mockSweep.mockResolvedValueOnce([
      {
        bundleFsPath: '/w/a.skill',
        reason: 'bundle-missing',
        message: 'm1',
        timestamp: 1,
        preservedTempFilePath: '/g/skill-edits/h1/SKILL.md',
      },
      {
        bundleFsPath: '/w/b.skill',
        reason: 'rename-failed',
        message: 'm2',
        timestamp: 2,
        preservedTempFilePath: '/g/skill-edits/h2/SKILL.md',
      },
    ]);
    const ctx = {
      context: { globalStorageUri: Uri.file('/g'), subscriptions: [] as unknown[] },
      registry: { register: vi.fn() },
    };
    await registerSkillBundleEditFeature(ctx as never);
    expect(window.showInformationMessage).toHaveBeenCalledTimes(2);
    const msgs = vi
      .mocked(window.showInformationMessage)
      .mock.calls.map((c) => c[0] as string);
    expect(msgs[0]).toContain('a.skill');
    expect(msgs[0]).toContain('bundle-missing');
    expect(msgs[0]).toContain('/g/skill-edits/h1/SKILL.md');
    expect(msgs[1]).toContain('b.skill');
    expect(msgs[1]).toContain('rename-failed');
    expect(ctx.registry.register).toHaveBeenCalledWith(
      COMMAND_ID_EDIT_SKILL_BUNDLE,
      expect.any(Function)
    );
  });

  it('registers no notifications when the sweep returns no preserved records', async () => {
    mockSweep.mockResolvedValueOnce([]);
    const ctx = {
      context: { globalStorageUri: Uri.file('/g'), subscriptions: [] as unknown[] },
      registry: { register: vi.fn() },
    };
    await registerSkillBundleEditFeature(ctx as never);
    expect(window.showInformationMessage).not.toHaveBeenCalled();
  });
});
