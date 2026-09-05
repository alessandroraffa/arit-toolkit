import { describe, it, expect } from 'vitest';
import {
  assessAvailability,
  buildProbeUrls,
} from '../../../scripts/marketplace-availability/verdict';
import type { ProbeResult } from '../../../scripts/marketplace-availability/verdict';

function result(partial: Partial<ProbeResult> & Pick<ProbeResult, 'name'>): ProbeResult {
  return { ok: true, ...partial };
}

describe('assessAvailability', () => {
  it('should report available when the client-facing surfaces serve the expected version', () => {
    const assessment = assessAvailability(
      [
        result({ name: 'vscode-cdn', version: '2.11.2' }),
        result({ name: 'gallery-api', version: '2.11.2' }),
        result({ name: 'control' }),
      ],
      '2.11.2'
    );

    expect(assessment.verdict).toBe('available');
  });

  it('should report pending when the extension is healthy but still on the previous version', () => {
    const assessment = assessAvailability(
      [
        result({ name: 'vscode-cdn', version: '2.11.1' }),
        result({ name: 'gallery-api', version: '2.11.1' }),
        result({ name: 'control' }),
      ],
      '2.11.2'
    );

    expect(assessment.verdict).toBe('pending');
    expect(assessment.reason).toContain('2.11.1');
  });

  it('should report missing when no client-facing surface resolves but the control does', () => {
    const assessment = assessAvailability([
      result({ name: 'vscode-cdn', ok: false }),
      result({ name: 'gallery-api', ok: false }),
      result({ name: 'item-page', ok: false }),
      result({ name: 'control' }),
    ]);

    expect(assessment.verdict).toBe('missing');
  });

  it('should report gallery-degraded when the control extension also fails to resolve', () => {
    const assessment = assessAvailability([
      result({ name: 'vscode-cdn', ok: false }),
      result({ name: 'gallery-api', ok: false }),
      result({ name: 'control', ok: false }),
    ]);

    expect(assessment.verdict).toBe('gallery-degraded');
  });

  it('should treat the control as inconclusive rather than healthy when it was not run', () => {
    const assessment = assessAvailability([
      result({ name: 'vscode-cdn', ok: false }),
      result({ name: 'gallery-api', ok: false }),
    ]);

    expect(assessment.verdict).toBe('missing');
    expect(assessment.reason).toContain('no control');
  });

  it('should report available with no expected version when the surfaces resolve', () => {
    const assessment = assessAvailability([
      result({ name: 'vscode-cdn', version: '2.11.1' }),
      result({ name: 'gallery-api', version: '2.11.1' }),
      result({ name: 'control' }),
    ]);

    expect(assessment.verdict).toBe('available');
  });

  it('should still report available when only the CDN clients use has the version', () => {
    // The web item page lags behind the CDN; clients can already download.
    const assessment = assessAvailability(
      [
        result({ name: 'vscode-cdn', version: '2.11.2' }),
        result({ name: 'gallery-api', ok: false }),
        result({ name: 'item-page', ok: false }),
        result({ name: 'control' }),
      ],
      '2.11.2'
    );

    expect(assessment.verdict).toBe('available');
  });
});

describe('buildProbeUrls', () => {
  const urls = buildProbeUrls('alessandroraffa', 'tangyr', '2.11.2');

  it('should target the CDN gallery VS Code resolves through', () => {
    expect(urls.vscodeCdn).toBe(
      'https://www.vscode-unpkg.net/_gallery/alessandroraffa/tangyr/latest'
    );
  });

  it('should target the marketplace item page', () => {
    expect(urls.itemPage).toBe(
      'https://marketplace.visualstudio.com/items?itemName=alessandroraffa.tangyr'
    );
  });

  it('should target the versioned vsix asset', () => {
    expect(urls.vsixAsset).toBe(
      'https://marketplace.visualstudio.com/_apis/public/gallery/publishers/alessandroraffa/vsextensions/tangyr/2.11.2/vspackage'
    );
  });

  it('should omit the vsix asset when no version is requested', () => {
    expect(buildProbeUrls('alessandroraffa', 'tangyr').vsixAsset).toBeUndefined();
  });
});
