import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { zipSync, strToU8 } from 'fflate';
import {
  readSkillBundle,
  writeSkillBundle,
  SkillBundleError,
} from '../../../../src/features/skillBundleEdit/bundle';

const FIXTURES = resolve(__dirname, '../../../fixtures/skill-bundles');

describe('bundle', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ws-0017-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeZip(name: string, files: Record<string, Uint8Array>): string {
    const path = join(tempDir, name);
    writeFileSync(path, Buffer.from(zipSync(files)));
    return path;
  }

  it('reads SKILL.md content from valid-with-skill-md fixture', async () => {
    const result = await readSkillBundle({
      fsPath: resolve(FIXTURES, 'valid-with-skill-md.skill'),
    });
    expect(result.skillMd).toBe('# Skill\n\nDescription.\n');
    expect(result.companions.length).toBe(0);
  });

  it('returns skillMd undefined when SKILL.md is absent', async () => {
    const result = await readSkillBundle({
      fsPath: resolve(FIXTURES, 'valid-no-skill-md.skill'),
    });
    expect(result.skillMd).toBeUndefined();
    expect(result.companions.length).toBe(1);
    expect(result.companions[0]?.name).toBe('README.md');
  });

  it('returns empty string when SKILL.md entry is zero-length', async () => {
    const result = await readSkillBundle({
      fsPath: resolve(FIXTURES, 'valid-empty-skill-md.skill'),
    });
    expect(result.skillMd).toBe('');
  });

  it('preserves companion entries byte-for-byte after write-read cycle', async () => {
    const original = await readSkillBundle({
      fsPath: resolve(FIXTURES, 'valid-with-companions.skill'),
    });
    const out = join(tempDir, 'out.skill');
    await writeSkillBundle(
      { fsPath: out },
      { skillMd: 'updated', companions: original.companions }
    );
    const reread = await readSkillBundle({ fsPath: out });
    expect(reread.companions.length).toBe(original.companions.length);
    for (const orig of original.companions) {
      const match = reread.companions.find((c) => c.name === orig.name);
      expect(match, `companion ${orig.name} present after round-trip`).toBeDefined();
      expect(Array.from(match!.localBlock)).toEqual(Array.from(orig.localBlock));
    }
  });

  it('write then read returns the updated SKILL.md content', async () => {
    const original = await readSkillBundle({
      fsPath: resolve(FIXTURES, 'valid-with-companions.skill'),
    });
    const out = join(tempDir, 'out.skill');
    await writeSkillBundle(
      { fsPath: out },
      { skillMd: 'new body\n', companions: original.companions }
    );
    const reread = await readSkillBundle({ fsPath: out });
    expect(reread.skillMd).toBe('new body\n');
  });

  it('replacing SKILL.md leaves companion names unchanged', async () => {
    const original = await readSkillBundle({
      fsPath: resolve(FIXTURES, 'valid-with-companions.skill'),
    });
    const origNames = original.companions.map((c) => c.name);
    const out = join(tempDir, 'out.skill');
    await writeSkillBundle(
      { fsPath: out },
      { skillMd: 'new content', companions: original.companions }
    );
    const reread = await readSkillBundle({ fsPath: out });
    expect(reread.companions.map((c) => c.name)).toEqual(origNames);
  });

  it('rejects invalid-not-zip.skill with INVALID_ZIP', async () => {
    await expect(
      readSkillBundle({ fsPath: resolve(FIXTURES, 'invalid-not-zip.skill') })
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof SkillBundleError && e.code === 'INVALID_ZIP'
    );
  });

  it('rejects entry name containing null byte', async () => {
    const path = writeZip('t.skill', { 'foo\0bar.txt': strToU8('x') });
    await expect(readSkillBundle({ fsPath: path })).rejects.toSatisfy(
      (e: unknown) => e instanceof SkillBundleError && e.code === 'UNSAFE_ENTRY_NAME'
    );
  });

  it('rejects entry name starting with forward slash', async () => {
    const path = writeZip('t.skill', { '/etc/passwd': strToU8('x') });
    await expect(readSkillBundle({ fsPath: path })).rejects.toSatisfy(
      (e: unknown) => e instanceof SkillBundleError && e.code === 'UNSAFE_ENTRY_NAME'
    );
  });

  it('rejects entry name starting with backslash', async () => {
    const path = writeZip('t.skill', { '\\evil.txt': strToU8('x') });
    await expect(readSkillBundle({ fsPath: path })).rejects.toSatisfy(
      (e: unknown) => e instanceof SkillBundleError && e.code === 'UNSAFE_ENTRY_NAME'
    );
  });

  it('rejects entry name with drive letter prefix (C:)', async () => {
    const path = writeZip('t.skill', { 'C:/windows/system32': strToU8('x') });
    await expect(readSkillBundle({ fsPath: path })).rejects.toSatisfy(
      (e: unknown) => e instanceof SkillBundleError && e.code === 'UNSAFE_ENTRY_NAME'
    );
  });

  it('rejects entry name with .. segment', async () => {
    const path = writeZip('t.skill', { 'a/../b': strToU8('x') });
    await expect(readSkillBundle({ fsPath: path })).rejects.toSatisfy(
      (e: unknown) => e instanceof SkillBundleError && e.code === 'UNSAFE_ENTRY_NAME'
    );
  });

  it('rejects entry name with .. as backslash segment', async () => {
    const path = writeZip('t.skill', { 'a\\..\\b': strToU8('x') });
    await expect(readSkillBundle({ fsPath: path })).rejects.toSatisfy(
      (e: unknown) => e instanceof SkillBundleError && e.code === 'UNSAFE_ENTRY_NAME'
    );
  });

  it('rejects entry name that is exactly ..', async () => {
    const path = writeZip('t.skill', { '..': strToU8('x') });
    await expect(readSkillBundle({ fsPath: path })).rejects.toSatisfy(
      (e: unknown) => e instanceof SkillBundleError && e.code === 'UNSAFE_ENTRY_NAME'
    );
  });

  it('accepts entry name notes..final.md', async () => {
    const path = writeZip('t.skill', { 'notes..final.md': strToU8('x') });
    await expect(readSkillBundle({ fsPath: path })).resolves.toBeDefined();
  });

  it('accepts entry name with multiple dots in segment v1..v2.diff', async () => {
    const path = writeZip('t.skill', { 'patches/v1..v2.diff': strToU8('x') });
    await expect(readSkillBundle({ fsPath: path })).resolves.toBeDefined();
  });

  it('accepts entry name with leading dot .hidden', async () => {
    const path = writeZip('t.skill', { '.hidden': strToU8('x') });
    await expect(readSkillBundle({ fsPath: path })).resolves.toBeDefined();
  });

  it('bundle.ts has no vscode import', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../../src/features/skillBundleEdit/bundle.ts'),
      'utf8'
    );
    expect(src, 'bundle.ts must not import vscode').not.toContain('vscode');
  });
});
