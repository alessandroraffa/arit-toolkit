import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';

const DIST_DIR = resolve(__dirname, '../../../dist');
const BUNDLE_PATH = resolve(DIST_DIR, 'extension.js');

/**
 * Verify the build output is self-contained and has no
 * missing runtime assets. This catches issues where esbuild
 * bundles JS but misses binary/WASM/native dependencies.
 */
describe('bundle asset verification', () => {
  let bundleContent: string;

  beforeAll(() => {
    if (!existsSync(BUNDLE_PATH)) {
      throw new Error(`Bundle not found at ${BUNDLE_PATH}. Run pnpm run build first.`);
    }
    bundleContent = readFileSync(BUNDLE_PATH, 'utf8');
  });

  it('should not reference .wasm files', () => {
    expect(bundleContent).not.toMatch(/\.wasm/);
  });

  it('should not reference .node native addons', () => {
    expect(bundleContent).not.toMatch(/\.node["']/);
  });

  it('should not use dynamic fs.readFileSync for asset loading', () => {
    // A bundled extension should not need to read files from disk
    // at runtime (except vscode API which is external)
    expect(bundleContent).not.toContain('readFileSync');
  });

  it('should not reference __dirname for asset resolution', () => {
    // __dirname in a bundle often means a runtime dependency is
    // trying to locate a file relative to itself — a red flag
    // Allow: 1 occurrence is acceptable for esbuild's own shim
    const matches = bundleContent.match(/__dirname/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  it('should have only extension.js in dist (no sidecar files needed)', () => {
    const files = readdirSync(DIST_DIR);
    const nonMapFiles = files.filter((f) => !f.endsWith('.map'));
    expect(nonMapFiles).toEqual(['extension.js']);
  });

  it('should not contain require("path") for asset path building', () => {
    // path.join(__dirname, "some.wasm") is the classic WASM-loading pattern
    // If present, it indicates an un-bundled native dependency
    const pathJoinPattern = /path\d*\.join\([^)]*__dirname/;
    expect(bundleContent).not.toMatch(pathJoinPattern);
  });

  it('should only have "vscode" and node built-ins as external requires', () => {
    // Node built-ins are legitimate externals for a VS Code extension
    const NODE_BUILTINS = new Set([
      'assert',
      'buffer',
      'child_process',
      'crypto',
      'events',
      'fs',
      'http',
      'https',
      'net',
      'os',
      'path',
      'stream',
      'string_decoder',
      'url',
      'util',
      'worker_threads',
      'zlib',
    ]);
    const isNodeBuiltin = (m: string): boolean =>
      NODE_BUILTINS.has(m) || NODE_BUILTINS.has(m.replace('node:', ''));
    const requireCalls = bundleContent.match(/require\("([^.][^"]+)"\)/g) ?? [];
    const externalModules = requireCalls
      .map((r) => r.replace(/require\("(.+)"\)/, '$1'))
      .filter((m) => !m.startsWith('.'));
    const unique = [...new Set(externalModules)];
    const nonNodeExternals = unique.filter((m) => !isNodeBuiltin(m));
    expect(nonNodeExternals).toEqual(['vscode']);
  });
});
