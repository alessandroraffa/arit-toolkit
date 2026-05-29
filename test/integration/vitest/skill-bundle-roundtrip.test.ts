import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readSkillBundle,
  writeSkillBundle,
} from '../../../src/features/skillBundleEdit/bundle';

// Integration test: exercises the real fflate-backed adapter (no mocks, per
// vitest.integration.config.ts) end-to-end. The adapter functions are not
// exported from dist/extension.js (the esbuild entry exports only
// activate/deactivate); the bundling smoke test verifies fflate is inlined in
// the bundle, while this test verifies the byte-preservation contract through
// the source module with the real fflate dependency.

const FIXTURES = resolve(__dirname, '../../fixtures/skill-bundles');

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('skill-bundle roundtrip (real fflate)', () => {
  let tempDir: string;

  beforeAll(() => {
    const fixture = resolve(FIXTURES, 'valid-with-companions.skill');
    if (!existsSync(fixture)) {
      throw new Error(
        `Fixture not found at ${fixture}. Run the WS-0017 fixture generator.`
      );
    }
    tempDir = mkdtempSync(join(tmpdir(), 'ws0019-'));
  });

  it('read-modify-write preserves companion local-block bytes (SHA-256)', async () => {
    const fixture = resolve(FIXTURES, 'valid-with-companions.skill');
    const original = await readSkillBundle({ fsPath: fixture });
    const out = join(tempDir, 'out.skill');
    const modified = (original.skillMd ?? '') + '\n<!-- roundtrip test -->';
    await writeSkillBundle(
      { fsPath: out },
      { skillMd: modified, companions: original.companions }
    );
    const reread = await readSkillBundle({ fsPath: out });
    expect(reread.companions.length).toBe(original.companions.length);
    for (const orig of original.companions) {
      const match = reread.companions.find((c) => c.name === orig.name);
      expect(match, `companion ${orig.name} present`).toBeDefined();
      expect(sha256(match!.localBlock)).toBe(sha256(orig.localBlock));
    }
  });

  it('roundtrip SKILL.md content equals the modified input', async () => {
    const fixture = resolve(FIXTURES, 'valid-with-companions.skill');
    const original = await readSkillBundle({ fsPath: fixture });
    const out = join(tempDir, 'out2.skill');
    const modified = (original.skillMd ?? '') + '\nEXTRA';
    await writeSkillBundle(
      { fsPath: out },
      { skillMd: modified, companions: original.companions }
    );
    const reread = await readSkillBundle({ fsPath: out });
    expect(reread.skillMd).toBe(modified);
  });

  it('writing to a new path leaves the original bundle bytes untouched', async () => {
    const fixture = resolve(FIXTURES, 'valid-with-companions.skill');
    const originalCopy = join(tempDir, 'original.skill');
    copyFileSync(fixture, originalCopy);
    const before = sha256(new Uint8Array(readFileSync(originalCopy)));
    const original = await readSkillBundle({ fsPath: originalCopy });
    const out = join(tempDir, 'out3.skill');
    await writeSkillBundle(
      { fsPath: out },
      { skillMd: 'completely new content', companions: original.companions }
    );
    const after = sha256(new Uint8Array(readFileSync(originalCopy)));
    expect(after).toBe(before);
  });
});
