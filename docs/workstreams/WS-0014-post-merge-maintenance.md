---
title: 'Post-merge maintenance — dependency vulnerabilities, moveArchive lint, GitHub Actions Node 24'
objective: Restore the post-WS-0013 main-branch CI to a fully green state by (a) overriding all transitive dependency vulnerabilities flagged by `pnpm audit`, (b) extracting helpers from `moveArchive` to bring it below ESLint's complexity and statement limits, and (c) bumping the GitHub Actions used in `.github/workflows/` to versions that support Node 24 ahead of the 2026-06-02 forced upgrade.
workstream: WS-0014
status: 'in-progress'
workspaces: []
dependencies: []
created: 2026-05-27
---

The post-merge CI run on `main` (`gh run view 26496496850`) failed in the `Security Audit` job: `pnpm audit` reports 29 vulnerabilities (1 critical, 13 high, 13 moderate, 2 low) across 11 unique packages, all in transitive dev-only dependencies pulled via `@commitlint/cli`, `@vscode/vsce`, `eslint`, and other dev tooling. The same run also surfaced two new ESLint warnings introduced by Activity 3 of WS-0013 on `src/features/agentSessionsArchiving/archiveService.ts#297`: `moveArchive` has 53 statements (limit 15) and a cyclomatic complexity of 21 (limit 10). Finally, the GitHub Actions runner annotated every job with a deprecation notice: `actions/checkout@v4`, `actions/setup-node@v4`, and `pnpm/action-setup@v4` run on Node.js 20 and will be forced to Node.js 24 on 2026-06-02. This workstream resolves all three issues in a single coordinated branch so the next merge to `main` produces a fully green CI run with no deprecation annotations. Activity 1 adds a `pnpm.overrides` block to `package.json` that forces every vulnerable transitive package to its patched version, regenerates `pnpm-lock.yaml`, and verifies `pnpm audit` returns clean. Activity 2 extracts three private helpers (`moveTopLevelFile`, `moveYearDirectory`, `moveMonthDirectory`) from `moveArchive` and rewrites the outer method as a thin orchestrator that preserves the `allCopiesSucceeded` accumulation and the source-survival semantics introduced in WS-0013 Activity 3. Activity 3 bumps the three pinned actions in both `.github/workflows/ci.yml` and `.github/workflows/release.yml` to majors that ship Node-24-compatible code.

## Execution instructions

> Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the workstream status is `draft`, do NOT start execution — follow the draft-review skill to validate the workstream. If the workstream status is `deferred`, `canceled`, or `failed`, do NOT start execution — return to the PM for a lifecycle decision. Read the workstream introduction, `docs/technical-context.md` section 8.6 (for the moveArchive context), and the execution protocol. Run `nvm use 22.22` before any pnpm script. If the workstream status is `idle`, set it to `in-progress`. Create branch `fix/post-merge-maintenance-ws-0014` from `main` and push it to remote.

**Before each activity** → read all tasks and subtasks in the activity to understand the full scope before writing any code.

**During execution** → always read a file before modifying it. Mark each subtask `[x]` immediately upon completion, then the task, then the activity — never batch. After completing each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" — before moving to the next task. Divergences that identify defects or gaps must include a corrective action (task or PM escalation).

**Before each commit** → run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. Activity 1 additionally requires `pnpm audit` to exit 0 before commit. Document any undocumented divergence before committing.

**When completing the last activity of this workstream** → compile the Reflection sub-block in "Divergences and notes". Update the frontmatter status to `completed`. Verify CI on a draft PR or via `act` (if available) before proposing PR and merge.

## Activities, Tasks and Subtasks

### [x] Activity 1: Override all transitive vulnerable dependencies via `pnpm.overrides`

This activity resolves the `Security Audit` CI failure. As of 2026-05-27, `pnpm audit` reports 29 advisories across 11 unique packages. The overrides prescribed below are computed from the audit output captured at workstream authoring time. If the executor's local `pnpm audit` returns advisories NOT covered by the prescribed overrides (new advisories published between authoring and execution), the executor MUST extend the override block with the additional patched ranges and record the extension as a divergence.

#### [x] Task 1.1: Verify the audit state locally

Read `package.json` in full before making any change.

- [x] Run `nvm use 22.22 && pnpm install --frozen-lockfile` to reproduce the lockfile state.
- [x] Run `pnpm audit` and verify it exits non-zero with 29 advisories. If the count differs, capture the actual output (`pnpm audit --json > /tmp/audit-baseline.json`) and reconcile against the prescribed override block in Task 1.2. New advisories require additional overrides; resolved advisories (where the upstream package shipped a transitive fix) require dropping the corresponding override.
- [x] Run `git diff package.json` to confirm `package.json` is unchanged from `main`.

#### [x] Task 1.2: Add the `pnpm.overrides` block to `package.json`

- [x] In `package.json`, locate the closing `}` of the top-level object. Insert a new `pnpm` field immediately before the closing `}` (after the existing `devDependencies` block; if a `pnpm` field already exists from a different change, merge the `overrides` sub-field into it rather than duplicating).

  The exact block to insert:

  ```json
  "pnpm": {
    "overrides": {
      "fast-uri": "^3.1.2",
      "fast-xml-builder": "^1.1.7",
      "fast-xml-parser": "^5.5.7",
      "flatted": "^3.4.2",
      "handlebars": "^4.7.9",
      "postcss": "^8.5.10",
      "turbo": "^2.9.14",
      "vite": "^7.3.2",
      "yaml": "^2.8.3",
      "brace-expansion@1": "^1.1.13",
      "brace-expansion@>=2": "^5.0.6",
      "picomatch@<3": "^2.3.2",
      "picomatch@>=4": "^4.0.4"
    }
  }
  ```

  Rationale per package (from `pnpm audit --json` of 2026-05-27):
  - `fast-uri ^3.1.2` — HIGH path traversal (CVE patched in 3.1.1) and HIGH host confusion (patched in 3.1.2).
  - `fast-xml-builder ^1.1.7` — HIGH attribute injection (patched in 1.1.7).
  - `fast-xml-parser ^5.5.7` — HIGH numeric entity expansion (patched in 5.5.6) and MODERATE parser issue (patched in 5.5.7); use the higher floor.
  - `flatted ^3.4.2` — HIGH prototype pollution via `parse()` (patched in 3.4.2).
  - `handlebars ^4.7.9` — CRITICAL JS injection (patched in 4.7.9), multiple HIGH (JS injection in CLI, DoS), MODERATE prototype pollution. All patched in 4.7.9.
  - `postcss ^8.5.10` — MODERATE (patched in 8.5.10).
  - `turbo ^2.9.14` — MODERATE and LOW (patched in 2.9.14).
  - `vite ^7.3.2` — HIGH `server.fs.deny` bypass and HIGH arbitrary file read (patched in 7.3.2).
  - `yaml ^2.8.3` — MODERATE stack overflow via deeply nested input (patched in 2.8.3).
  - `brace-expansion` — split by major: v1.x needs `^1.1.13` (MODERATE), v2+ chain needs `^5.0.6` (covers v4-v5 MODERATE advisories).
  - `picomatch` — split by major: v0/v1/v2.x<2.3.2 needs `^2.3.2` (HIGH ReDoS), v4.x<4.0.4 needs `^4.0.4` (HIGH ReDoS).

#### [x] Task 1.3: Regenerate `pnpm-lock.yaml` and verify audit

- [x] Run `pnpm install` (without `--frozen-lockfile`) so pnpm regenerates `pnpm-lock.yaml` according to the new overrides. The command must exit 0. If pnpm reports an override syntax error, the error message points to the offending key in the overrides block — correct the syntax and retry.
- [x] Run `pnpm audit`. The command MUST exit 0 with `No known vulnerabilities found` (or equivalent). If any advisory remains, identify the package and patched range, extend the overrides block (Task 1.2), regenerate the lockfile (this task), and retry.
- [x] Spot-check that the lockfile change is contained: `git diff --stat pnpm-lock.yaml package.json` should show modifications only to those two files. If other files were modified, investigate before proceeding.

#### [x] Task 1.4: Verify the project quality gate still passes

- [x] Run `pnpm run check-types`. Must pass with zero errors.
- [x] Run `pnpm run lint`. Must pass with zero errors. The 31 pre-existing warnings (including the two `moveArchive` warnings — those will be eliminated in Activity 2) remain acceptable.
- [x] Run `pnpm run test:unit`. Must pass with 779/779 (or higher if additional tests were added since authoring).
- [x] If any of the three commands fails for reasons traceable to the override block (e.g., a bumped package introduced a breaking API change), narrow the override to a more conservative range and retry.

#### [x] Task 1.5: Update impacted documentation

- [x] In `docs/technical-context.md`, insert a new subsection titled "Dependency overrides" as `### 2.4`, positioned between the existing `### 2.3 Conventions` (currently at line 84) and `## 3 Context and Scope` (currently at line 93). Do not renumber existing sections; the new `### 2.4` simply appends to the section 2 set. Body:

  > **Dependency overrides:** `package.json` declares a `pnpm.overrides` block that forces vulnerable transitive packages to their patched versions. The block is updated whenever `pnpm audit` reports an advisory not already covered. Removal of an override entry is allowed only after verifying — via `pnpm why <package>` — that no remaining ancestor in the resolution tree pulls in a vulnerable range. The override block is the project's surgical fix path for transitive vulnerabilities; the Dependabot security-update PRs targeting the same packages are superseded once the overrides are merged and may be closed without merge.

- [x] Mark all completed checkboxes in this activity.

#### [x] Task 1.6: Commit changes

- [x] Run the full quality gate one more time: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass. Run `pnpm audit` and verify exit 0.
- [x] Commit `package.json`, `pnpm-lock.yaml`, `docs/technical-context.md`, and this workstream file with message: `fix(deps): override transitive vulnerable packages to resolve audit failures`. Subject length 76 chars, lowercase, type `fix` ∈ commitlint type-enum.

### [x] Activity 2: Extract `moveArchive` helpers to satisfy ESLint statement and complexity limits

`moveArchive` (`src/features/agentSessionsArchiving/archiveService.ts#297`) currently has 53 statements (ESLint `max-statements` limit 15) and cyclomatic complexity 21 (ESLint `complexity` limit 10). These were introduced by WS-0013 Activity 3 when the two-level YYYY/MM walk and the `allCopiesSucceeded` gating were added. This activity extracts three private helpers and rewrites `moveArchive` as a thin orchestrator, eliminating both warnings without changing the externally observable behavior or the test surface.

#### [x] Task 2.1: Add the three private helpers

Read `src/features/agentSessionsArchiving/archiveService.ts` in full before making any change. The helpers MUST be inserted IMMEDIATELY BEFORE the `moveArchive` method (currently at line 297). Each helper returns `Promise<boolean>` where `true` means "every copy in this scope succeeded" and `false` means "at least one failure was logged".

- [x] Insert `moveTopLevelFile` as a `private async` method. The helper copies a single top-level file from `oldUri` to `newUri` with `{ overwrite: true }`, returning `false` on copy failure (and logging the same warn message currently emitted inline by `moveArchive`). Body:

  ```typescript
  private async moveTopLevelFile(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    name: string
  ): Promise<boolean> {
    try {
      await vscode.workspace.fs.copy(
        vscode.Uri.joinPath(oldUri, name),
        vscode.Uri.joinPath(newUri, name),
        { overwrite: true }
      );
      return true;
    } catch (err) {
      this.logger.warn(`Failed to move file ${name}: ${String(err)}`);
      return false;
    }
  }
  ```

- [x] Insert `moveMonthDirectory` as a `private async` method. The helper reads the `oldUri/yyyy/mmName` directory, ensures the destination subdirectory exists, and copies each `FileType.File` entry to the corresponding destination path with `{ overwrite: true }`. Returns `false` if the readDirectory call fails OR any individual file copy fails. Body:

  ```typescript
  private async moveMonthDirectory(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    yyyy: string,
    mmName: string
  ): Promise<boolean> {
    let fileEntries: [string, vscode.FileType][];
    try {
      fileEntries = await vscode.workspace.fs.readDirectory(
        vscode.Uri.joinPath(oldUri, yyyy, mmName)
      );
    } catch (err) {
      this.logger.warn(
        `Failed to read month dir ${yyyy}/${mmName} during move: ${String(err)}`
      );
      return false;
    }
    await this.ensureDirectory(vscode.Uri.joinPath(newUri, yyyy, mmName));
    let allOK = true;
    for (const [fileName, fileType] of fileEntries) {
      if (fileType !== vscode.FileType.File) {
        continue;
      }
      try {
        await vscode.workspace.fs.copy(
          vscode.Uri.joinPath(oldUri, yyyy, mmName, fileName),
          vscode.Uri.joinPath(newUri, yyyy, mmName, fileName),
          { overwrite: true }
        );
      } catch (err) {
        allOK = false;
        this.logger.warn(
          `Failed to move file ${yyyy}/${mmName}/${fileName}: ${String(err)}`
        );
      }
    }
    return allOK;
  }
  ```

- [x] Insert `moveYearDirectory` as a `private async` method. The helper reads the `oldUri/yyyy` directory, filters entries to those whose name matches `/^\d{2}$/` AND whose type is `FileType.Directory` (i.e., valid month subdirectories), and delegates each to `moveMonthDirectory`. Returns `false` if the readDirectory call fails OR any month-directory delegation returns `false`. Body:

  ```typescript
  private async moveYearDirectory(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    yyyy: string
  ): Promise<boolean> {
    let monthEntries: [string, vscode.FileType][];
    try {
      monthEntries = await vscode.workspace.fs.readDirectory(
        vscode.Uri.joinPath(oldUri, yyyy)
      );
    } catch (err) {
      this.logger.warn(
        `Failed to read year dir ${yyyy} during move: ${String(err)}`
      );
      return false;
    }
    let allOK = true;
    for (const [mmName, mmType] of monthEntries) {
      if (mmType !== vscode.FileType.Directory || !/^\d{2}$/.test(mmName)) {
        continue;
      }
      const monthOK = await this.moveMonthDirectory(oldUri, newUri, yyyy, mmName);
      if (!monthOK) {
        allOK = false;
      }
    }
    return allOK;
  }
  ```

#### [x] Task 2.2: Rewrite `moveArchive` body to orchestrate the helpers

Read `src/features/agentSessionsArchiving/archiveService.ts` again before making the change (its line numbers shifted after Task 2.1's insertions).

- [x] Replace the body of `moveArchive` (from the opening `{` after the parameter list to the closing `}`) with the orchestrator version. The validation prologue, the URI computation, the top-level `readDirectory`, the `ensureDirectory(newUri)` call, the `allCopiesSucceeded` accumulation, and the post-loop delete/warn block all remain — only the inner double-nested for-loop body is replaced by helper delegations.

  ```typescript
  private async moveArchive(oldPath: string, newPath: string): Promise<void> {
    const oldValidation = validateArchivePath(oldPath);
    if (!oldValidation.valid) {
      this.logger.warn(
        `Skipping moveArchive: invalid oldPath "${oldPath}" — ${oldValidation.reason ?? 'unknown'}`
      );
      return;
    }
    const newValidation = validateArchivePath(newPath);
    if (!newValidation.valid) {
      this.logger.warn(
        `Skipping moveArchive: invalid newPath "${newPath}" — ${newValidation.reason ?? 'unknown'}`
      );
      return;
    }
    const oldUri = vscode.Uri.joinPath(this.workspaceRootUri, oldPath);
    const newUri = vscode.Uri.joinPath(this.workspaceRootUri, newPath);
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(oldUri);
    } catch {
      this.logger.debug(`Old archive directory not found, skipping move: ${oldPath}`);
      return;
    }
    await this.ensureDirectory(newUri);
    let allCopiesSucceeded = true;
    for (const [name, type] of entries) {
      if (type === vscode.FileType.File) {
        const ok = await this.moveTopLevelFile(oldUri, newUri, name);
        if (!ok) {
          allCopiesSucceeded = false;
        }
      } else if (type === vscode.FileType.Directory && /^\d{4}$/.test(name)) {
        const ok = await this.moveYearDirectory(oldUri, newUri, name);
        if (!ok) {
          allCopiesSucceeded = false;
        }
      }
    }
    if (allCopiesSucceeded) {
      try {
        await vscode.workspace.fs.delete(oldUri, { recursive: true });
      } catch (err) {
        this.logger.warn(
          `Failed to delete old archive directory ${oldPath} after move: ${String(err)} — left in place`
        );
      }
      this.logger.info(`Moved archive from ${oldPath} to ${newPath}`);
    } else {
      this.logger.warn(
        `moveArchive completed with copy failures — left source archive in place at "${oldPath}" for manual cleanup after verifying "${newPath}" is complete. Do NOT delete "${oldPath}" until verifying the target tree is intact.`
      );
    }
  }
  ```

#### [x] Task 2.3: Verify quality gate and lint warning elimination

- [x] Run `pnpm run check-types`. Must pass.
- [x] Run `pnpm run lint`. Must pass. Crucially, the two `moveArchive` warnings (`max-statements 53/15` and `complexity 21/10`) MUST be absent from the output. The total warning count should drop by 2. If either warning persists, the refactor did not fully extract the offending statements/branches — verify each helper has its OWN budget and revisit the extraction.
- [x] Run `pnpm run test:unit`. Must pass with the same test count as before Activity 2 (no test rewrites are part of this activity — externally observable behavior is preserved). Pay particular attention to: `'should move archive when path changes'`, `'should skip move when old directory does not exist'`, `'should leave the source archive in place when any copy fails during moveArchive'`. All three exercise `moveArchive` and must continue to pass without modification. If any test fails, the refactor did not preserve behavior — locate the discrepancy between the new helper boundaries and the original inline logic (typical sources: `allCopiesSucceeded` accumulation lost in a helper returning `void` instead of `boolean`; year-or-month regex moved into the wrong helper; missing `await` on a helper call), fix the production code (NOT the test), and re-run the gate.

#### [x] Task 2.4: Update impacted documentation

- [x] Documentation impact pre-verified at workstream authoring time: `docs/technical-context.md` references `moveArchive` only once (line 549 of the live document, as one of the validator's consumer sites — no description of its internal implementation). The refactor is internal structure with no observable behavior change. No documentation change required. Note "No documentation impact" against this checkbox in execution and proceed.
- [x] Mark all completed checkboxes in this activity.

#### [x] Task 2.5: Commit changes

- [x] Run the full quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. Total lint warning count MUST equal `pre-Activity-2 count − 2`.
- [x] Commit `src/features/agentSessionsArchiving/archiveService.ts` and this workstream file with message: `refactor(archiving): extract movearchive helpers to satisfy lint complexity limits`. Subject length 82 chars, lowercase, type `refactor` ∈ commitlint type-enum.

### [ ] Activity 3: Bump GitHub Actions to Node-24-compatible majors

GitHub Actions deprecated the Node.js 20 runtime on 2025-09-19 and will force every action onto Node.js 24 starting 2026-06-02 (per the deprecation annotation on the post-WS-0013 CI run). The three actions currently pinned at the v4 major in `.github/workflows/ci.yml` and `.github/workflows/release.yml` — `actions/checkout`, `actions/setup-node`, `pnpm/action-setup` — ship Node-24-compatible code at v5, v5, and v6 respectively. This activity bumps them in both workflows.

#### [ ] Task 3.1: Bump action versions in `.github/workflows/ci.yml`

Read `.github/workflows/ci.yml` in full before making any change.

- [ ] Replace every occurrence of `uses: actions/checkout@v4` with `uses: actions/checkout@v5`.
- [ ] Replace every occurrence of `uses: actions/setup-node@v4` with `uses: actions/setup-node@v5`.
- [ ] Replace every occurrence of `uses: pnpm/action-setup@v4` with `uses: pnpm/action-setup@v6`.
- [ ] After the replacements, run `grep -c '@v4' .github/workflows/ci.yml` and verify the count is 0 for the three target actions. Other `@v4` references (codecov, etc.) may remain if they are not in the deprecation set — check the post-merge CI run's annotations to confirm scope.

#### [ ] Task 3.2: Apply the same bumps to `.github/workflows/release.yml`

Read `.github/workflows/release.yml` in full before making any change.

- [ ] Replace every occurrence of `uses: actions/checkout@v4` with `uses: actions/checkout@v5`.
- [ ] Replace every occurrence of `uses: actions/setup-node@v4` with `uses: actions/setup-node@v5`.
- [ ] Replace every occurrence of `uses: pnpm/action-setup@v4` with `uses: pnpm/action-setup@v6`.
- [ ] Verify with `grep -c '@v4' .github/workflows/release.yml` (same scope as Task 3.1).

#### [ ] Task 3.3: Validate YAML syntax

- [ ] Confirm both workflow files still parse as valid YAML. Use either `python3 -c "import yaml,sys;yaml.safe_load(open(sys.argv[1]))" .github/workflows/ci.yml` and the same for `release.yml`, OR rely on the local editor's YAML mode showing no syntax errors. Indentation MUST be preserved exactly (a stray space at a different indent level would break the workflow at runtime, not at lint time).
- [ ] Verify the project quality gate is unaffected: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. The workflow changes do not touch source — these are sanity checks.

#### [ ] Task 3.4: Update impacted documentation

- [ ] Documentation impact pre-verified at workstream authoring time: `docs/technical-context.md` contains no references to `actions/checkout`, `actions/setup-node`, `pnpm/action-setup`, or any `@vN` action pin. The "Automated release pipeline" entry in section 2.2 describes the pipeline at a high level without naming versions. No documentation change required. Note "No documentation impact" against this checkbox in execution and proceed.
- [ ] Mark all completed checkboxes in this activity.

#### [ ] Task 3.5: Commit changes

- [ ] Run the full quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass.
- [ ] Commit `.github/workflows/ci.yml`, `.github/workflows/release.yml`, and this workstream file with message: `ci(deps): bump github actions to versions supporting node 24`. Subject length 60 chars, lowercase, type `ci` ∈ commitlint type-enum.

## Divergences and notes

**Activity 1**

- **Task 1.2 (merge vs replace + style)**: a `pnpm.overrides` block already existed in `package.json` (lines 297–325) with 27 entries from prior work. The workstream prescribed a new block; followed the "merge" branch of the prescription. Used the project's existing fixed-version style (e.g., `"fast-uri": "3.1.2"`) instead of the workstream's prescribed `^range` style (e.g., `"fast-uri": "^3.1.2"`) for consistency with the surrounding entries. Functional effect identical for our purposes (a pinned version satisfies the patched range).
- **Task 1.2 (additional overrides beyond prescription)**: the workstream prescribed 9 single-package overrides + 4 multi-range overrides covering the 11 packages identified in audit. Execution-time audit surfaced two more requiring action: `tmp` (HIGH path traversal, no existing override) and `qs` (existing override `">=6.14.2"` was below the new patched threshold `>=6.15.2`). Added `"tmp": ">=0.2.6"` and updated `"qs": ">=6.15.2"`. Authorized by the workstream's own clause: "If the executor's local `pnpm audit` returns advisories NOT covered by the prescribed overrides ... the executor MUST extend the override block".
- **Task 1.3 (workspace resolution clash, IMPORTANT)**: `pnpm install` from inside `tangyr-vscode/` walks UP and finds the parent oceanus's `pnpm-workspace.yaml` at `/Users/alessandroraffa/dev/oceanus/pnpm-workspace.yaml`. pnpm treats `tangyr-vscode` as one of multiple workspace projects and behaves accordingly: it can ignore overrides changes in the inner package.json (relying on the workspace lockfile), AND its audit reports advisories from sibling workspace packages (`tools/tempra` was the most prominent source of false-positives in the initial baseline). The CI environment is unaffected — CI clones `tangyr-vscode` standalone with no parent workspace — but the local execution flow MUST use `--ignore-workspace` on every pnpm command (`pnpm install --ignore-workspace --no-frozen-lockfile` to regenerate the lockfile; `pnpm audit --ignore-workspace` to verify). Without this flag the local audit reports 29 advisories (CI scope: ~3); with it, the local audit matches CI behavior. Corrective: extend Task 1.3 prescription to include `--ignore-workspace` when the repo is checked out as a git submodule under another pnpm workspace. Reported to PM as a lesson for the workstream-authoring discipline (potential 6th item for the WS-0013 refinement report — "monorepo/workspace context detection").
- **Task 1.4 (final audit state)**: after applying all overrides + regenerating the lockfile, `pnpm audit --ignore-workspace` reports `1 vulnerabilities found. Severity: 1 moderate (1 ignored)`. The single remaining advisory is the one already declared in `pnpm.auditConfig.ignoreCves` (`CVE-2026-26996` / `GHSA-w5hq-g745-h8pq`); exit code is 0. Quality gate clean: check-types ✓, lint ✓ (0 errors, pre-existing warnings unchanged), test:unit ✓ (779/779).

**Activity 2**

- **Task 2.1/2.2 (deeper extraction than prescribed)**: the workstream prescribed 3 helpers (`moveTopLevelFile`, `moveMonthDirectory`, `moveYearDirectory`). After applying them, `moveArchive` still had 3 ESLint warnings (max-lines-per-function 54/50, complexity 14/10, max-statements 31/15) and `moveMonthDirectory` had a new max-params 4/3 warning. Extracted 3 additional helpers to fully eliminate every move-related warning: `validateMovePaths` (collapses the two if-validation blocks at the top), `finalizeMoveArchive` (collapses the post-loop delete/warn dispatch), `moveEntry` (dispatches a single entry to file/year/skip), and `copyAllMoveEntries` (iterates entries + accumulates `allOK`). Refactored `moveMonthDirectory` signature from 4 params (`oldUri, newUri, yyyy, mmName`) to 3 (`monthOldUri, monthNewUri, label`); the caller (`moveYearDirectory`) now precomputes the Uris and the warn-message label string. Final `moveArchive` body is 14 statements / complexity ≤10 / 28 lines, well under all limits. Total lint warning count: 31 → 24 (delta -7, far exceeds the workstream's -2 criterion). Quality gate clean. Corrective: the workstream's prescribed 3-helper extraction was insufficient by ESLint's metrics; future workstream-authoring should estimate post-refactor statement budgets against the validation prologue + URI computation + readDirectory + ensureDirectory + loop + finalization, not just the loop body.

### Reflection

_To be compiled at workstream completion._
