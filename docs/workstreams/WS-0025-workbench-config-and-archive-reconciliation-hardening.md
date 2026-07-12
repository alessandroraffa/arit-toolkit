---
id: WS-0025
title: 'Workbench config and archive reconciliation hardening'
objective: Fix the reload initialization prompt, config auto-commit hook bypass, and repeated historical archive reconciliation warnings diagnosed on 2026-06-24, and extend Claude Code session discovery to every global claude config directory ($HOME/.claude and $HOME/.claude-*).
status: in-progress
branch: fix/workbench-config-and-archive-reconciliation-hardening
created: 2026-06-24
updated: 2026-07-12
workspaces: []
dependencies:
  - WS-0021
references:
  - docs/specifications/SPEC-002-legacy-config-and-default-archive-path-migration.md
  - docs/workstreams/WS-0021-legacy-config-and-archive-path-migration.md
  - docs/reports/20260621-cross-project-tangyr-config-audit.md
---

<!-- prettier-ignore-start -->

This standalone workstream hardens the configuration and archive-migration surface. Three field symptoms observed on 2026-06-24 were root-caused directly against the current implementation, cross-checked with `docs/reports/20260621-cross-project-tangyr-config-audit.md`: parseable JSONC with trailing commas is treated as missing config, config auto-commit still runs project hooks in repositories whose Husky hook ignores `HUSKY=0`, and archive relocation reports partial failure whenever a destination file already exists, even when source and destination bytes are identical. On 2026-07-12 the Human added a fourth hardening item to the same agent-sessions surface: Claude Code session discovery reads only `$HOME/.claude`, so sessions written by Claude Code profiles that use a sibling global config directory (`$HOME/.claude-*`, as produced by `CLAUDE_CONFIG_DIR`) are never watched nor archived.

## Diagnostic findings

1. `src/utils/jsonc.ts` removes comments with regular expressions and then calls `JSON.parse`, so `.tangyr.jsonc` files formatted by Prettier with trailing commas fail to parse. `src/core/extensionStateManager.ts` then handles the first read failure as "No workspace config file found", which reopens the onboarding prompt.
2. `src/core/git.ts` implements `skipHooks` by setting `HUSKY=0` in the commit environment. Git itself has no built-in awareness of `HUSKY`; it still runs any hook configured through `core.hooksPath` unless that hook script explicitly checks the variable and exits early. A `.husky/pre-commit` script that runs `lint-staged` unconditionally therefore still executes and can reformat `.tangyr.jsonc` or fail the automated commit.
3. `src/features/agentSessionsArchiving/archiveService.ts` treats every existing destination archive file as a copy failure. A workspace with archives already copied to `.tangyr/agent-sessions` therefore receives a persistent "some archives remain" warning while the old tree is preserved.
4. (Human direction, 2026-07-12) `src/features/agentSessionsArchiving/providers/claudeCodeProvider.ts` builds both the watch pattern (`getWatchPatterns`) and the discovery path (`findSessions`) from the single hardcoded `~/.claude` directory. Sessions stored under sibling global config directories matching `$HOME/.claude-*` (created by running Claude Code with `CLAUDE_CONFIG_DIR` pointed at a per-profile directory) are invisible to watching, discovery, and archiving.

## Out of scope

This workstream does not redesign legacy `.arit-toolkit.jsonc` consolidation from WS-0021, expand automatic migration to multi-root or no-workspace VS Code sessions, add dependencies, change customized `archivePath` handling, overwrite divergent archives, or remove non-year archive directories without Human review. For Claude Code discovery it does not honor `CLAUDE_CONFIG_DIR` values pointing outside `$HOME/.claude` or `$HOME/.claude-*` (the extension host cannot observe terminal-local environment variables), does not follow symlinked `$HOME/.claude-*` entries, does not deduplicate sessions across config directories (session identifiers are UUIDs), and does not change any other session provider. Two global Claude Code config directories that hold the same session UUID — realistic only when a user bootstraps one profile directory from another (for example `cp -r ~/.claude ~/.claude-work`) before the copies diverge — both map to the same `claude-code-<uuid>` archive name; because archiving keys on the archive name and does not deduplicate across config directories, the archived copy of such a colliding session may be re-churned across cycles. Source session files under either config directory are never touched. Qualifying the archive name per config directory to resolve this collision is deliberately out of scope for this workstream.

## Execution instructions

> Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the status is `draft`, do not execute; follow `skills/draft-review/SKILL.md`. If the status is `deferred`, `canceled`, or `failed`, return to the Human for a lifecycle decision. Read this workstream, `docs/technical-context.md`, `docs/specifications/SPEC-002-legacy-config-and-default-archive-path-migration.md`, and the execution protocol. Run `source ~/.nvm/nvm.sh && nvm use 22.22` before any pnpm script. If the status is `idle`, set it to `in-progress`. Create the branch `fix/workbench-config-and-archive-reconciliation-hardening` from `main` and push it to remote.

**Before each activity** → read every task and subtask in the activity, then read each target file in full before editing.

**During execution** → follow TDD for behavior changes: write failing tests, confirm they fail for the expected reason, implement the smallest fix, then run the relevant tests. Mark each subtask `[x]` immediately after completion, then the task, then the activity. Record divergences before moving to the next task.

**Before each commit** → run the quality gate:

```bash
source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit
```

All commands must pass with zero errors and zero failures. Run targeted tests before the full gate when a task names them.

**When completing the last activity** → run the full quality gate, compile the Reflection sub-block in "Divergences and notes", set status to `completed`, and propose the PR and merge request to the Human; do not merge autonomously.

## Activities, Tasks and Subtasks

### [x] Activity 1: Make workspace config parsing and read failures precise

Fix `.tangyr.jsonc` parsing so Prettier-formatted JSONC remains readable, then separate a missing config file from an invalid config file in `ExtensionStateManager`.

#### [x] Task 1.1: Write failing JSONC parser tests

- [x] Extend `test/unit/utils/jsonc.test.ts` with a test that parses a `.tangyr.jsonc` fixture containing line comments, object trailing commas, and array trailing commas.
- [x] Add a parser test proving `https://example.test` and `value /* literal */` inside string values survive comment stripping unchanged.
- [x] Add a parser test proving a `.tangyr.jsonc` fixture whose string values contain a backslash-escaped double quote and a Windows-style path with backslashes (e.g. a value of `C:\Users\me\.tangyr`) parses back EXACTLY — the escaped quote does not terminate the string literal, backslashes are preserved in the parsed value, and any `//` or `,` appearing after such a string (outside a literal) is still stripped/removed correctly.
- [x] Add a parser test proving invalid syntax still throws a parsing error.
- [x] Run `pnpm exec vitest run test/unit/utils/jsonc.test.ts --coverage.enabled=false` and confirm the new trailing-comma fixture fails before implementation.

#### [x] Task 1.2: Implement JSONC parsing without adding dependencies

- [x] Replace the regex-only parser in `src/utils/jsonc.ts` with a scanner-based transform that removes `//` and `/* ... */` comments only outside string literals.
- [x] The scanner, while inside a string literal, treats a backslash as an escape that consumes the next character so an escaped `"` does not toggle string state — comment stripping and trailing-comma removal act only outside string literals.
- [x] Extend the same transform to remove trailing commas before `}` and `]` only when the comma is outside a string literal.
- [x] Preserve `formatJsonc` output exactly as JSON without trailing commas.
- [x] Run `pnpm exec vitest run test/unit/utils/jsonc.test.ts --coverage.enabled=false` and confirm all parser and formatter tests pass.

#### [x] Task 1.3: Distinguish missing config from invalid config

- [x] Add unit coverage in `test/unit/core/extensionStateManager.test.ts` for a single-root workspace where `.tangyr.jsonc` exists but contains invalid JSONC: initialization must not show the onboarding prompt and must log an invalid config warning; assert `manager.isInitialized` is `true`, `manager.isEnabled` is `false`, and the manager's `_fullConfig` remains `undefined` (no prior in-memory config existed before this first read).
- [x] Add unit coverage for the existing missing-file path: when `.tangyr.jsonc` is absent and no legacy config can be read, initialization still shows `Tangyr Workbench: Initialize this workspace for advanced features?`.
- [x] Add watcher-reload coverage in `test/unit/core/extensionStateManager.test.ts` using the existing file-watcher callback pattern: initialize the manager with a valid config where `enabled` is `true`, make the subsequent watcher `readFile` return invalid JSONC, invoke the captured `onDidChange` callback, and assert `manager.isEnabled` remains `true`, the previous `_fullConfig` object is retained, `showInformationMessage` is not called with `Tangyr Workbench: Initialize this workspace for advanced features?`, and `showErrorMessage` is called exactly once with the exact text `Tangyr Workbench: .tangyr.jsonc is invalid. Fix the file and save it to re-enable advanced features.`.
- [x] Add a watcher save-recovery test in `test/unit/core/extensionStateManager.test.ts`: continuing from the prior invalid-JSONC watcher-reload scenario, make the subsequent watcher `readFile` return valid JSONC with `enabled: true`, invoke the captured `onDidChange` callback a second time, and assert `manager.isEnabled` becomes `true`, `manager.isInitialized` is `true`, and no workspace-reload or `deactivate` API is invoked — recovery happens entirely through the existing watcher `reload()` callback triggered by the save.
- [x] Add a message-frequency test in `test/unit/core/extensionStateManager.test.ts`: invoke the captured `onDidChange` callback twice in direct succession with invalid JSONC both times, and assert `showErrorMessage` is called exactly once across both invocations.
- [x] Add a message-reset test in `test/unit/core/extensionStateManager.test.ts`: after the two-consecutive-invalid scenario, make the watcher `readFile` return valid JSONC and invoke `onDidChange` once (successful parse), then make the watcher `readFile` return invalid JSONC again and invoke `onDidChange` a further time; assert `showErrorMessage` is called again for this second invalid streak.
- [x] Run `pnpm exec vitest run test/unit/core/extensionStateManager.test.ts --coverage.enabled=false` and confirm the new invalid-config, watcher-reload, save-recovery, message-frequency, and message-reset tests fail before implementation.
- [x] Rewrite `readCurrentConfigFile()` in `src/core/extensionStateManager.ts` to read and parse `.tangyr.jsonc` inline instead of delegating to the shared `readConfigFile()` helper; leave `readConfigFile()` itself unchanged so `tryReadLegacyConfigFile()` and `consolidateLegacyConfig()`'s legacy-file reads keep their current behavior. Wrap the `vscode.workspace.fs.readFile(configUri)` call in a try/catch that rethrows unchanged, preserving the existing `readStateFromFile()` outer catch → `handleConfigReadFailure()` path (a `FileNotFound`/`ENOENT` code — classified with the same structured-error-code check used by `isFileNotFound` in `src/features/skillBundleEdit/session.ts:23` and `isBenignAbsent` in `src/features/agentSessionsArchiving/companionDataResolver.ts:67-75` — routes to the existing legacy-fallback → onboarding path; any other read-error code also routes to the existing `handleConfigReadFailure` path unchanged). Wrap the `parseJsonc(...)` call in a second, separate try/catch local to `readCurrentConfigFile()`: on ANY throw from `parseJsonc`, regardless of error code or message content and without inspecting the error message text (no substring matching), call a new private method `handleInvalidConfig(err)` and return without calling `applyConfig()`, `handleConfigReadFailure()`, or the legacy-config read.
- [x] Implement `handleInvalidConfig(err: unknown): void` in `src/core/extensionStateManager.ts`: when `this._fullConfig` is already set (a prior successful parse exists — the watcher-reload case), leave `_isInitialized`, `_isEnabled`, and `_fullConfig` unchanged. When `this._fullConfig` is `undefined` (the first read this activation, no prior in-memory state), set `this._isInitialized = true` and `this._isEnabled = false`, and leave `this._fullConfig` as `undefined`. In both cases, log the parse error at `warn`.
- [x] From `handleInvalidConfig`, surface exactly one `showErrorMessage` per continuous invalid-config streak with this exact text: `Tangyr Workbench: .tangyr.jsonc is invalid. Fix the file and save it to re-enable advanced features.` Add a private field `_invalidConfigMessageShown = false`; set it to `true` immediately before showing the message and skip showing the message when it is already `true`; reset it to `false` at the start of `applyConfig()` (the single successful-parse path shared by the primary read, the watcher reload, and the legacy/migration reads) so the next invalid read after any successful parse shows the message again.
- [x] Run `pnpm exec vitest run test/unit/core/extensionStateManager.test.ts --coverage.enabled=false` and confirm all tests pass.

#### [x] Task 1.4: Update impacted documentation

- [x] Update `docs/technical-context.md` §8.1 "Workspace State Persistence" to state that `.tangyr.jsonc` accepts JSONC comments and trailing commas, and that invalid config is reported as invalid rather than treated as absent.
- [x] Update `docs/technical-context.md` §4.4 "Activation and Initialisation Sequence" to state that `Tangyr Workbench: Initialize this workspace for advanced features?` is shown only when `.tangyr.jsonc` is absent and no legacy config can be read; that an existing but invalid `.tangyr.jsonc` never triggers this prompt and instead shows `Tangyr Workbench: .tangyr.jsonc is invalid. Fix the file and save it to re-enable advanced features.`; and that saving a corrected file re-enables advanced features through the existing watcher `reload()` callback with no workspace reload required.
- [x] Update `README.md` "Extension Toggle" section with the new invalid-config error/recovery path: an existing but invalid `.tangyr.jsonc` shows `Tangyr Workbench: .tangyr.jsonc is invalid. Fix the file and save it to re-enable advanced features.` instead of the onboarding prompt, and saving a corrected file re-enables advanced features automatically.

#### [x] Task 1.5: Commit changes

- [x] Run the quality gate from the execution instructions.
- [x] Commit with message `fix(core): parse jsonc config and classify invalid files`.

### [ ] Activity 2: Make automated config commits bypass hooks deterministically

Replace the environment-only hook bypass with Git's hook-bypass flag, and verify that the automated commit command cannot run repository-local pre-commit hooks.

#### [ ] Task 2.1: Write failing git helper tests for `--no-verify`

- [ ] Extend `test/unit/core/git.test.ts` so `gitStageAndCommit` with `skipHooks: true` is expected to call `git commit --no-verify -m <message> -- <file>`.
- [ ] Keep the existing assertion that the commit environment includes `HUSKY=0` when `skipHooks: true`, preserving compatibility with Husky-managed repositories that inspect that variable.
- [ ] Add a sibling test proving `skipHooks: false` does not pass `--no-verify`.
- [ ] Run `pnpm exec vitest run test/unit/core/git.test.ts --coverage.enabled=false` and confirm the `--no-verify` assertion fails before implementation.

#### [ ] Task 2.2: Implement deterministic hook bypass

- [ ] Update `src/core/git.ts` so `gitStageAndCommit` builds the commit argument list with `--no-verify` immediately after `commit` when `skipHooks` is true.
- [ ] Preserve the existing `HUSKY=0` environment for the same branch.
- [ ] Preserve the existing best-effort unstage behavior when the commit command fails.
- [ ] Run `pnpm exec vitest run test/unit/core/git.test.ts test/unit/core/configAutoCommit.test.ts --coverage.enabled=false` and confirm all targeted tests pass.

#### [ ] Task 2.3: Add a regression fixture for hook-insensitive repositories

- [ ] Add a unit test in `test/unit/core/git.test.ts` named `skipHooks uses git-level bypass for hooks that ignore HUSKY` that asserts the command arguments contain `--no-verify` and the environment contains `HUSKY=0`.
- [ ] Do not create a real Git repository fixture; keep the test at the `execFile` call boundary used by the existing git helper tests.

#### [ ] Task 2.4: Update impacted documentation

- [ ] Update `README.md` "Config auto-commit" text to state precisely that the automated `.tangyr.jsonc` commit runs `git commit --no-verify`, which bypasses ALL repository-local Git hooks (pre-commit, commit-msg, and any other hook configured via `core.hooksPath`) for that commit — not only Husky-aware hooks that check `HUSKY=0` — plus the `HUSKY=0` environment variable kept for compatibility with Husky-managed repositories; that this is intentional because the VS Code extension host cannot reliably satisfy arbitrary repository-local hook scripts; and that it is safe specifically for this automated commit because `.tangyr.jsonc` is a machine-managed, credential-free configuration file — the extension handles no credentials.
- [ ] Update `docs/technical-context.md` §4.4 "Activation and Initialisation Sequence" Checkup flow and §8.1 "Workspace State Persistence" write path with the same hook-bypass contract — `--no-verify` bypasses all repository-local Git hooks for the automated commit, not only Husky-aware ones, plus `HUSKY=0` — and the same two reasons: the extension host cannot reliably satisfy arbitrary repository hooks, and `.tangyr.jsonc` is machine-managed and credential-free.

#### [ ] Task 2.5: Commit changes

- [ ] Run the quality gate from the execution instructions.
- [ ] Commit with message `fix(core): bypass git hooks for config auto-commit`.

### [ ] Activity 3: Make archive relocation content-aware and actionable

Stop treating byte-identical preexisting archive destinations as relocation failures, preserve divergent conflicts without overwriting, and make partial failure logs actionable enough for manual reconciliation.

#### [ ] Task 3.1: Write failing archive relocation tests

- [ ] Extend `test/unit/features/agentSessionsArchiving/archiveService.moveEntry.test.ts` with a case where `docs/archive/agent-sessions/2026/06/file.md` and `.tangyr/agent-sessions/2026/06/file.md` both exist with identical bytes: relocation must treat the file as success and must delete the historical root when every entry succeeds.
- [ ] Add a case where the same source and destination paths exist with different bytes: relocation must not overwrite the destination, must preserve the historical root, and must log a warning containing the relative path.
- [ ] Add a top-level file case for identical bytes, covering flat-layout legacy files such as `202511072052.md`.
- [ ] Add a `.DS_Store` case proving that Finder metadata in the historical archive root is ignored for relocation success and never copied to the new archive root.
- [ ] Add a case where a file exists at both the source and destination paths but the destination `vscode.workspace.fs.readFile` (or `stat`) call throws: relocation must treat the entry as a FAILURE — the source file is preserved, the historical archive root is NOT deleted, and a warning is logged — never a success.
- [ ] Add a case where `2026/06/` contains a `.DS_Store` file that differs in byte content between the historical root and the new archive root: relocation must not mark the `2026/06` month as failed because of the `.DS_Store` divergence, and `workspace.fs.copy` must never be called with a `.DS_Store` source.
- [ ] Extend the `createMockLogger()` helper in this test file with a `show: vi.fn()` field. Add a test in the `reconcileArchiveLocation` describe block asserting that the partial-failure `showWarningMessage` call's action-button arguments include `'View Log'`, and a companion test that configures `window.showWarningMessage` to resolve to `'View Log'` for the partial-failure scenario and asserts `logger.show` is called.
- [ ] Run `pnpm exec vitest run test/unit/features/agentSessionsArchiving/archiveService.moveEntry.test.ts --coverage.enabled=false` and confirm the identical-destination, different-bytes, destination-read-throw, top-level `.DS_Store`, nested `2026/06/.DS_Store`, and `View Log` action tests all fail before implementation.

#### [ ] Task 3.2: Implement the shared relocation helper and byte-identical destination success

- [ ] Add a private predicate `shouldIgnoreArchiveEntry(name: string, type: vscode.FileType): boolean` in `src/features/agentSessionsArchiving/archiveService.ts` that returns `true` only when `type` is `vscode.FileType.File` and `name` is exactly `.DS_Store`.
- [ ] Add a private helper `relocateFile(srcUri: vscode.Uri, destUri: vscode.Uri, label: string, logPrefix: string): Promise<boolean>` in the same file. When `vscode.workspace.fs.stat(destUri)` throws (destination absent), copy `srcUri` to `destUri` with `{ overwrite: false }`, returning `true` on success; on a copy failure, log a warning of the form `<logPrefix>: failed to move "<label>" — <error>` and return `false`.
- [ ] In `relocateFile`, when the destination exists, read both `srcUri` and `destUri` with `vscode.workspace.fs.readFile` and compare byte length and every byte. When reading or comparing either file throws for ANY reason (read failure, stat failure, or any other error), log a warning of the form `<logPrefix>: failed to compare "<label>" — <error>` and return `false` — this byte-comparison failure path must NEVER return `true`; treat it identically to a confirmed byte mismatch so the source is always preserved (SPEC-002 Constraint 4: no deletion before the copy is confirmed) and the KZ-2026-06-21-001 catch-returns-success anti-pattern is not reintroduced in this irreversible copy-then-delete path.
- [ ] In `relocateFile`, when both byte arrays read successfully and are byte-identical, return `true` without copying and without logging a warning; when they read successfully and differ, log a warning of the form `<logPrefix>: destination differs for "<label>" — leaving source for manual reconciliation` and return `false` without overwriting the destination.
- [ ] Update `moveTopLevelFile` to build `srcUri`/`destUri` from `oldUri`/`newUri`/`name` as today, then call and return `relocateFile(srcUri, destUri, name, 'moveTopLevelFile')`, removing the prior stat-only existence check and the prior direct `vscode.workspace.fs.copy` call.

#### [ ] Task 3.3: Apply content-aware behavior to year/month relocation

- [ ] Update `moveMonthDirectory` to skip any entry where `shouldIgnoreArchiveEntry(fileName, fileType)` is `true` (the nested `.DS_Store` case) before the existing `fileType !== vscode.FileType.File` guard; skipped entries do not call `relocateFile`, are not copied, and do not affect the month's `allOK` result.
- [ ] Update `moveMonthDirectory` so each remaining `vscode.FileType.File` entry is relocated via `relocateFile`, passing the per-file source and destination URIs, a label composed of `<label>/<fileName>` (where `<label>` is the existing `yyyy/mm` argument), and `logPrefix` `moveMonthDirectory`; set `allOK = false` when `relocateFile` returns `false`, and continue processing the remaining files in the month regardless of individual failures.
- [ ] Remove the prior stat-only existence check and the prior direct `vscode.workspace.fs.copy` call from `moveMonthDirectory` — both are now handled inside `relocateFile`.
- [ ] Keep the existing `vscode.workspace.fs.readDirectory` read-failure handling for the month directory itself unchanged: a read failure on the month directory returns `false` and preserves the historical archive root.

#### [ ] Task 3.4: Ignore known non-archive metadata entries and make the partial-failure warning actionable

- [ ] Update `moveEntry` to return `true` without copying when `shouldIgnoreArchiveEntry(name, type)` is `true` — this is the top-level `.DS_Store` case — evaluated before the `vscode.FileType.File` and `/^\d{4}$/` directory checks.
- [ ] Keep non-year directories, symlinks, and unrecognized entries as failures that preserve the historical root.
- [ ] Add a `'View Log'` action button to the `reconcileArchiveLocation` partial-failure `showWarningMessage` call in `src/features/agentSessionsArchiving/archiveService.ts`; extend the message text to direct the maintainer to `docs/operations/runbooks/agent-session-archiving-verification.md` for reconciliation steps; when the resolved action is `'View Log'`, call `this.logger.show()`.
- [ ] Run `pnpm exec vitest run test/unit/features/agentSessionsArchiving/archiveService.moveEntry.test.ts test/unit/features/agentSessionsArchiving/archiveService.reconcile.test.ts --coverage.enabled=false` and confirm all targeted archive relocation tests pass, including the new destination-read-throw, nested `.DS_Store`, and `View Log` action tests from Task 3.1.

#### [ ] Task 3.5: Update impacted documentation

- [ ] Update `docs/technical-context.md` §8.6 "Agent Session Archiving Model" under "Default archive path and historical migration" to document the shared `relocateFile` helper's byte-identical destination handling, that a byte-comparison or stat failure on either file is treated identically to a byte mismatch and never as success, the `shouldIgnoreArchiveEntry` `.DS_Store` ignore rule applied at both the top-level (`moveEntry`) and per-month (`moveMonthDirectory`) traversal, and the invariant that divergent archives are never overwritten.
- [ ] Update `docs/operations/runbooks/agent-session-archiving-verification.md` with a manual reconciliation checklist: compare old and new archive trees, delete the old tree only after all divergent files have a Human disposition, leave non-year directories untouched until reviewed, and use the partial-failure warning's `View Log` action (or the Tangyr Workbench output channel) to see which entries diverged.
- [ ] Add a note to the same runbook that two global Claude Code config directories holding the same session UUID (see this workstream's "Out of scope" cross-directory same-UUID note) can cause an archived copy to be re-churned across cycles, and that this is expected and benign because source session files are never touched.

#### [ ] Task 3.6: Verify the bundled extension path

- [ ] Run the quality gate from the execution instructions.
- [ ] Run `pnpm run test:integration:vitest` to verify the bundled extension path still works after config parsing, git helper, and archive relocation changes.

#### [ ] Task 3.7: Commit changes

- [ ] Commit with message `fix(archiving): reconcile identical archive destinations`.

### [ ] Activity 4: Discover Claude Code sessions in every global claude config directory

Extend `ClaudeCodeProvider` so session watching and discovery cover `$HOME/.claude` and every sibling directory matching `$HOME/.claude-*`, instead of the single hardcoded `$HOME/.claude`.

#### [ ] Task 4.1: Write failing multi-directory discovery tests

- [ ] Add `vi.mock('node:fs', ...)` to `test/unit/features/agentSessionsArchiving/providers/claudeCodeProvider.test.ts` exposing a mockable `readdirSync`; default it to a single directory entry named `.claude` so the existing single-directory tests keep passing unchanged.
- [ ] Add a test where `readdirSync` returns Dirent-like entries `.claude` (directory), `.claude-work` (directory), `.claude-personal` (directory), `.claude.json` (file), `.claude-backup.tar` (file), and `.clauderc` (directory): `findSessions` must read `projects/<encoded>` under `.claude`, `.claude-personal`, and `.claude-work` only, in lexicographic order.
- [ ] Add a test where session files exist in both `~/.claude/projects/<encoded>` and `~/.claude-work/projects/<encoded>` (mock `workspace.fs.readDirectory` keyed on the requested `fsPath`): `findSessions` returns the union of the sessions from both directories.
- [ ] Add a test where `readdirSync` throws: `findSessions` reads only `~/.claude/projects/<encoded>` and `getWatchPatterns` returns the single `~/.claude` pattern.
- [ ] Add a `getWatchPatterns` test: with `.claude` and `.claude-work` directories present, it returns one `WatchPattern` per config directory, each with `baseUri` ending in `<configDir>/projects/<encoded>` and glob `**/*`.
- [ ] Add a test where `readdirSync` returns a `.claude` Dirent-like entry with `isDirectory()` returning `false` and `isSymbolicLink()` returning `true` (a symlinked `~/.claude`, as produced by stow, chezmoi, or dotbot): assert `listClaudeConfigDirNames()` still includes `.claude` and `findSessions` still reads its sessions. In the same fixture, add a `.claude-work` Dirent-like entry with `isDirectory()` returning `false` and `isSymbolicLink()` returning `true`: assert `.claude-work` is excluded.
- [ ] Run `pnpm exec vitest run test/unit/features/agentSessionsArchiving/providers/claudeCodeProvider.test.ts --coverage.enabled=false` and confirm the new multi-directory and symlinked-`.claude` tests fail before implementation while the pre-existing tests pass.

#### [ ] Task 4.2: Implement multi-directory enumeration

- [ ] Add a module-level function `listClaudeConfigDirNames(): string[]` in `src/features/agentSessionsArchiving/providers/claudeCodeProvider.ts` that calls `readdirSync(os.homedir(), { withFileTypes: true })` from `node:fs` and keeps entries matching either rule: the name is exactly `.claude` and (`isDirectory()` is `true` OR `isSymbolicLink()` is `true`) — so a symlinked `~/.claude` keeps working — or the name starts with `.claude-` and `isDirectory()` is `true` — symlinked `.claude-*` siblings are excluded, matching the existing out-of-scope carve-out ("does not follow symlinked `$HOME/.claude-*` entries"). Return the matched names sorted lexicographically; when `readdirSync` throws, return `['.claude']`.
- [ ] Update `getWatchPatterns` to return one `WatchPattern` per config directory name, with `baseUri` built from `path.join(os.homedir(), configDirName, 'projects', projectDirName)` and the existing `**/*` glob.
- [ ] Update `findSessions` to iterate the config directory names, read each `<configDir>/projects/<encoded>` with the existing per-directory try/catch skip, and aggregate the `SessionFile` results across directories without cross-directory deduplication.
- [ ] Run `pnpm exec vitest run test/unit/features/agentSessionsArchiving/providers/claudeCodeProvider.test.ts --coverage.enabled=false` and confirm all provider tests pass.

#### [ ] Task 4.3: Update impacted documentation

- [ ] Update the Claude Code row of the provider table in the `README.md` "Agent Sessions Archiving" section so the location column states sessions are discovered under `~/.claude/projects/<workspace-path>/` and every `~/.claude-*/projects/<workspace-path>/` profile directory.
- [ ] Update `docs/technical-context.md` §3.1 "Business Context" ("AI agent session files" row) and §3.2 "Technical Context" ("Global filesystem" row) to include `~/.claude-*/` alongside `~/.claude/`.
- [ ] Update `docs/technical-context.md` §8.6 "Agent Session Archiving Model" path-based discovery description with the multi-directory rule: enumerate `$HOME` for `.claude` plus `.claude-*` directories, lexicographic order, fall back to `.claude` alone when the home directory cannot be listed.

#### [ ] Task 4.4: Final verification and reflection

- [ ] Run the quality gate from the execution instructions.
- [ ] Run `pnpm run test:integration:vitest` to verify the bundled extension path still works after the session discovery changes.
- [ ] Compile the Reflection sub-block in "Divergences and notes".
- [ ] Update the frontmatter `status` to `completed` only after every activity, test, and documentation update is complete.

#### [ ] Task 4.5: Commit changes

- [ ] Commit with message `feat(archiving): discover claude code sessions across config dirs`.

## Requirement-to-task traceability

| Objective | Covered by |
| --- | --- |
| Stop reload onboarding prompts caused by valid JSONC syntax | Activity 1 Tasks 1.1-1.4 |
| Keep invalid config distinct from missing config | Activity 1 Task 1.3 |
| Prevent automated config commits from running project hooks | Activity 2 Tasks 2.1-2.4 |
| Stop repeated archive warnings for byte-identical migrated files | Activity 3 Tasks 3.1-3.5 |
| Preserve divergent archive conflicts for Human reconciliation | Activity 3 Tasks 3.1, 3.2, 3.3, 3.5 |
| Discover Claude Code sessions in `$HOME/.claude` and every `$HOME/.claude-*` directory | Activity 4 Tasks 4.1-4.3 |

## Divergences and notes

- Note (F13, non-mandatory): Activity 4 may optionally introduce a `buildProjectUri(home, configDir, projectDir)` DRY helper for `getWatchPatterns`/`findSessions` to remove the duplicated `path.join(os.homedir(), configDirName, 'projects', projectDirName)` construction. This is not required for Task 4.2 completion and does not gate any checkbox; apply it only if doing so does not expand Task 4.2's specified behavior.
- **Session resume (2026-07-12), checkbox reconciliation**: the prior session was interrupted by an infrastructure error (API stream watchdog) after substantially writing the `src/utils/jsonc.ts` scanner and its tests but before marking Task 1.2. On resume, `pnpm exec vitest run test/unit/utils/jsonc.test.ts` was run and all 15 tests passed (including the F12 backslash-escape/Windows-path fixture). Cross-checked every Task 1.2 subtask against `src/utils/jsonc.ts`: scanner-based comment stripping (`stripJsoncArtifacts`), string-literal-aware backslash-escape handling (`consumeStringLiteral`), outside-string trailing-comma removal (`isTrailingComma`), and unchanged `formatJsonc` (still `JSON.stringify`, no trailing commas) are all present and correct. Task 1.2 and its five subtasks were marked `[x]` to match verified reality; no implementation changes were needed.
- **Task 1.3**: the StepLedger asks to "wrap the `vscode.workspace.fs.readFile(configUri)` call in a try/catch that rethrows unchanged". A literal `try { ... } catch (err) { throw err; }` triggers this project's `no-useless-catch` ESLint rule (part of `eslint:recommended`, enforced on `src/**/*.ts`). The `readFile` call is left unwrapped in `readCurrentConfigFile()` instead, so a read failure propagates directly to `readStateFromFile()`'s existing outer `try/catch → handleConfigReadFailure()`, which is behaviorally identical to a wrap-and-rethrow (confirmed by the passing "missing config" and "existing missing-file path" tests) and keeps the lint gate green. Only the `parseJsonc(...)` call is wrapped in a local `try/catch` that routes to the new `handleInvalidConfig(err)`, per the rest of the task.
- **StepLedger accuracy divergence (Task 1.4)**: the run journal (`.tangyr/autopilot/20260712-ws-0025-run.md`, finding F16) records that a README update for the new invalid-config error/recovery path was disposed as an approved correction to Task 1.4, but the on-disk Task 1.4 in this draft carried only the two `docs/technical-context.md` bullets — the README bullet was never mechanically applied (it is present, correctly, under Task 2.4 for the unrelated hook-bypass README update, which appears to be where the correction landed instead). This is an authoring-time cross-verification gap in the draft, not a new decision: F16's content was already fully authored and approved. Added the missing README bullet to Task 1.4 and implemented it (`README.md` "Extension Toggle" section, new "Invalid config recovery" paragraph) within this activity, since the correction was already within the review gate's delegated authority and does not expand scope.

### Reflection

_To be compiled at StepLedger completion._

<!-- prettier-ignore-end -->
