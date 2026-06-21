---
title: 'Definitive legacy config consolidation and default archive path migration'
objective: Make legacy .arit-toolkit.jsonc removal reliable and git-aware, change the default archive path to .tangyr/agent-sessions, migrate existing configs off the historical default, and relocate existing session archives without loss — per SPEC-002.
workstream: WS-0021
status: 'in-progress'
workspaces: []
dependencies: []
created: 2026-06-21
references:
  - docs/specifications/SPEC-002-legacy-config-and-default-archive-path-migration.md
  - docs/initiatives/INIT-004-config-and-archive-path-consolidation.md
---

This workstream implements [SPEC-002](docs/specifications/SPEC-002-legacy-config-and-default-archive-path-migration.md). It resolves two field defects surfaced by the cross-project audit: the legacy-config cleanup step that never executes, and the historical archive path inside the versioned docs tree.

## Architectural decisions

These decisions are settled. Do not re-open them during execution; record any forced deviation as a divergence.

1. **Legacy removal is git-aware.** A new `isGitTracked(filePath, cwd)` helper in `src/core/git.ts` returns `true` only on a definite git "tracked" result (`git ls-files --error-unmatch` exits 0). Untracked, not-a-repo, and git-unavailable all return `false`. Tracked legacy files are deleted from the working tree (git history is the backup); everything else is renamed to `.arit-toolkit.jsonc.bak` (timestamp-suffixed on collision via the existing `findAvailableBackupPath`). The extension never hard-deletes a file whose tracking status is not a definite "tracked".

2. **Consolidation runs unconditionally on the legacy file, after `.tangyr.jsonc` is authoritative.** The current `verifyLegacyConfigMigration` bug is that its cleanup is gated behind "`.tangyr.jsonc` absent", which the normal flow has already invalidated. The replacement, `consolidateLegacyConfig`, branches on whether `.arit-toolkit.jsonc` exists (if not → no-op), then on whether `.tangyr.jsonc` exists: if present, `.tangyr.jsonc` is authoritative and the legacy file is removed (git-aware) with no merge; if absent, the legacy file is migrated to `.tangyr.jsonc` (preserving the existing Path A / malformed-Path B behavior) and then removed (git-aware). `.tangyr.jsonc` values are never overwritten from legacy.

3. **The default archive path becomes `.tangyr/agent-sessions`, and existing configs are migrated by an explicit value-migration.** Because existing configs carry an explicit `archivePath`, changing the default constant alone moves nobody. A per-section `migrateValue` transform rewrites `archivePath` to `.tangyr/agent-sessions` only when the existing value is the historical default `docs/archive/agent-sessions` or is empty/unset; any other (customized) value is preserved. The transform is applied by `ConfigMigrationService` during merge and is idempotent.

4. **The archive file relocation is performed by an explicit, idempotent reconciliation in the archive service — not by event-listener timing.** Relying on the `onConfigSectionChanged` → `reconfigure` → `moveArchive` path during startup migration is unsafe: when the config is rewritten during `initialize()`, the archive service's `currentConfig` is not reliably set yet, so `reconfigure` sees no old path and skips the move, stranding archives at the old location. Instead, the service runs a one-shot `reconcileArchiveLocation()` at the start of its first cycle: when `currentConfig.archivePath` equals the new default `.tangyr/agent-sessions` and a non-empty archive tree exists at the historical default `docs/archive/agent-sessions` (and the two differ), it relocates the tree via the existing loss-safe `moveArchive`. The gate (configured path must be the new default) means customized-path installs are never touched. This is deterministic across activations and idempotent (once moved, the historical directory is gone). The reconciliation is silent (no dedicated prompt), satisfying SPEC-002.

## Execution instructions

> Re-read this section at the start of every execution session. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the status is `draft`, do NOT execute — follow `skills/draft-review/SKILL.md`. If `deferred`/`canceled`/`failed`, return to the Human. Read SPEC-002, `docs/technical-context.md`, and the execution protocol. Run `source ~/.nvm/nvm.sh && nvm use 22.22` before any pnpm script. The branch `feat/legacy-config-and-archive-path-migration` is created from `main` by the orchestrator — do NOT create a new branch. If the status is `idle`, set it to `in-progress`.

**Before each activity** → read every task and subtask in the activity, and read each target file in full, before writing code.

**During execution** → always read a file before modifying it. Follow TDD: write failing tests first, then implement. Mark each subtask `[x]` immediately on completion, then the task, then the activity — never batch. After each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" before continuing.

**Before each commit** → run the full quality gate: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures, and the existing test count must not decrease. (`pnpm install`/`pnpm audit`, if ever needed, require `--ignore-workspace` locally; the build/test scripts do not.)

**250-line file constraint** → `src/features/agentSessionsArchiving/archiveService.ts` is already above the 250-line ESLint `warn` threshold. Place new reconciliation logic in a focused private method, and if the addition pushes lint into new territory, extract a small helper module rather than inflating the class.

**When completing the last activity** → compile the Reflection sub-block, set status to `completed`, verify the full suite and CI, then propose the PR to the Human (the agent cannot merge).

## Activities, Tasks and Subtasks

### [x] Activity 1: Add the `isGitTracked` git helper

Add a git-tracking probe to `src/core/git.ts`, mirroring the existing `isGitIgnored` structure and its conservative error handling.

#### [x] Task 1.1: Write failing unit tests for `isGitTracked`

In the existing git helper test file (follow the pattern already used for `isGitIgnored`/`isGitRepository`), add a `describe('isGitTracked')` block covering: (a) a tracked file → `true`; (b) an untracked file → `false`; (c) not a git repository → `false`; (d) git unavailable / command error → `false`. Use the same execFile/child_process stubbing approach the existing git tests use. Confirm the new tests fail before implementation.

#### [x] Task 1.2: Implement `isGitTracked`

Add to `src/core/git.ts`:

```typescript
/**
 * Returns true only when the file is definitely tracked by git (present in the
 * index/HEAD). Returns false for an untracked file, a non-repository directory,
 * or when git is unavailable — so callers never hard-delete a file whose
 * tracking status is unknown.
 */
export async function isGitTracked(filePath: string, cwd: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['ls-files', '--error-unmatch', '--', filePath], { cwd });
    return true; // exit 0 → tracked
  } catch {
    return false; // exit 1 (untracked), 128 (not a repo), ENOENT (no git) → not definitely tracked
  }
}
```

Run the quality gate and confirm the Task 1.1 tests pass. Commit: `feat(core): add isgittracked git-tracking probe`.

### [x] Activity 2: Restructure legacy consolidation to be reliable and git-aware

Replace `verifyLegacyConfigMigration` with `consolidateLegacyConfig` in `src/core/extensionStateManager.ts`, implementing architectural decisions 1 and 2. Read the whole file first; the relevant methods are `initialize()`, `verifyLegacyConfigMigration()`, `findAvailableBackupPath()`, `readConfigFile()`, `applyConfig()`, `runMigration()`, `getConfigUri()`.

#### [x] Task 2.1: Write failing unit tests for consolidation

Extend the existing legacy-verify test file (`test/unit/core/extensionStateManager.legacyVerify.test.ts`) — or add a sibling — covering every SPEC-002 acceptance branch:

- Both files present, legacy **git-tracked** → `.tangyr.jsonc` values untouched; legacy **deleted** (`fs.delete` called on the legacy URI; `fs.rename` not called); no migration write needed.
- Both files present, legacy **not git-tracked** → legacy **renamed** to `.arit-toolkit.jsonc.bak` (no `fs.delete`); timestamp suffix on collision.
- Legacy only, parseable, **git-tracked** → `.tangyr.jsonc` written by migration; legacy **deleted**.
- Legacy only, parseable, **not tracked** → `.tangyr.jsonc` written; legacy **renamed** to `.bak`.
- Legacy only, **malformed** → `.arit-toolkit.jsonc.malformed.bak`; warning shown; `.tangyr.jsonc` NOT written (preserve existing Path B behavior).
- Neither file present → no-op (no stat-driven writes, no rename, no delete).
- Multi-root workspace → no-op (upstream guard).
- Idempotency: legacy already absent → no-op.

Stub `isGitTracked` (mock the `../git` import) per case to drive the tracked/untracked branches deterministically. Confirm the new tests fail before implementation.

#### [x] Task 2.2: Implement `consolidateLegacyConfig` and a git-aware `removeLegacyConfigFile`

Replace `verifyLegacyConfigMigration` with `consolidateLegacyConfig`:

- Guard on `_workspaceRoot`; resolve `legacyUri` and `newConfigUri`.
- If the legacy file does not exist (`fs.stat` throws) → return (no-op).
- Stat `.tangyr.jsonc`. **If absent:** read+parse the legacy file; on parse failure run the existing malformed-Path-B handling (rename to `.arit-toolkit.jsonc.malformed.bak`, warn, return — do NOT create `.tangyr.jsonc`); on success apply the parsed config (`applyConfig`, set `_loadedLegacyConfigFile = true`, fire `_onDidChangeState`), then `await runMigration()` to write `.tangyr.jsonc`, then fall through to removal. **If present:** `.tangyr.jsonc` is authoritative — do not read or merge the legacy file; fall through to removal.
- Removal is delegated to `removeLegacyConfigFile(legacyUri)`: call `isGitTracked(legacyUri.fsPath, this._workspaceRoot.fsPath)`. When tracked → `fs.delete(legacyUri)`. When not tracked → `findAvailableBackupPath` for `.arit-toolkit.jsonc.bak` then `fs.rename`. Wrap each in try/catch, log at `info` on success and `warn` on failure (failure must not throw). Show one information message summarizing the migration + removal (delete vs rename wording reflecting the branch taken).

Update `initialize()` to call `await this.consolidateLegacyConfig()` where it currently calls `verifyLegacyConfigMigration()`.

Run the quality gate; confirm Task 2.1 tests pass and no existing test regresses (update any test that asserted the old "bail when present" behavior, recording the change as a divergence). Commit: `feat(core): make legacy config consolidation reliable and git-aware`.

#### [x] Task 2.3: Documentation for consolidation

Update the `docs/technical-context.md` legacy-config subsection (the one documenting `verifyLegacyConfigMigration`, §8.13) to describe `consolidateLegacyConfig`: the both-files-vs-legacy-only branches, the git-aware removal rule, the authoritative-`.tangyr.jsonc` invariant, and the single-root scope/limitation. Update the `initialize()` call-tree diagram. Commit with the implementation or as a `docs(...)` commit.

### [ ] Activity 3: Default archive path, config value-migration, and archive relocation

Implement architectural decisions 3 and 4. Read `constants.ts`, `index.ts`, `archiveService.ts`, `configMigration/types.ts`, `configMigration/migrationService.ts`, and `configMigration/registry.ts` first.

#### [ ] Task 3.1: Write failing tests

- **Constant/default:** a newly added archiving section / new config receives `archivePath: ".tangyr/agent-sessions"`.
- **Value-migration:** `migrateValue` rewrites `docs/archive/agent-sessions` → `.tangyr/agent-sessions`; rewrites empty/unset → `.tangyr/agent-sessions`; **preserves** any other value; is idempotent on the new default. Add to the `ConfigMigrationService` tests that, after `mergeIntoConfig`, a registered section's `migrateValue` has been applied to the existing value.
- **Reconciliation:** in `archiveService` tests, when `currentConfig.archivePath === '.tangyr/agent-sessions'` and a non-empty tree exists at `docs/archive/agent-sessions`, the first cycle invokes `moveArchive('docs/archive/agent-sessions', '.tangyr/agent-sessions')` exactly once and not on subsequent cycles; when the configured path is a custom value, reconciliation does not run; when the historical directory is absent/empty, no move occurs.

Confirm the new tests fail before implementation.

#### [ ] Task 3.2: Change the default and add the historical-default constant

In `constants.ts`: set `DEFAULT_ARCHIVE_PATH = '.tangyr/agent-sessions'` and add `export const HISTORICAL_DEFAULT_ARCHIVE_PATH = 'docs/archive/agent-sessions';` with a comment noting it exists for the one-release relocation and may be retired once the field has converged.

#### [ ] Task 3.3: Add the `migrateValue` value-migration mechanism

- Extend `ConfigSectionDefinition` (`configMigration/types.ts`) with an optional `migrateValue?: (existing: unknown) => unknown`.
- In `ConfigMigrationService.mergeIntoConfig`, after merging missing sections and before stamping the version, for each registered section whose key is present in `merged` and which defines `migrateValue`, apply `merged[section.key] = section.migrateValue(merged[section.key])`. Keep this generic — no archiving-specific logic in the service.
- In the archiving feature registration (`index.ts` `registerWithCore`), add `migrateValue` to the registered section: given the current section value, return it with `archivePath` rewritten to `DEFAULT_ARCHIVE_PATH` when the current `archivePath` equals `HISTORICAL_DEFAULT_ARCHIVE_PATH` or is absent/empty; otherwise return it unchanged. Handle a non-object/undefined existing value safely.

#### [ ] Task 3.4: Add idempotent archive-location reconciliation to the service

In `archiveService.ts`, add a one-shot `reconcileArchiveLocation()` invoked at the start of the first cycle (gate with a private `_locationReconciled` flag, or fold into the existing `_needsDedup` one-shot, running before `deduplicateAndHydrate`). It must: return early unless `currentConfig.archivePath === DEFAULT_ARCHIVE_PATH`; check that the configured path differs from `HISTORICAL_DEFAULT_ARCHIVE_PATH`; read the historical directory and return if it is missing or empty; otherwise call the existing `moveArchive(HISTORICAL_DEFAULT_ARCHIVE_PATH, currentConfig.archivePath)`. It must be silent and must not throw out of the cycle. Reuse `moveArchive`'s loss-safe copy-then-delete; do not introduce a new deletion path.

Run the quality gate; confirm Task 3.1 tests pass. Commit: `feat(archiving): default to .tangyr/agent-sessions and migrate existing archives`.

### [ ] Activity 4: Documentation and final verification

#### [ ] Task 4.1: Update `docs/technical-context.md`

Document, in the archiving model section: the new default `.tangyr/agent-sessions`; the `migrateValue` value-migration mechanism and the historical-default rewrite rule (custom paths preserved); and the idempotent `reconcileArchiveLocation` relocation, including its gate and silence. Update any version/last-updated header fields per the existing convention.

#### [ ] Task 4.2: Full-suite verification and reflection

Run the full quality gate one final time; confirm zero regressions and that coverage on the touched files did not drop. Compile the Reflection sub-block in "Divergences and notes" (divergence count by cause, recurring patterns, proposed improvements, assessment). Set the workstream status to `completed`. Propose the PR to the Human.

## Divergences and notes

- **Task 2.2**: The old test `should do nothing when .tangyr.jsonc already exists` in `extensionStateManager.legacyVerify.test.ts` was updated because it used `stat = vi.fn().mockResolvedValue({})` (all stat calls succeed), which caused `.arit-toolkit.jsonc` to appear present under the new `consolidateLegacyConfig` logic. The old test's `stat` mock was asserting the old buggy behavior (bail when `.tangyr.jsonc` present regardless of legacy state). Updated: stat mock now correctly simulates only `.tangyr.jsonc` present (`.arit-toolkit.jsonc` absent), which is the actual no-op case per SPEC-002. Change recorded per WS-0021 Task 2.2 instruction.

- **Task 2.2 (workspaceRoot parameter)**: `removeLegacyConfigFile` was defined with `workspaceRoot: vscode.Uri` as an explicit parameter instead of accessing `this._workspaceRoot!` directly, to avoid the `@typescript-eslint/no-non-null-assertion` lint error. This is a structural improvement over the StepLedger's implicit assumption — no behavioral change.

### Reflection

_(To be completed at the end of the last activity.)_
