import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const BUNDLE_PATH = resolve(__dirname, '../../../dist/extension.js');

describe('skill-bundle bundling smoke tests', () => {
  let bundleContent: string;

  beforeAll(() => {
    if (!existsSync(BUNDLE_PATH)) {
      throw new Error(`Bundle not found at ${BUNDLE_PATH}. Run pnpm run build first.`);
    }
    bundleContent = readFileSync(BUNDLE_PATH, 'utf8');
  });

  it('should inline unzipSync from fflate', () => {
    expect(bundleContent).toContain('unzipSync');
  });

  it('should inline zipSync from fflate', () => {
    expect(bundleContent).toContain('zipSync');
  });

  it('should not externalize fflate', () => {
    expect(bundleContent).not.toContain('require("fflate")');
  });
});
