/**
 * Pure decision logic for "is the published extension downloadable yet?".
 *
 * Kept free of I/O so it can be unit tested; `check.ts` performs the requests
 * and hands the results here.
 */

/** Surfaces that can be probed for availability. */
export type ProbeName =
  | 'vscode-cdn'
  | 'gallery-api'
  | 'item-page'
  | 'vsix-asset'
  | 'control'
  | 'github-release';

export interface ProbeResult {
  readonly name: ProbeName;
  /** Whether the surface resolved the extension at all. */
  readonly ok: boolean;
  /** Version the surface reports, when it reports one. */
  readonly version?: string;
  readonly detail?: string;
}

export type Verdict = 'available' | 'pending' | 'missing' | 'gallery-degraded';

export interface Assessment {
  readonly verdict: Verdict;
  readonly reason: string;
}

/**
 * Surfaces a VS Code client can actually install from, most authoritative
 * first. The web item page is included because it is the human-visible one,
 * but it is not required: it can lag behind the CDN after a publish.
 */
const CLIENT_FACING: readonly ProbeName[] = ['vscode-cdn', 'gallery-api', 'item-page'];

export function assessAvailability(
  results: readonly ProbeResult[],
  expectedVersion?: string
): Assessment {
  const control = results.find((r) => r.name === 'control');
  if (control && !control.ok) {
    return {
      verdict: 'gallery-degraded',
      reason:
        'The control extension does not resolve either, so the gallery itself is ' +
        'degraded. Nothing can be concluded about this extension right now.',
    };
  }

  const clientFacing = results.filter((r) => CLIENT_FACING.includes(r.name));
  const resolving = clientFacing.filter((r) => r.ok);

  if (resolving.length === 0) {
    const controlNote = control
      ? 'while the control extension resolves normally'
      : 'and no control extension was probed, so a gallery-wide outage is not excluded';
    return {
      verdict: 'missing',
      reason: `No client-facing surface resolves this extension, ${controlNote}.`,
    };
  }

  if (expectedVersion !== undefined) {
    const serving = resolving.filter((r) => r.version === expectedVersion);
    if (serving.length === 0) {
      const observed = resolving
        .map((r) => r.version)
        .filter((v): v is string => v !== undefined);
      const observedNote =
        observed.length > 0
          ? `still serving ${[...new Set(observed)].join(', ')}`
          : 'not reporting a version yet';
      return {
        verdict: 'pending',
        reason: `The extension resolves but ${expectedVersion} is not published yet — ${observedNote}.`,
      };
    }
    return {
      verdict: 'available',
      reason: `${expectedVersion} is served by ${serving.map((r) => r.name).join(', ')}.`,
    };
  }

  return {
    verdict: 'available',
    reason: `Resolved by ${resolving.map((r) => r.name).join(', ')}.`,
  };
}

export interface ProbeUrls {
  /** The gallery VS Code resolves through (product.json `extensionUrlTemplate`). */
  readonly vscodeCdn: string;
  /** Marketplace REST gallery used by `vsce` and by web clients. */
  readonly galleryApi: string;
  /** Human-visible marketplace page. */
  readonly itemPage: string;
  /** Publisher page — a sanity check that the publisher record still exists. */
  readonly publisherPage: string;
  /** Direct download of a specific version, when one is requested. */
  readonly vsixAsset?: string;
}

export function buildProbeUrls(
  publisher: string,
  name: string,
  version?: string
): ProbeUrls {
  const base: ProbeUrls = {
    vscodeCdn: `https://www.vscode-unpkg.net/_gallery/${publisher}/${name}/latest`,
    galleryApi:
      'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery',
    itemPage: `https://marketplace.visualstudio.com/items?itemName=${publisher}.${name}`,
    publisherPage: `https://marketplace.visualstudio.com/publishers/${publisher}`,
  };
  if (version === undefined) return base;
  return {
    ...base,
    vsixAsset:
      `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/` +
      `${publisher}/vsextensions/${name}/${version}/vspackage`,
  };
}
