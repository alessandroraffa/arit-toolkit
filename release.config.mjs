/**
 * semantic-release configuration.
 *
 * Replaces .releaserc.json so that Marketplace publishing can be switched off
 * without abandoning releases altogether.
 *
 * Why that matters: semantic-release-vsce verifies the Marketplace personal
 * access token in `verifyConditions`, the first step of the run. When that
 * verification fails the entire release aborts before a single commit is
 * analysed — no tag, no GitHub release, no .vsix asset, no checksum. A
 * Marketplace-side problem therefore takes the GitHub release channel down with
 * it, which is exactly when users need that channel most.
 *
 * Setting `publish: false` on the plugin avoids this: its verify step guards the
 * whole token check behind `if (pluginConfig?.publish !== false)`, and its
 * publish step returns early after packaging. The .vsix is still built and still
 * uploaded to the GitHub release by @semantic-release/github.
 *
 * Which registries a release goes to is decided the way the plugin itself
 * decides it: by whether that registry's token is present in the environment.
 * `isVscePublishEnabled()` is `!!VSCE_PAT` and `isOvsxPublishEnabled()` is
 * `!!OVSX_PAT`, both read straight from the environment, so mirroring that rule
 * here is the only way the master switch below cannot disagree with the
 * plugin's own per-registry decision.
 *
 * .github/workflows/release.yml passes VSCE_PAT only when the repository
 * variable VSCE_PUBLISH is the string "true", and passes OVSX_PAT whenever the
 * secret exists. So:
 *
 *   neither token   -> package only; tag, GitHub release, .vsix and checksum
 *   OVSX_PAT only   -> also publishes to Open VSX; the Marketplace is skipped
 *                      with a log line, not attempted and failed
 *   both            -> publishes to both
 *
 * The Publisher Agreement anticipates this: section 14(d), "No Exclusivity",
 * says nothing in it restricts the publisher "from entering into other, similar
 * agreements with other marketplaces", and section 3(b) records that the
 * publisher, not Microsoft, is the distributor.
 *
 * Note that `publish` must be false when no token at all is present: the
 * plugin throws ENOPAT if publishing is enabled and it finds neither.
 */

const marketplacePublishEnabled = Boolean(process.env.VSCE_PAT);
const openVsxPublishEnabled = Boolean(process.env.OVSX_PAT);
const publishEnabled = marketplacePublishEnabled || openVsxPublishEnabled;

export default {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { breaking: true, release: 'major' },
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'refactor', release: 'patch' },
          { type: 'docs', release: false },
          { type: 'style', release: false },
          { type: 'chore', release: false },
          { type: 'test', release: false },
          { type: 'build', release: false },
          { type: 'ci', release: false },
        ],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: {
          types: [
            { type: 'feat', section: 'Features' },
            { type: 'fix', section: 'Bug Fixes' },
            { type: 'perf', section: 'Performance Improvements' },
            { type: 'refactor', section: 'Code Refactoring' },
            { type: 'docs', section: 'Documentation', hidden: true },
            { type: 'style', section: 'Styles', hidden: true },
            { type: 'chore', section: 'Miscellaneous', hidden: true },
            { type: 'test', section: 'Tests', hidden: true },
            { type: 'build', section: 'Build System', hidden: true },
            { type: 'ci', section: 'CI', hidden: true },
          ],
        },
      },
    ],
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
    ['@semantic-release/npm', { npmPublish: false }],
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'node scripts/update-version-code.mjs',
        publishCmd: 'node scripts/write-checksum.mjs',
      },
    ],
    [
      'semantic-release-vsce',
      {
        packageVsix: true,
        publish: publishEnabled,
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: [
          { path: '*.vsix', label: 'VS Code Extension' },
          { path: '*.vsix.sha256', label: 'SHA-256 checksum' },
        ],
        // A failed release is already visible as a red workflow run. Opening an
        // issue for it adds noise, and the attempt itself has been failing on
        // label creation, turning one error into two. The `*Condition: false`
        // spelling is the supported one; `failComment`/`successComment` set to
        // false still work but are deprecated.
        failCommentCondition: false,
        successCommentCondition: false,
      },
    ],
  ],
};
