import { describe, it, expect } from 'vitest';
import { SKILL_MD_TEMPLATE } from '../../../../src/features/skillBundleEdit/template';

describe('SKILL_MD_TEMPLATE', () => {
  it('starts with YAML frontmatter delimiter', () => {
    expect(SKILL_MD_TEMPLATE.startsWith('---\n')).toBe(true);
  });

  it('contains name and description frontmatter keys', () => {
    expect(SKILL_MD_TEMPLATE).toContain('name:');
    expect(SKILL_MD_TEMPLATE).toContain('description:');
  });

  it('has no H1 heading', () => {
    expect(SKILL_MD_TEMPLATE.split('\n').some((l) => /^# /.test(l))).toBe(false);
  });
});
