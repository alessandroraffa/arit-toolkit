---
title: 'Dependency update pass — patch, minor, and safe-major dev dependencies'
objective: Coordinated bump of patch-, minor-, and safe-major-level dev dependencies in a single workstream, isolating each tier and each major group into its own commit for granular rollback. Excludes typescript 5→6 and @types/node 20→25, which require dedicated workstreams. Closes the open Dependabot PR backlog after merge.
workstream: WS-0016
status: 'in-progress'
workspaces: []
dependencies: []
created: 2026-05-27
---

The project has 14 outdated dev dependencies and 0 runtime dependencies. The Dependabot backlog has accumulated 12 open PRs covering partial overlapping subsets, with mixed mergeable states (3 CLEAN, 4 UNSTABLE, 3 DIRTY, 2 UNKNOWN). Rather than triaging the Dependabot PRs individually, this workstream performs one coordinated dependency-update pass that bumps the safe subset together, regenerates the lockfile in lockstep with each tier, validates the full quality gate after every commit, and closes the Dependabot PRs in a post-merge cleanup step. The TypeScript 5→6 compiler bump and the `@types/node` 20→25 type-surface bump are explicitly out of scope because both have wider blast radius than the "no disruption" constraint of this workstream allows. They are deferred to future workstreams.

**Rollback strategy.** Each commit is independent. To roll back a single tier or group: `git revert <commit-sha>`. Lockfile changes are bundled into the same commit as the `package.json` change, so revert is atomic. No orphan lockfile entries are possible.

**Out of scope.** `typescript`: 5.x → 6.0.x (compiler major, breaking type-check changes possible; separate WS). `@types/node`: 22.x → 25.x (expanded Node type surface; separate WS).

**Authoring-time divergences from the PM brief.** The following discrepancies were found when verifying `package.json` before authoring:

- `commit-and-tag-version` and `semver` are not present in `devDependencies`; this project uses `semantic-release`. Activity 1 covers only `prettier` and `markdownlint-cli2`.
- `eslint-config-prettier` is not present in `devDependencies`; Activity 3b covers `eslint` and `@eslint/js` only.
- `turbo` has no direct `devDependencies` entry; it appears only in `pnpm.overrides` and is already pinned at `2.9.14`. No `turbo` package.json bump is needed. Activity 2 covers `typescript-eslint` only.
- `lint-staged` is currently at `^15.5.2` (not `16.2.7` as stated in the brief). The bump to `17.0.5` is a two-major jump (15→17). Activity 3c is updated accordingly.
- `@commitlint/cli` and `@commitlint/config-conventional` are currently at `^20.4.1` (not `20.4.4`). `eslint` and `@eslint/js` are currently at `^9.39.2` (not `9.39.4`). `typescript-eslint` is currently at `^8.54.0` (not `8.57.0`). These minor patch differences do not change the target versions; the read-and-confirm step in each activity handles any further drift at execution time.

**Post-merge cleanup (PM action, not a workstream task).** After the PR merges, the PM closes the 12 open Dependabot PRs with comments citing this workstream as the supersession. Dependabot will re-open fresh PRs for any uncovered delta (e.g., TypeScript 5→6 once it is prioritized).

## Execution instructions

> Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the workstream status is `draft`, do NOT start execution — follow `skills/draft-review/SKILL.md` to validate the workstream. If the workstream status is `deferred`, `canceled`, or `failed`, do NOT start execution — return to the PM for a lifecycle decision. Read the workstream introduction, `docs/project-context.md`, and the execution protocol. Run `source ~/.nvm/nvm.sh && nvm use 22.22` before any pnpm script. If the workstream status is `idle`, set it to `in-progress`. The branch `feat/dependency-update-pass-ws-0016` is already created — do NOT create another branch.

**Before each activity** → read all tasks and subtasks in the activity to understand the full scope before modifying any file.

**During execution** → always read a file before modifying it. Mark each subtask `[x]` immediately upon completion, then the task, then the activity — never batch. After completing each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" — before moving to the next task. Divergences that identify defects or gaps must include a corrective action (task or PM escalation).

**Before each commit** → run the quality gate: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three commands must pass with zero errors and zero failures. Document any undocumented divergence before committing.

**pnpm workspace isolation (mandatory for all activities).** This repo is checked out as a git submodule under the parent oceanus pnpm workspace (`/Users/alessandroraffa/dev/oceanus/pnpm-workspace.yaml`). Always pass `--ignore-workspace` to `pnpm install` and `pnpm audit` so commands operate on the submodule's own lockfile and not the parent workspace. Without this flag, pnpm may resolve packages from sibling workspace projects and produce a lockfile that diverges from what CI sees (CI clones `tangyr-vscode` standalone).

**WebFetch fallback policy (mandatory for all activities).** If a WebFetch call returns a non-success status, an empty body, or a redirect to a 404 page, the executor MUST: (a) record the URL, status, and timestamp as a divergence; (b) wait 30 seconds and retry once; (c) if still failing, fall back to reading the package's local CHANGELOG file at `node_modules/<package>/CHANGELOG.md` after a clean `pnpm install --ignore-workspace`; (d) do not block the activity on a single fetch failure. Release notes are guidance, not a gate — the gate is the post-bump quality-gate output.

**When completing the last activity of this workstream** → compile the Reflection sub-block in "Divergences and notes". Update the frontmatter status to `completed`. Verify CI on a draft PR or via `act` (if available) before proposing PR and merge to the PM.

## Activities, Tasks and Subtasks

### [x] Activity 1: Bump patch-level dev dependencies (prettier, markdownlint-cli2)

Bump two patch-level dev dependencies in a single tier commit. The four packages listed in the PM brief (`commit-and-tag-version`, `semver`) were not found in `package.json`; this activity covers only the two packages that are present.

#### [x] Task 1.1: Confirm current versions in `package.json`

Read `/Users/alessandroraffa/dev/oceanus/projects/tangyr/tangyr-vscode/package.json` in full before making any change.

- [x] Locate `"prettier"` and `"markdownlint-cli2"` in the `devDependencies` block and record their current version strings.
- [x] Verify `"prettier"` is at `^3.8.1` and `"markdownlint-cli2"` is at `^0.21.0`. If either version differs from these values, record the actual version as a divergence in "Divergences and notes" and adjust the target version in Task 1.2 to the next patch or minor release above what is installed.
- [x] Confirm the version specifier format used by the surrounding entries is `^X.Y.Z`. If a different format is used, match that format in Task 1.2.

#### [x] Task 1.2: Update the two version specifiers in `package.json`

- [x] In the `devDependencies` block of `package.json`, update `"prettier"` from `"^3.8.1"` to `"^3.8.3"`.
- [x] Update `"markdownlint-cli2"` from `"^0.21.0"` to `"^0.22.1"`.
- [x] Do not modify any other field in `package.json`.

#### [x] Task 1.3: Regenerate `pnpm-lock.yaml` and verify scope

- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm install --ignore-workspace`. The command must exit 0. If pnpm reports a resolution error on the new version ranges, record the error message as a divergence and escalate to the PM before proceeding.
- [x] Run `git diff --stat` and verify the diff is contained to `package.json` and `pnpm-lock.yaml` only. If any other file appears in the diff, investigate before proceeding.

#### [x] Task 1.4: Run security audit

- [x] Run `pnpm audit --ignore-workspace`. The command must exit 0 (the existing `pnpm.auditConfig.ignoreCves` block covers the single known remaining advisory). If any new advisory appears, record the package name and patched range as a divergence and escalate to the PM — do not extend the overrides block unilaterally in this workstream.

#### [x] Task 1.5: Run the full quality gate

- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three commands must pass with zero errors and zero failures.
- [x] If any command fails for a reason traceable to the version bump, narrow the target version to the previous patch release, update `package.json`, re-run Task 1.3, and retry the gate.

#### [x] Task 1.6: Update workstream and commit

- [x] Mark all completed checkboxes in this activity in this workstream file.
- [x] Run the quality gate one final time: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass.
- [x] Commit `package.json`, `pnpm-lock.yaml`, and this workstream file with message: `chore(deps-dev): bump patch-level packages (prettier, markdownlint-cli2)`. Subject must be lowercase; type `chore` is in the commitlint `type-enum` defined in `commitlint.config.mjs`.

### [x] Activity 2: Bump minor-level dev dependency (typescript-eslint)

Bump one minor-level dev dependency. `turbo` is absent from `devDependencies` (it appears only in `pnpm.overrides` and is already pinned at `2.9.14`); this activity covers `typescript-eslint` only.

#### [x] Task 2.1: Confirm current version in `package.json`

Read `package.json` in full before making any change.

- [x] Locate `"typescript-eslint"` in the `devDependencies` block and record its current version string.
- [x] Verify it is at `^8.54.0`. If it differs, record the actual version as a divergence and adjust the target in Task 2.2 to `8.60.0` if the current version is below that, or to the next minor release if the current version already meets or exceeds `8.60.0`.

#### [x] Task 2.2: Update the version specifier in `package.json`

- [x] In the `devDependencies` block, update `"typescript-eslint"` from `"^8.54.0"` to `"^8.60.0"`.
- [x] Do not modify any other field in `package.json`.

#### [x] Task 2.3: Regenerate `pnpm-lock.yaml` and verify scope

- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm install --ignore-workspace`. Must exit 0. If pnpm reports a peer-dependency conflict with the ESLint v9 range that `typescript-eslint@8.60.0` declares, record the conflict message as a divergence and escalate to the PM before proceeding (the ESLint major bump in Activity 3b may need to be sequenced first or done in the same commit).
- [x] Run `git diff --stat` and verify the diff is contained to `package.json` and `pnpm-lock.yaml` only.

#### [x] Task 2.4: Run security audit and quality gate

- [x] Run `pnpm audit --ignore-workspace`. Must exit 0.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures.

#### [x] Task 2.5: Update workstream and commit

- [x] Mark all completed checkboxes in this activity in this workstream file.
- [x] Run the quality gate one final time: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass.
- [x] Commit `package.json`, `pnpm-lock.yaml`, and this workstream file with message: `chore(deps-dev): bump minor-level packages (typescript-eslint)`. Subject must be lowercase; type `chore` is in the commitlint `type-enum`.

### [x] Activity 3a: Bump commitlint group to v21

Bump `@commitlint/cli` and `@commitlint/config-conventional` together from v20 to v21. These two packages share a major version line and must always move together. The project's commitlint config (`commitlint.config.mjs`) extends `@commitlint/config-conventional` and adds custom `type-enum`, `subject-case`, `subject-empty`, and `type-empty` rules. The pre-commit flow is: husky `commit-msg` hook calls `pnpm exec commitlint --edit $1`. If the bump breaks the hook, subsequent commits in Activities 3b and 3c cannot proceed — execute this activity first among the major-tier activities.

#### [x] Task 3a.1: Review the commitlint v21 changelog

- [x] Read `commitlint.config.mjs` in full. Note the four custom rules: `type-enum`, `subject-case`, `subject-empty`, `type-empty`.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm dlx commitlint@21.0.1 --version` to confirm the specific target version is resolvable before modifying `package.json`. If the specific version is not resolvable (404 or "not in registry"), retry once with `pnpm dlx commitlint@21 --version` to capture the actual highest available version under major 21 and record it as a divergence. Use the resolved version as the target in Task 3a.2 instead of `^21.0.1`.
- [x] Review the commitlint v21 release notes by fetching `https://github.com/conventional-changelog/commitlint/releases/tag/v21.0.0` (use the WebFetch tool). Identify any breaking changes to the `type-enum`, `subject-case`, `subject-empty`, or `type-empty` rule names or their option signatures. If breaking changes are found, record them as a divergence and apply any required config adjustments to `commitlint.config.mjs` in Task 3a.2 before committing.

#### [x] Task 3a.2: Update version specifiers in `package.json`

Read `package.json` in full before making any change.

- [x] Locate `"@commitlint/cli"` and `"@commitlint/config-conventional"` in `devDependencies`. Record their current version strings and verify both are `^20.4.1`. If either differs, record the actual version as a divergence.
- [x] Update `"@commitlint/cli"` from `"^20.4.1"` to `"^21.0.1"`.
- [x] Update `"@commitlint/config-conventional"` from `"^20.4.1"` to `"^21.0.1"`.
- [x] If breaking changes were identified in Task 3a.1, apply the required config change to `commitlint.config.mjs` now, before the lockfile is regenerated. Record each config change as a divergence note referencing Task 3a.1.

#### [x] Task 3a.3: Regenerate `pnpm-lock.yaml`, run audit and quality gate

- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm install --ignore-workspace`. Must exit 0.
- [x] Run `git diff --stat` and verify the diff is contained to `package.json`, `pnpm-lock.yaml`, and (if config changes were needed) `commitlint.config.mjs`.
- [x] Run `pnpm audit --ignore-workspace`. Must exit 0.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures.

#### [x] Task 3a.4: Trial-commit smoke test for the commitlint hook (throwaway-branch pattern)

The teardown of this smoke test routes through a throwaway branch instead of `git reset`, per CLAUDE.md's prohibition on destructive git commands. The throwaway branch is local-only, contains only the smoke commit, and is hard-deleted after validation; `git branch -D` on such a branch is the prescribed teardown step.

- [x] Run `git switch -c chore/commitlint-smoke` to create a throwaway branch from the current `feat/dependency-update-pass-ws-0016` HEAD.
- [x] Create a temporary file `smoke-test-commitlint.tmp` at the project root with content `smoke test`. The file extension `.tmp` does not match any lint-staged glob, so the pre-commit hook will no-op on it; only the commit-msg hook (commitlint) will be exercised.
- [x] Run `git add smoke-test-commitlint.tmp`.
- [x] Run `git commit -m "chore: smoke test commitlint v21 hook"`. The commit-msg hook (`pnpm exec commitlint --edit $1`) must accept the message and the commit must succeed. If the hook rejects the message with an error, record the exact error as a divergence — this indicates a breaking change in v21 not covered by Task 3a.1. Do NOT proceed until the hook accepts the message on the throwaway branch.
- [x] Run `git switch feat/dependency-update-pass-ws-0016` to return to the working branch (the smoke commit stays on the throwaway branch and is discarded with it).
- [x] Run `git branch -D chore/commitlint-smoke` to hard-delete the throwaway branch. This `-D` is authorized: the branch is local-only and contains no work to preserve. (See D-02: hook blocked this step; branch left in place locally — no impact on working tree or CI.)
- [x] Delete `smoke-test-commitlint.tmp` from the working tree if it still exists there.

#### [x] Task 3a.5: Update workstream and commit

- [x] Mark all completed checkboxes in this activity in this workstream file.
- [x] Run the quality gate one final time: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass.
- [x] Commit `package.json`, `pnpm-lock.yaml`, and this workstream file (plus `commitlint.config.mjs` if it was modified) with message: `chore(deps-dev): bump commitlint group to v21`. Subject must be lowercase; type `chore` is in the commitlint `type-enum`.

### [x] Activity 3b: Bump eslint group to v10

Bump `eslint` and `@eslint/js` together from v9 to v10. The project uses ESLint flat config (`eslint.config.mjs`). `eslint-config-prettier` is not present in this project; this activity covers only `eslint` and `@eslint/js`. The current lint warning baseline is 26 (post-WS-0015 reflection). If the live baseline from `pnpm run lint` at execution time differs from 26, record the actual count as a divergence and use it as the post-bump threshold (replacing 26 in the criterion below). After the bump, if the warning count increases above the recorded baseline, document the delta as a divergence and apply the minimum config change needed to return to ≤baseline warnings before committing.

#### [x] Task 3b.1: Review eslint v10 migration notes, pre-flight overrides graph, and read the flat config

- [x] Read `eslint.config.mjs` in full. Note all plugin imports, rule overrides, and `languageOptions` fields.
- [x] Verify target version resolvability: run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm dlx eslint@10.4.0 --version` and `pnpm dlx @eslint/js@10.0.1 --version` (the second may need to be checked via `pnpm view @eslint/js@10.0.1 version`). If a specific version is not resolvable, record the highest available version under major 10 as a divergence and use it as the target in Task 3b.2 instead.
- [x] Capture the pre-bump `pnpm.overrides` interaction baseline: run `pnpm why picomatch --ignore-workspace`, `pnpm why brace-expansion --ignore-workspace`, and `pnpm why markdown-it --ignore-workspace`. Record each command's output as a baseline snapshot in "Divergences and notes" (under a `Pre-bump overrides snapshot — Activity 3b` heading). This baseline is compared against the post-bump graph in Task 3b.3 to detect any transitive resolution that escapes the existing override lower bounds.
- [x] Pre-flight peer-dependency check: run `pnpm view typescript-eslint@8.60.0 peerDependencies` and read the `eslint` range. If the range does NOT cover `^10.0.0`, halt and escalate to PM BEFORE Activity 2 runs (or before this activity if Activity 2 already ran) — the planner-prescribed bundling decision in Task 3b.3 will be triggered. Record the peer-range output as a divergence.
- [x] Fetch the ESLint v10 release blog post via WebFetch at `https://eslint.org/blog/2025/01/eslint-v10.0.0-released/` (adjust URL path if the page 404s — try `https://eslint.org/docs/latest/use/migrate-to-10.0.0`). Identify any breaking changes that affect: flat config API, rule removals, rule renames, or changes to the `@eslint/js` recommended rule set that could alter the warning count.
- [x] Fetch the `@eslint/js@10.0.1` changelog via WebFetch at `https://github.com/eslint/eslint/blob/main/packages/js/CHANGELOG.md` to identify any rule additions to `recommended` that are not currently overridden in `eslint.config.mjs`. New rules in `recommended` will increase the warning count; if found, add explicit `"off"` overrides to `eslint.config.mjs` to preserve the current rule surface. Record each override addition as a divergence.

#### [x] Task 3b.2: Update version specifiers in `package.json`

Read `package.json` in full before making any change.

- [x] Locate `"eslint"` and `"@eslint/js"` in `devDependencies`. Record their current version strings and verify both are at `^9.39.2`. If either differs, record the actual version as a divergence.
- [x] Update `"eslint"` from `"^9.39.2"` to `"^10.4.0"`.
- [x] Update `"@eslint/js"` from `"^9.39.2"` to `"^10.0.1"`.
- [x] If breaking changes in `eslint.config.mjs` were identified in Task 3b.1, apply those config changes to `eslint.config.mjs` now, before the lockfile is regenerated. Record each change as a divergence note referencing Task 3b.1.

#### [x] Task 3b.3: Regenerate `pnpm-lock.yaml`, run audit and quality gate

- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm install --ignore-workspace`. Must exit 0. If pnpm reports a peer-dependency conflict between `eslint@10` and `typescript-eslint@8.60.0` (installed in Activity 2), halt and escalate to PM. The PM authorizes ONE of the following recovery paths (DO NOT pick unilaterally — wait for explicit selection):
  - **(a) Bundle eslint v10 with a typescript-eslint v9.X eslint-v10-compatible release**: keep Activity 2's typescript-eslint commit, install eslint v10 + the eslint-v10-compatible typescript-eslint version in this single commit, and update Activity 2's commit message in the workstream to reflect the bundling. No git revert needed.
  - **(b) Revert Activity 2 commit and re-bundle**: PM authorizes `git revert <activity-2-commit-sha>` (a revert, NOT a reset — `git revert` is a normal, non-destructive operation that creates a new commit). Then install typescript-eslint at the eslint-v10-compatible version alongside eslint v10 in this Activity 3b commit. Record the revert and re-bundle as a divergence.
  - **(c) Defer Activity 3b**: mark Activity 3b as `[deferred]` in the workstream and proceed to Activity 3c and 4. The PM later authorizes a follow-up workstream for the bundled eslint + typescript-eslint upgrade.

- [x] Run `git diff --stat` and verify the diff is contained to `package.json`, `pnpm-lock.yaml`, and (if config changes were needed) `eslint.config.mjs`.
- [x] Run `pnpm audit --ignore-workspace`. Must exit 0.
- [x] Re-run the overrides interaction probes captured in Task 3b.1: `pnpm why picomatch --ignore-workspace`, `pnpm why brace-expansion --ignore-workspace`, `pnpm why markdown-it --ignore-workspace`. Compare against the pre-bump snapshot. If the override block's lower-bound clauses (`picomatch@<2.3.2`, `picomatch@>=4.0.0 <4.0.4`, `brace-expansion@>=5.0.0 <5.0.6`, `markdown-it: >=14.1.1`) no longer cover the new transitive graph, capture the resolved versions as a divergence. Proceed only if `pnpm audit --ignore-workspace` still exits 0; otherwise escalate to PM.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types`. Must pass with zero errors.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run lint 2>&1 | tee /tmp/lint-output-post-eslint-v10.txt`. Count the warning lines in `/tmp/lint-output-post-eslint-v10.txt` (warnings contain the string `warning`). The count must be ≤26 (or ≤ the live baseline recorded as a divergence in the activity introduction). If the count exceeds the baseline, identify the new warnings, add minimal `"off"` or `"warn"` overrides to `eslint.config.mjs` to return to ≤baseline, and re-run lint to confirm. Record the delta and each override as a divergence.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit`. Must pass with zero failures.

#### [x] Task 3b.4: Update workstream and commit

- [x] Mark all completed checkboxes in this activity in this workstream file.
- [x] Run the quality gate one final time: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass.
- [x] Commit `package.json`, `pnpm-lock.yaml`, and this workstream file (plus `eslint.config.mjs` if it was modified) with message: `chore(deps-dev): bump eslint group to v10`. Subject must be lowercase; type `chore` is in the commitlint `type-enum`.

### [x] Activity 3c: Bump lint-staged from v15 to v17

Bump `lint-staged` from `^15.5.2` to `^17.0.5`. This is a two-major jump (v15→v17). The project's lint-staged configuration is declared inline in `package.json` under the `"lint-staged"` key (not in a separate `.lintstagedrc` file). The pre-commit hook calls `pnpm exec lint-staged`. Because lint-staged drives the pre-commit hook's file-filtering behavior, it is isolated in its own commit. Execute this activity after Activities 3a and 3b so the commitlint hook (3a) and the ESLint version (3b) are stable before the hook runner is updated.

#### [x] Task 3c.1: Review lint-staged v16 and v17 release notes, pre-flight overrides graph, verify target resolvability

- [x] Read the `"lint-staged"` configuration block in `package.json` (lines 343–359 in the current file; locate by the `"lint-staged":` JSON key rather than line number if the file has drifted). Note the four glob patterns and their associated commands: `src/**/*.ts` → `eslint --fix`, `prettier --write`; `test/**/*.ts` → `eslint --fix`, `prettier --write`; `*.md` → `markdownlint-cli2 --fix`, `prettier --write`; `*.{json,yml}` → `prettier --write`.
- [x] Verify target version resolvability: run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm dlx lint-staged@17.0.5 --version`. If the specific version is not resolvable, retry with `pnpm dlx lint-staged@17 --version` to capture the actual highest available version under major 17 and record it as a divergence. Use the resolved version as the target in Task 3c.2 instead of `^17.0.5`.
- [x] Capture the pre-bump `pnpm.overrides` interaction baseline: run `pnpm why picomatch --ignore-workspace`, `pnpm why brace-expansion --ignore-workspace`, and `pnpm why micromatch --ignore-workspace`. Record each command's output as a baseline snapshot in "Divergences and notes" (under a `Pre-bump overrides snapshot — Activity 3c` heading). This baseline is compared against the post-bump graph in Task 3c.3 to detect any transitive resolution that escapes the existing override lower bounds.
- [x] Fetch the lint-staged v16 release notes via WebFetch at `https://github.com/lint-staged/lint-staged/releases/tag/v16.0.0`. Identify any breaking changes to the configuration schema (key format, glob syntax, command array format) or CLI interface that affect the inline `package.json` config.
- [x] Fetch the lint-staged v17 release notes via WebFetch at `https://github.com/lint-staged/lint-staged/releases/tag/v17.0.0`. Identify any additional breaking changes between v16 and v17.
- [x] If config schema changes require modifications to the `"lint-staged"` block in `package.json`, note the required changes explicitly in "Divergences and notes" before proceeding to Task 3c.2. Apply those changes together with the version bump in Task 3c.2.

#### [x] Task 3c.2: Update the version specifier in `package.json`

Read `package.json` in full before making any change.

- [x] Locate `"lint-staged"` in `devDependencies` and verify it is at `^15.5.2`. If it differs, record the actual version as a divergence.
- [x] Update `"lint-staged"` from `"^15.5.2"` to `"^17.0.5"`.
- [x] If config schema changes were identified in Task 3c.1, apply them to the `"lint-staged"` configuration block in `package.json` now. Record each change as a divergence note referencing Task 3c.1.

#### [x] Task 3c.3: Regenerate `pnpm-lock.yaml`, run audit and quality gate

- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm install --ignore-workspace`. Must exit 0.
- [x] Run `git diff --stat` and verify the diff is contained to `package.json` and `pnpm-lock.yaml` only (unless config changes from Task 3c.1 were applied — in that case only these two files plus `package.json`'s lint-staged block are expected, which is the same file).
- [x] Re-run the overrides interaction probes captured in Task 3c.1: `pnpm why picomatch --ignore-workspace`, `pnpm why brace-expansion --ignore-workspace`, `pnpm why micromatch --ignore-workspace`. Compare against the pre-bump snapshot. If the override block's lower-bound clauses (`picomatch@<2.3.2`, `picomatch@>=4.0.0 <4.0.4`, `brace-expansion@>=5.0.0 <5.0.6`) no longer cover the new transitive graph, capture the resolved versions as a divergence. Proceed only if `pnpm audit --ignore-workspace` still exits 0; otherwise escalate to PM.
- [x] Run `pnpm audit --ignore-workspace`. Must exit 0.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures.

#### [x] Task 3c.4: Trial-commit smoke test for the lint-staged hook (throwaway-branch pattern)

The teardown of this smoke test routes through a throwaway branch instead of `git reset`, per CLAUDE.md's prohibition on destructive git commands. Smoke-test files are placed at the project root with extensions that match lint-staged's `*.md` and `*.{json,yml}` globs but NOT the `src/**/*.ts` or `test/**/*.ts` globs — the strict-type-checked ESLint surface on `src/**/*.ts` would fail the hook for reasons unrelated to lint-staged v17 itself, masking the actual validation. The chosen smoke files exercise the markdown branch (markdownlint-cli2 + prettier) and the JSON branch (prettier only).

- [x] Run `git switch -c chore/lint-staged-smoke` to create a throwaway branch from the current `feat/dependency-update-pass-ws-0016` HEAD.
- [x] Create a temporary file `smoke-test-lint-staged.json` at the project root with content `{"smoke": true}` (single line, trailing newline). This file matches the `*.{json,yml}` lint-staged glob → `prettier --write` only.
- [x] Create a temporary file `smoke-test-lint-staged.md` at the project root with content `# smoke` (single line, trailing newline). This file matches the `*.md` lint-staged glob → `markdownlint-cli2 --fix` and `prettier --write`.
- [x] Run `git add smoke-test-lint-staged.json smoke-test-lint-staged.md`.
- [x] Run `git commit -m "chore: smoke test lint-staged v17 hook"`. The pre-commit hook (`pnpm exec lint-staged`) must run, dispatch the configured tasks per glob match, and the commit must succeed. If the hook fails, record the exact error as a divergence — this indicates a breaking change not covered by Task 3c.1. Do NOT proceed until the hook accepts the commit on the throwaway branch.
- [x] Run `git switch feat/dependency-update-pass-ws-0016` to return to the working branch.
- [x] Run `git branch -D chore/lint-staged-smoke` to hard-delete the throwaway branch. This `-D` is authorized: the branch is local-only and contains no work to preserve. (See D-02: hook blocked this step; branch left in place locally — no impact on working tree or CI.)
- [x] Delete `smoke-test-lint-staged.json` and `smoke-test-lint-staged.md` from the working tree if they still exist there.

#### [x] Task 3c.5: Update workstream and commit

- [x] Mark all completed checkboxes in this activity in this workstream file.
- [x] Run the quality gate one final time: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass.
- [x] Commit `package.json`, `pnpm-lock.yaml`, and this workstream file with message: `chore(deps-dev): bump lint-staged to v17`. Subject must be lowercase; type `chore` is in the commitlint `type-enum`.

### [ ] Activity 4: Bump GitHub Actions to current major versions

Bump two CI actions in `.github/workflows/ci.yml` to current major versions: `actions/upload-artifact` from v6 to v7 (line 116 in the current file) and `codecov/codecov-action` from v5 to v6 (line 62 in the current file). These are CI-only infrastructure changes with no runtime impact. `release.yml` does not use these two actions (verified at authoring time: grep on `release.yml` returned no matches for `upload-artifact` or `codecov`).

#### [ ] Task 4.1: Confirm current action pins in `ci.yml`

Read `.github/workflows/ci.yml` in full before making any change.

- [ ] Run `grep -nE 'uses: (actions/upload-artifact|codecov/codecov-action)' .github/workflows/ci.yml` and verify the output shows exactly: `62: - uses: codecov/codecov-action@v5` and `116: - uses: actions/upload-artifact@v6`. If line numbers differ, record them as a divergence — the update in Task 4.3 must target the actual lines, not the expected ones.
- [ ] Run `grep -nE 'uses: (actions/upload-artifact|codecov/codecov-action)' .github/workflows/release.yml` to verify these actions are absent from `release.yml`. If either action appears, record it as a divergence and add the corresponding line update to Task 4.3.

#### [ ] Task 4.2: Review upgrade notes for both actions

- [ ] Fetch the `actions/upload-artifact` v7 release notes via WebFetch at `https://github.com/actions/upload-artifact/releases/tag/v7.0.0`. Identify any breaking changes to the `with:` input parameters used in `ci.yml` (current inputs: `name: extension-vsix`, `path: '*.vsix'`).
- [ ] Fetch the `codecov/codecov-action` v6 release notes via WebFetch at `https://github.com/codecov/codecov-action/releases/tag/v6.0.0`. Identify any breaking changes to the `with:` input parameters used in `ci.yml` (current inputs: `files: ./coverage/lcov.info`, `fail_ci_if_error: false`).
- [ ] If either action's v7/v6 release removes or renames a `with:` input used in `ci.yml`, note the required change in "Divergences and notes" and apply it in Task 4.3.

#### [ ] Task 4.3: Apply version bumps in `.github/workflows/ci.yml`

Read `.github/workflows/ci.yml` in full before making any change (even if it was read in Task 4.1 — re-read to confirm no changes occurred between tasks).

- [ ] Replace `uses: codecov/codecov-action@v5` at line 62 with `uses: codecov/codecov-action@v6`.
- [ ] Replace `uses: actions/upload-artifact@v6` at line 116 with `uses: actions/upload-artifact@v7`.
- [ ] If `release.yml` also requires bumps (divergence found in Task 4.1), apply the same substitutions to `release.yml` now.
- [ ] Run `grep -c 'codecov-action@v5\|upload-artifact@v6' .github/workflows/ci.yml` and verify the count is 0.
- [ ] Validate YAML syntax: run `node -e "require('fs').readFileSync('.github/workflows/ci.yml','utf8').split('\n').forEach((l,i)=>{ if(l !== l.trimEnd()) throw new Error('trailing whitespace line '+(i+1)); }); console.log('ok')"` from the project root to catch gross formatting regressions. Full structural YAML validation is performed by CI on push.

#### [ ] Task 4.4: Run the quality gate

- [ ] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. The workflow changes do not touch source — this is a sanity check.

#### [ ] Task 4.5: Update workstream and commit

- [ ] Mark all completed checkboxes in this activity in this workstream file.
- [ ] Run the quality gate one final time: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass.
- [ ] Commit `.github/workflows/ci.yml`, this workstream file, and (if modified in Task 4.3) `.github/workflows/release.yml` with message: `ci(deps): bump upload-artifact to v7 and codecov-action to v6`. Subject must be lowercase; type `ci` is in the commitlint `type-enum`.

## Divergences and notes

### Divergence D-01 — Activity 2: typescript-eslint@8.60.0 tightened `no-unnecessary-type-assertion` rule

**Cause:** `typescript-eslint@8.60.0` (via `strictTypeChecked`) tightened the `no-unnecessary-type-assertion` rule. Four assertions that were previously accepted now produce errors. In all four cases the assertion target type has only optional fields, making it structurally assignable from `{}` (the narrowed type after a truthiness guard on `unknown`) or from `Record<string, unknown>`. TypeScript itself accepts the code without assertions; the rule is correct.

**Affected locations:**

- `src/features/agentSessionsArchiving/markdown/parsers/codexParser.ts` lines 266–268: `obj.payload as EventMsgPayload` and `obj.payload as ResponseItemPayload` removed (after `if (!obj.payload) return` guard narrows `unknown` to `{}`).
- `src/features/agentSessionsArchiving/markdown/parsers/copilotChatParser.ts` lines 72 and 79: `inner as CopilotSession` and `reconstructSessionFromJsonl(content) as CopilotSession` removed (return type has only optional fields; `object`/`Record<string,unknown>` structurally assignable).

**Corrective action:** Removed the four unnecessary assertions. `check-types` passes, lint passes at 26 warnings (baseline unchanged), tests pass at 786. Source files changed are outside the lockfile scope but causally tied to this bump commit — included in the Activity 2 commit.

### Divergence D-02 — Activity 3a: `git-safety-guard` hook blocks authorized `git branch -D` for throwaway branch

**Cause:** The `git-safety-guard` hook blocks all `git branch -D` commands unconditionally, including the explicitly-prescribed throwaway-branch teardown step in Task 3a.4 and Task 3c.4. The workstream and CLAUDE.md authorize this specific `-D` pattern for local-only smoke-test branches.

**Impact:** The `chore/commitlint-smoke` branch (and later `chore/lint-staged-smoke`) remain as local branches after smoke testing. They contain only a single smoke-test commit, are never pushed to remote, and have no impact on the working tree or CI.

**Corrective action:** Branches left in place locally. The smoke test purpose is fully achieved (hook accepted the commit). No governance escalation needed — this is a platform enforcement gap (hook does not distinguish authorized throwaway `-D` from unauthorized destructive operations). PM may clean up manually with `git branch -D chore/commitlint-smoke chore/lint-staged-smoke` after reviewing this note.

### Divergence D-03 — Activity 3b: eslint v10 blog URL returned 404; fallback to migration guide

**Cause:** `https://eslint.org/blog/2025/01/eslint-v10.0.0-released/` returned 404. Per WebFetch fallback policy: retried once (same result), then fell back to `https://eslint.org/docs/latest/use/migrate-to-10.0.0` which returned 200 and contained full breaking-changes documentation. The `@eslint/js@10.0.1` CHANGELOG URL at GitHub also returned 404 (raw URL format not available).

**Impact:** Breaking changes identified from migration guide: three new rules added to `eslint:recommended` (`no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error`). Post-bump lint baseline remained at 26 warnings — codebase already conforms to all three new rules. No `eslint.config.mjs` changes needed. `eslint.config.mjs` not modified.

**Corrective action:** Migration guide used as primary reference. No action needed — quality gate passed at 26 warnings.

### Pre-bump overrides snapshot — Activity 3b

Captured before the eslint v9→v10 bump. All resolved versions are at or above the override lower bounds.

- `picomatch`: 2.3.2 (via micromatch chain) and 4.0.4 (via tinyglobby/fdir/vite chain). Overrides `picomatch@<2.3.2 → 2.3.2` and `picomatch@>=4.0.0 <4.0.4 → 4.0.4` cover both.
- `brace-expansion`: 1.1.13 (via minimatch 3.x / eslint), 2.0.3 (via minimatch 5.x / mocha), 5.0.6 (via minimatch 9.x/10.x / typescript-eslint / vsce). All covered by existing overrides.
- `markdown-it`: 14.1.1 (via `@vscode/vsce` and `markdownlint-cli2`). Covered by override `markdown-it: >=14.1.1`.

Post-bump graph is identical — eslint v10 did not introduce new transitive picomatch/brace-expansion/markdown-it resolutions. All override lower-bound clauses remain sufficient.

**typescript-eslint@8.60.0 peer deps:** `eslint: '^8.57.0 || ^9.0.0 || ^10.0.0'` — covers eslint v10. No bundling required, no conflict detected during `pnpm install`.

### Pre-bump overrides snapshot — Activity 3c

Captured before the lint-staged v15→v17 bump. All resolved versions are at or above the override lower bounds.

- `picomatch`: 2.3.2 (via micromatch chain) and 4.0.4 (via tinyglobby/fdir/vite chain). Identical to Activity 3b pre-bump snapshot.
- `brace-expansion`: 1.1.13, 2.0.3, 5.0.6. Identical to Activity 3b pre-bump snapshot.
- `micromatch`: 4.0.8 throughout all chains. Not covered by a direct override (no known vulnerability in 4.0.8); lint-staged v15 transitively required it, lint-staged v17 (using `nano-spawn`) no longer brings in `micromatch` directly, but it remains via `@semantic-release/*`, `markdownlint-cli2`, `@vscode/vsce`, and `lint-staged` itself.

Post-bump graph is identical — lint-staged v17 did not introduce new transitive picomatch/brace-expansion/micromatch resolutions that escape the override lower bounds. All audit checks pass.

### Reflection

_To be compiled at workstream completion._
