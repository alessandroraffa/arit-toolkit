import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const BUNDLE_PATH = resolve(__dirname, '../../../dist/extension.js');

// These assertions verify that fflate is INLINED into the production bundle
// (not externalized). fflate becomes reachable once WS-0018 wires
// `registerSkillBundleEditFeature` into `src/extension.ts`, which transitively
// imports `bundle.ts` (the sole fflate consumer). The entry-splicing adapter
// uses `unzipSync` for the read path and hand-builds the writer, so `zipSync`
// is not expected in the bundle (see PLAN-004 Decision 2).
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

  it('should not externalize fflate', () => {
    expect(bundleContent).not.toContain('require("fflate")');
  });
});
