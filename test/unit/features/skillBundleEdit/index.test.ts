import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => import('../../mocks/vscode'));

import {
  COMMAND_ID_EDIT_SKILL_BUNDLE,
  SKILL_EDITS_DIR_NAME,
  SKILL_MD_BASENAME,
} from '../../../../src/features/skillBundleEdit/index';

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
