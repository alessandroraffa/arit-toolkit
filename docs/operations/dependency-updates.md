# Dependency Updates

How Dependabot pull requests are triaged, and why most of them are not merged
automatically.

## The queue has a hard ceiling

`.github/dependabot.yml` sets `open-pull-requests-limit: 10` for npm;
github-actions uses the default of 5. When either is full, **Dependabot cannot
open anything new — including security updates**. On 2026-09-05 both were exactly
at their limits, which silently suppressed new advisories for weeks.

Count them per ecosystem before assuming the backlog is only untidy:

```bash
gh pr list --state open --limit 50 --json headRefName \
  --jq '[.[]|select(.headRefName|startswith("dependabot/npm_and_yarn"))]|length'
```

## Close stale pull requests; do not rebase them

An old Dependabot PR proposes the version that was current when it was opened.
By the time you get to it, that version is usually superseded, so rebasing buys
an outdated dependency _and_ a conflict. Closing makes Dependabot recreate the
PR at the current version, with a clean diff, on the next weekly run.

Verify before closing:

```bash
npm view <package> version    # compare against the version the PR proposes
```

**Never close a PR that already targets the latest version** — Dependabot will
not recreate it until a newer release appears, so the update simply disappears
from view.

## What merges without review

`.github/workflows/dependabot-auto-merge.yml` merges a pull request only when
every one of these holds:

- it is an npm **dev** dependency update (`build(deps-dev):`);
- the update is **patch or minor**, taking the highest severity across a grouped
  update, and treating a `0.x` minor as breaking;
- no package in it appears in the denylist below;
- **CI has already finished successfully** — the workflow is triggered by CI
  completing, not by the pull request opening.

That last point is why GitHub's own auto-merge feature is not used. `main` has no
required status checks, and with none configured GitHub's auto-merge merges a
pull request as soon as it is opened, before CI has reported anything.

The decision logic lives in `scripts/dependabot/classify.mjs` — dependency-free
so the workflow runs it straight after checkout, and unit tested. Replayed
against the repository's own history it clears roughly one PR in six.

### Denylist, and why each entry is there

| Package                                                            | Reason                                              |
| ------------------------------------------------------------------ | --------------------------------------------------- |
| `esbuild`                                                          | produces the bundle that ships to users             |
| `typescript`                                                       | diagnostics and emit change between minors          |
| `@vscode/vsce`                                                     | packages and publishes the extension                |
| `@vscode/test-electron`                                            | pinned against a known VS Code host incompatibility |
| `semantic-release`, `semantic-release-vsce`, `@semantic-release/*` | decide versions and cut releases                    |
| `conventional-changelog-conventionalcommits`                       | drives versioning and the changelog                 |

GitHub Actions updates are excluded wholesale. They can modify `release.yml`,
and **no pull request ever exercises `release.yml`** — it runs only on pushes to
`main`. A green CI run says nothing about whether a bumped action still works
during a release, so those are reviewed and merged one at a time, watching the
next release.

## Security of the auto-merge workflow

The job holds a write token, so it checks out the **default branch**, never the
pull request head. It must only execute code that has already been reviewed and
merged; running the proposed code with a privileged token is the standard
`workflow_run` escalation, and the explicit `ref:` in the checkout step is what
prevents it.
