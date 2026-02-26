import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const DIST_DIR = resolve(__dirname, '../../../dist');
const BUNDLE_PATH = resolve(DIST_DIR, 'extension.js');

describe('bundle smoke tests', () => {
  let bundleContent: string;

  beforeAll(() => {
    if (!existsSync(BUNDLE_PATH)) {
      throw new Error(`Bundle not found at ${BUNDLE_PATH}. Run pnpm run build first.`);
    }
    bundleContent = readFileSync(BUNDLE_PATH, 'utf8');
  });

  it('should produce a non-empty bundle', () => {
    expect(bundleContent.length).toBeGreaterThan(0);
  });

  it('should export activate and deactivate functions', () => {
    expect(bundleContent).toContain('activate');
    expect(bundleContent).toContain('deactivate');
  });

  it('should not contain WASM loading references', () => {
    expect(bundleContent).not.toContain('tiktoken_bg.wasm');
    expect(bundleContent).not.toContain('WebAssembly.Module');
    expect(bundleContent).not.toContain('WebAssembly.Instance');
  });

  it('should contain js-tiktoken pure JS encoder', () => {
    expect(bundleContent).toContain('getEncoding');
    expect(bundleContent).toContain('Tiktoken');
  });

  it('should contain claude BPE ranks inlined as JSON', () => {
    // The claude.json ranks contain special tokens like <EOT>
    expect(bundleContent).toContain('<EOT>');
  });

  it('should externalise vscode (require, not inline)', () => {
    expect(bundleContent).toContain('require("vscode")');
  });

  it('should not have unresolved dynamic requires', () => {
    // readFileSync in the bundle would indicate runtime file loading
    // (e.g. tiktoken_bg.wasm), which should be inlined at build time
    expect(bundleContent).not.toContain('readFileSync');
  });

  it('should be CJS format', () => {
    expect(bundleContent).toContain('module.exports');
  });

  it('should have reasonable size (under 10MB)', () => {
    const sizeBytes = Buffer.byteLength(bundleContent, 'utf8');
    const sizeMB = sizeBytes / (1024 * 1024);
    expect(sizeMB).toBeLessThan(10);
  });
});
