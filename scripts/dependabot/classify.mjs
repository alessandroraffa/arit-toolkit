/**
 * Decide whether a Dependabot pull request is safe to merge without review.
 *
 * Dependency-free ESM so the auto-merge workflow can run it straight after a
 * checkout, with no install step and no third-party action in the merge path.
 *
 * The policy is deliberately narrow: only npm **dev** dependencies, only patch
 * and minor bumps, and never anything that decides how the extension is built,
 * versioned or published. Everything else stays in front of a human.
 */

/**
 * Packages excluded regardless of update size.
 *
 * Each one can break the shipped artifact or the release itself in ways CI does
 * not observe — `release.yml` only ever runs on pushes to main, so no pull
 * request exercises it.
 */
const DENYLIST = [
  /^esbuild$/, // produces the bundle that ships to users
  /^typescript$/, // compiler diagnostics and emit change between minors
  /^@vscode\/vsce$/, // packages and publishes the extension
  /^@vscode\/test-electron$/, // pinned against a known VS Code host incompatibility
  /^semantic-release$/, // decides versions and cuts releases
  /^semantic-release-vsce$/,
  /^@semantic-release\//,
  /^conventional-changelog-conventionalcommits$/, // drives versioning and changelog
];

const SEVERITY = { patch: 0, minor: 1, major: 2, unknown: 3 };

/** Parse `1.2.3` / `v1.2.3` / `4` into numeric parts, or null when unparseable. */
function parseVersion(raw) {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(raw.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
  };
}

/**
 * Classify a single from/to pair.
 *
 * A `0.x` minor bump counts as major: semver allows breaking changes there, and
 * treating it as minor is how a breaking update slips through unreviewed.
 */
function updateTypeFor(fromRaw, toRaw) {
  const from = parseVersion(fromRaw);
  const to = parseVersion(toRaw);
  if (!from || !to) return 'unknown';
  if (from.major !== to.major) return 'major';
  if (from.major === 0 && from.minor !== to.minor) return 'major';
  if (from.minor !== to.minor) return 'minor';
  if (from.patch !== to.patch) return 'patch';
  return 'patch';
}

/** Extract every `package from A to B` triple Dependabot states in the body. */
function extractUpdates(body) {
  const updates = [];
  const patterns = [
    /Updates\s+`([^`]+)`\s+from\s+(\S+)\s+to\s+(\S+)/g,
    /Bumps\s+\[([^\]]+)\]\([^)]*\)\s+from\s+(\S+)\s+to\s+(\S+)/g,
    /Bumps\s+`?([@\w./-]+)`?\s+from\s+(\S+)\s+to\s+(\S+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) {
      const name = match[1];
      if (updates.some((u) => u.name === name)) continue;
      updates.push({
        name,
        updateType: updateTypeFor(match[2], match[3].replace(/[.,]$/, '')),
      });
    }
  }
  return updates;
}

function ineligible(reason, updateType, packages) {
  return { eligible: false, reason, updateType, packages };
}

export function classifyDependabotUpdate({ title, body }) {
  if (/^ci\(deps\)/.test(title)) {
    return ineligible(
      'GitHub Actions updates are reviewed by hand: they can change release.yml, ' +
        'which no pull request ever exercises.',
      'unknown',
      []
    );
  }
  if (!/^build\(deps-dev\)/.test(title)) {
    return ineligible(
      'Only npm dev dependencies auto-merge; this is not a build(deps-dev) update.',
      'unknown',
      []
    );
  }

  const updates = extractUpdates(body);
  const packages = updates.map((u) => u.name);
  if (updates.length === 0) {
    return ineligible('No version pair could be parsed from the pull request body.', 'unknown', []);
  }

  const updateType = updates
    .map((u) => u.updateType)
    .reduce((worst, next) => (SEVERITY[next] > SEVERITY[worst] ? next : worst), 'patch');

  const denied = packages.find((name) => DENYLIST.some((rule) => rule.test(name)));
  if (denied !== undefined) {
    return ineligible(
      `${denied} decides how the extension is built, versioned or published, so it is reviewed by hand.`,
      updateType,
      packages
    );
  }

  if (updateType !== 'patch' && updateType !== 'minor') {
    return ineligible(
      `Update type is ${updateType}; only patch and minor auto-merge.`,
      updateType,
      packages
    );
  }

  return {
    eligible: true,
    reason: `${updateType} update of dev dependencies: ${packages.join(', ')}.`,
    updateType,
    packages,
  };
}
