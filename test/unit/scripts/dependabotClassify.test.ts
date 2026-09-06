import { describe, it, expect } from 'vitest';
// @ts-expect-error -- dependency-free ESM helper consumed directly by the workflow
import { classifyDependabotUpdate } from '../../../scripts/dependabot/classify.mjs';

interface Classification {
  eligible: boolean;
  reason: string;
  updateType: 'major' | 'minor' | 'patch' | 'unknown';
  packages: string[];
}

function classify(title: string, body = ''): Classification {
  return classifyDependabotUpdate({ title, body }) as Classification;
}

const SINGLE = (pkg: string, from: string, to: string) =>
  `Bumps [${pkg}](https://github.com/x/y) from ${from} to ${to}.`;

describe('classifyDependabotUpdate', () => {
  it('should accept a patch bump of a dev dependency', () => {
    const c = classify(
      'build(deps-dev): bump prettier from 3.9.3 to 3.9.6',
      SINGLE('prettier', '3.9.3', '3.9.6')
    );

    expect(c.eligible).toBe(true);
    expect(c.updateType).toBe('patch');
    expect(c.packages).toEqual(['prettier']);
  });

  it('should accept a minor bump of a dev dependency', () => {
    const c = classify(
      'build(deps-dev): bump eslint from 10.4.0 to 10.10.0',
      SINGLE('eslint', '10.4.0', '10.10.0')
    );

    expect(c.eligible).toBe(true);
    expect(c.updateType).toBe('minor');
  });

  it('should refuse a major bump', () => {
    const c = classify(
      'build(deps-dev): bump typescript from 5.9.3 to 7.0.2',
      SINGLE('typescript', '5.9.3', '7.0.2')
    );

    expect(c.eligible).toBe(false);
    expect(c.updateType).toBe('major');
  });

  it('should take the highest severity across a grouped update', () => {
    const c = classify(
      'build(deps-dev): bump the testing group across 1 directory with 2 updates',
      [
        'Updates `vitest` from 4.1.5 to 4.1.10',
        'Updates `@vscode/test-electron` from 2.5.2 to 3.0.0',
      ].join('\n')
    );

    expect(c.updateType).toBe('major');
    expect(c.eligible).toBe(false);
    expect(c.packages).toContain('vitest');
  });

  it('should refuse a production dependency even on a patch', () => {
    const c = classify(
      'build(deps): bump some-runtime-lib from 1.0.0 to 1.0.1',
      SINGLE('some-runtime-lib', '1.0.0', '1.0.1')
    );

    expect(c.eligible).toBe(false);
    expect(c.reason).toContain('dev');
  });

  it('should refuse GitHub Actions updates, which can silently change release.yml', () => {
    const c = classify(
      'ci(deps): bump actions/checkout from 4 to 7',
      SINGLE('actions/checkout', '4', '7')
    );

    expect(c.eligible).toBe(false);
    expect(c.reason).toContain('Actions');
  });

  it('should refuse packages that decide how the extension is built or published', () => {
    for (const pkg of [
      'esbuild',
      '@vscode/vsce',
      'semantic-release',
      '@semantic-release/github',
      'conventional-changelog-conventionalcommits',
      'typescript',
    ]) {
      const c = classify(
        `build(deps-dev): bump ${pkg} from 1.0.0 to 1.0.1`,
        SINGLE(pkg, '1.0.0', '1.0.1')
      );

      expect(c.eligible, `${pkg} must not auto-merge`).toBe(false);
      expect(c.reason).toContain(pkg);
    }
  });

  it('should refuse when no version pair can be parsed', () => {
    const c = classify('build(deps-dev): bump something', 'no parseable versions here');

    expect(c.eligible).toBe(false);
    expect(c.updateType).toBe('unknown');
  });

  it('should treat a leading-v version pair as comparable', () => {
    const c = classify(
      'build(deps-dev): bump lint-staged from v17.0.5 to v17.5.0',
      SINGLE('lint-staged', 'v17.0.5', 'v17.5.0')
    );

    expect(c.updateType).toBe('minor');
    expect(c.eligible).toBe(true);
  });

  it('should treat a 0.x minor bump as breaking', () => {
    // Under semver, 0.x minors may break; esbuild is denied anyway, so use another.
    const c = classify(
      'build(deps-dev): bump fflate from 0.8.3 to 0.9.0',
      SINGLE('fflate', '0.8.3', '0.9.0')
    );

    expect(c.eligible).toBe(false);
    expect(c.updateType).toBe('major');
  });
});
