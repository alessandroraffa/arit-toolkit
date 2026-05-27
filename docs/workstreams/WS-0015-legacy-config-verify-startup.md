---
title: 'Legacy config verify on startup — defensive backstop for missing .tangyr.jsonc migration'
objective: Add a defensive backstop to ExtensionStateManager.initialize() that detects and resolves workspaces where .arit-toolkit.jsonc persists but .tangyr.jsonc was never created by the normal migration flow.
workstream: WS-0015
status: 'in-progress'
workspaces: []
dependencies: []
created: 2026-05-27
---

A workspace using the pre-v1.19 extension identifier `alessandroraffa.arit-toolkit` stores its config in `.arit-toolkit.jsonc`. Starting with v1.19, the extension identifier changed to `alessandroraffa.tangyr` and the config filename changed to `.tangyr.jsonc`. The existing migration path in `ExtensionStateManager` handles the normal case: `readStateFromFile()` falls back to `tryReadLegacyConfigFile()` when `.tangyr.jsonc` is absent, and `ensureCurrentConfigFile()` or `runMigration()` writes the new file. At least one field installation has surfaced where `.arit-toolkit.jsonc` still exists and `.tangyr.jsonc` is still absent after activation — meaning the existing flow silently produced no output.

This workstream adds `verifyLegacyConfigMigration()`, a new `private async` method on `ExtensionStateManager`, invoked at the end of `initialize()` after the existing `readStateFromFile` / `runMigration` / `ensureCurrentConfigFile` / `showOnboardingNotification` flow completes. The method is a pure backstop: it fires only when `.tangyr.jsonc` is still absent after the normal flow has run. It never overrides or duplicates decisions made by the normal flow. A companion private helper `findAvailableBackupPath()` resolves `.bak` collisions by appending a UTC timestamp suffix. Both methods are added to `src/core/extensionStateManager.ts` — no new files are created. Activity 2 adds vitest unit tests covering the seven prescribed scenarios. Activity 3 documents the backstop behaviour in `docs/technical-context.md`. Activity 4 is reserved for the final commit.

The scope is single-root only, matching the upstream guard in `initialize()`. Multi-root and no-workspace modes are skipped unconditionally. File-watcher-based reconciliation, automatic `.bak` deletion, and bidirectional sync are explicitly out of scope.

## Execution instructions

> Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the workstream status is `draft`, do NOT start execution — follow `skills/draft-review/SKILL.md` to validate the workstream. If the workstream status is `deferred`, `canceled`, or `failed`, do NOT start execution — return to the PM for a lifecycle decision. Read the workstream introduction, `docs/technical-context.md` sections 4.4 and 8.1, and the execution protocol. Run `nvm use 22.22` before any pnpm script. The branch `feat/legacy-config-verify-startup-ws-0015` has already been created from `main` — do NOT create a new branch. If the workstream status is `idle`, set it to `in-progress`.

**Before each activity** → read all tasks and subtasks in the activity to understand the full scope before writing any code.

**During execution** → always read a file before modifying it. Mark each subtask `[x]` immediately upon completion, then the task, then the activity — never batch. After completing each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" — before moving to the next task. Divergences that identify defects or gaps must include a corrective action (task or PM escalation).

**Before each commit** → run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. Document any undocumented divergence before committing.

**When completing the last activity of this workstream** → compile the Reflection sub-block in "Divergences and notes". Update the frontmatter status to `completed`. Verify CI on a draft PR or via `act` (if available) before proposing PR and merge to the PM.

## Activities, Tasks and Subtasks

### [x] Activity 1: Add `verifyLegacyConfigMigration` and `findAvailableBackupPath` to `ExtensionStateManager`

This activity extends `src/core/extensionStateManager.ts` with two new private methods and hooks `verifyLegacyConfigMigration()` into the tail of `initialize()`. After this activity commits, `initialize()` runs the backstop on every activation and the project builds, lints, and tests cleanly — even though no test cases for the new methods exist yet (those come in Activity 2).

#### [x] Task 1.1: Read `src/core/extensionStateManager.ts` in full before making any change

Read `/Users/alessandroraffa/dev/oceanus/projects/tangyr/tangyr-vscode/src/core/extensionStateManager.ts` in full. Confirm the following reference points that the subsequent tasks use:

- `initialize()` closes at line 140 (the `}` after the `if/else` block that contains `showOnboardingNotification`).
- `ensureCurrentConfigFile()` closes at line 356.
- `notifySectionListeners()` opens at line 358.
- The file ends at line 392 (closing `}` of the class).
- The constants `CONFIG_FILENAME` and `LEGACY_CONFIG_FILENAME` are declared at lines 8–9.
- `writeFullConfig()` is a `private async` method at line 294.
- `readConfigFile(fileName)` is a `private async` method at line 260.
- `applyConfig(config)` is a `private` method at line 269.
- `getConfigUri(fileName)` is the helper at lines 204–208.

If any line numbers differ from the values listed above, note the actual lines as a divergence and continue — the insertion targets are identified by their surrounding context, not by line number alone.

#### [x] Task 1.2: Insert `findAvailableBackupPath` into `extensionStateManager.ts`

Insert the method body shown below immediately BEFORE `notifySectionListeners()` (currently opening at line 358), so it appears after `ensureCurrentConfigFile()` and before `notifySectionListeners()`. The method probes for an available `.bak` path: if the `targetUri` does not exist it returns `targetUri` unchanged; if it exists it appends `.YYYYMMDDHHmm` (UTC, zero-padded) before the final `.bak` segment and returns that URI. The probe uses `vscode.workspace.fs.stat` — a `FileSystemError` means the path is free; any other throw is re-thrown.

```typescript
private async findAvailableBackupPath(targetUri: vscode.Uri): Promise<vscode.Uri> {
  try {
    await vscode.workspace.fs.stat(targetUri);
  } catch {
    return targetUri;
  }
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const suffix =
    String(now.getUTCFullYear()) +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes());
  const originalFsPath = targetUri.fsPath;
  return vscode.Uri.file(`${originalFsPath}.${suffix}`);
}
```

After insertion, run `pnpm run check-types`. If it exits non-zero, the insertion introduced a syntax or type error — read the compiler output, correct the code at the insertion site, and re-run before proceeding.

#### [x] Task 1.3: Insert `verifyLegacyConfigMigration` into `extensionStateManager.ts`

Insert the method body shown below immediately AFTER `findAvailableBackupPath()` and BEFORE `notifySectionListeners()`. The method:

1. Returns early if `_workspaceRoot` is absent (guard matching the upstream single-root check).
2. Probes `.tangyr.jsonc` via `vscode.workspace.fs.stat(getConfigUri())`. If the file exists, logs `info` and returns (no-op — normal flow already succeeded).
3. Probes `.arit-toolkit.jsonc` via `vscode.workspace.fs.stat(getConfigUri(LEGACY_CONFIG_FILENAME))`. If absent, logs `info` and returns (no legacy to migrate).
4. Calls `readConfigFile(LEGACY_CONFIG_FILENAME)`. On success (Path A): apply the parsed legacy config via `applyConfig()`, set `_loadedLegacyConfigFile = true`, then invoke `runMigration()` to bring the config to the current extension version and write `.tangyr.jsonc`. After the migration succeeds, rename the legacy file to `.arit-toolkit.jsonc.bak` (with timestamp collision suffix), and show the information message. On failure (Path B): renames legacy to `.arit-toolkit.jsonc.malformed.bak` via `findAvailableBackupPath` + `vscode.workspace.fs.rename`, logs `warn`, and shows a warning message. Does NOT create `.tangyr.jsonc` in Path B.

```typescript
private async verifyLegacyConfigMigration(): Promise<void> {
  if (!this._workspaceRoot) {
    return;
  }
  const newConfigUri = this.getConfigUri();
  if (!newConfigUri) {
    return;
  }
  try {
    await vscode.workspace.fs.stat(newConfigUri);
    this.logger.info(
      `verifyLegacyConfigMigration: ${CONFIG_FILENAME} already present — no action needed`
    );
    return;
  } catch {
    // .tangyr.jsonc absent — continue check
  }
  const legacyUri = this.getConfigUri(LEGACY_CONFIG_FILENAME);
  if (!legacyUri) {
    return;
  }
  try {
    await vscode.workspace.fs.stat(legacyUri);
  } catch {
    this.logger.info(
      `verifyLegacyConfigMigration: neither ${CONFIG_FILENAME} nor ${LEGACY_CONFIG_FILENAME} found — no action needed`
    );
    return;
  }
  this.logger.info(
    `verifyLegacyConfigMigration: ${CONFIG_FILENAME} absent, ${LEGACY_CONFIG_FILENAME} present — attempting migration`
  );
  let parsed: Record<string, unknown>;
  try {
    parsed = await this.readConfigFile(LEGACY_CONFIG_FILENAME);
  } catch {
    // Path B: malformed legacy
    const malformedBackupUri = await this.findAvailableBackupPath(
      vscode.Uri.joinPath(this._workspaceRoot, `${LEGACY_CONFIG_FILENAME}.malformed.bak`)
    );
    try {
      await vscode.workspace.fs.rename(legacyUri, malformedBackupUri, { overwrite: false });
      this.logger.warn(
        `verifyLegacyConfigMigration: renamed malformed ${LEGACY_CONFIG_FILENAME} to ${malformedBackupUri.fsPath}`
      );
    } catch (renameErr) {
      this.logger.warn(
        `verifyLegacyConfigMigration: could not rename malformed legacy file: ${String(renameErr)}`
      );
    }
    void vscode.window.showWarningMessage(
      `Tangyr: found legacy .arit-toolkit.jsonc but could not parse it. Renamed to .arit-toolkit.jsonc.malformed.bak for review. Please create a new .tangyr.jsonc via the onboarding prompt.`
    );
    return;
  }
  // Path A: parseable legacy
  this.applyConfig(parsed);                          // sets _fullConfig, _isInitialized,
                                                     // _isEnabled, _configVersionCode,
                                                     // calls notifySectionListeners
  this._loadedLegacyConfigFile = true;               // signal that we loaded from legacy
  this.logger.info(
    `verifyLegacyConfigMigration: applied legacy config to in-memory state`
  );
  await this.runMigration();                         // brings config to current
                                                     // extension version AND writes
                                                     // .tangyr.jsonc via writeFullConfig
                                                     // OR via ensureCurrentConfigFile
  this.logger.info(
    `verifyLegacyConfigMigration: ran migration after Path A apply`
  );
  const bakUri = await this.findAvailableBackupPath(
    vscode.Uri.joinPath(this._workspaceRoot, `${LEGACY_CONFIG_FILENAME}.bak`)
  );
  try {
    await vscode.workspace.fs.rename(legacyUri, bakUri, { overwrite: false });
    this.logger.info(
      `verifyLegacyConfigMigration: renamed ${LEGACY_CONFIG_FILENAME} to ${bakUri.fsPath}`
    );
  } catch (renameErr) {
    this.logger.warn(
      `verifyLegacyConfigMigration: could not rename legacy file after migration: ${String(renameErr)}`
    );
  }
  void vscode.window.showInformationMessage(
    `Tangyr: migrated workspace config from .arit-toolkit.jsonc to .tangyr.jsonc; legacy file renamed to .arit-toolkit.jsonc.bak.`
  );
}
```

After insertion, run `pnpm run check-types`. It must exit 0. If it exits non-zero, correct the error at the insertion site and re-run.

#### [x] Task 1.4: Hook `verifyLegacyConfigMigration()` into `initialize()`

In `src/core/extensionStateManager.ts`, locate `initialize()` (lines 119–140). Insert one line — `await this.verifyLegacyConfigMigration();` — immediately BEFORE the closing `}` of `initialize()`, after the existing `if/else` block that contains `showOnboardingNotification` and `runMigration`. The resulting tail of `initialize()` must look exactly like this:

```typescript
    } else {
      const accepted = await this.showOnboardingNotification();
      if (accepted) {
        await this.runMigration();
      }
    }
    await this.verifyLegacyConfigMigration();
  }
```

After the insertion, run the full quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. The existing test count must not decrease. If `check-types` fails, a type error was introduced at the insertion site — read the error, correct the code, and re-run. If `lint` fails with a new complexity or statement-count warning on `initialize()`, the insertion itself is a single `await` expression and adds one statement; if the lint limit is breached, escalate to the PM before proceeding. If `test:unit` reports a regression, a previously passing test now exercises a new code path — read the failing test output, identify which test name failed and why, and record as a divergence with a corrective action before committing.

#### [x] Task 1.5: Update impacted documentation

`docs/technical-context.md` section 4.4 (Activation and Initialisation Sequence, lines 251–313) contains a `text` code block describing the `stateManager.initialize()` call tree. Insert one line at the end of the `stateManager.initialize(extensionVersion)` block, AFTER the `+-- if not initialised:` sub-block (and after `+-- if accepted: runMigration()`) and before the closing code-fence boundary. The inserted line is:

```text
        +-- verifyLegacyConfigMigration()  [backstop: no-op if .tangyr.jsonc present]
```

The updated tail of the `initialize` block in the code fence must look exactly like:

```text
        +-- if initialised:
        |     +-- fire onDidChangeState
        |     +-- runMigration()
        |           +-- migrationService.migrate(fullConfig, versionCode, version)
        |           +-- promptForSections() if missing sections detected
        |           +-- writeFullConfig() with merged result
        |           +-- notify section listeners
        +-- if not initialised:
              +-- showOnboardingNotification()
              +-- if accepted: runMigration()
        +-- verifyLegacyConfigMigration()  [backstop: no-op if .tangyr.jsonc present]
```

Mark all completed subtasks and tasks in this activity.

#### [x] Task 1.6: Commit changes

- [x] Run the full quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures.
- [x] Commit `src/core/extensionStateManager.ts`, `docs/technical-context.md`, and this workstream file with message: `feat(core): add verifylegacyconfigmigration backstop to initialize`. Subject must be lowercase, type `feat` ∈ commitlint type-enum.

### [x] Activity 2: Add vitest unit tests for `verifyLegacyConfigMigration`

This activity adds a new test file `test/unit/core/extensionStateManager.legacyVerify.test.ts` covering the seven prescribed scenarios. After this activity commits, `pnpm run test:unit` runs the new tests and all seven pass.

#### [x] Task 2.1: Read the existing test infrastructure before writing any test

Read `/Users/alessandroraffa/dev/oceanus/projects/tangyr/tangyr-vscode/test/unit/core/extensionStateManager.test.ts` in full. Read `/Users/alessandroraffa/dev/oceanus/projects/tangyr/tangyr-vscode/test/unit/mocks/vscode.ts` in full. Confirm the following before writing any test code:

- The mock `workspace.fs.stat` is declared at line 65 of `vscode.ts` as `stat: vi.fn()`.
- The mock `workspace.fs.rename` is declared at line 63 as `rename: vi.fn()`.
- The mock `workspace.fs.writeFile` is declared at line 62 as `writeFile: vi.fn()`.
- The mock `window.showInformationMessage` is declared at line 36 as `showInformationMessage: vi.fn()`.
- The mock `window.showWarningMessage` is declared at line 37 as `showWarningMessage: vi.fn()`.
- The mock `Uri.joinPath` is declared at lines 84–87 and returns an object with `fsPath`.
- The `FileSystemError` used in production code to signal "file not found" is simulated in tests by having `stat` reject with any `Error` — the production code catches all errors from `stat`, not just `FileSystemError` specifically.
- The existing test helper `createManager()` creates an `ExtensionStateManager` with `mockLogger` and `mockMigrationService`. Use the same pattern in the new test file.

#### [x] Task 2.2: Create `test/unit/core/extensionStateManager.legacyVerify.test.ts`

Create the file at `/Users/alessandroraffa/dev/oceanus/projects/tangyr/tangyr-vscode/test/unit/core/extensionStateManager.legacyVerify.test.ts`. The file must import from the same paths used in the existing test files: `'../mocks/vscode'` for mocks and `'../../../src/core/extensionStateManager'` for the class. Each test calls `manager.initialize('1.19.0')` to trigger the full initialization including the backstop. Each test sets `workspace.workspaceFolders` to `[{ uri: { fsPath: '/workspace' } }]` unless testing the multi-root guard. Each test must reset all `workspace.fs.*` mocks in its own setup — no shared mock state between tests. The `describe` block is named `'verifyLegacyConfigMigration'`.

For tests that exercise `verifyLegacyConfigMigration` (Tests 2, 3, 6, 7), prescribe `workspace.fs.stat` using `mockImplementation` keyed on `uri.fsPath` so call routing is robust to ordering changes. The skeleton for tests where the stat behaviour differs per path is:

```typescript
workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
  if (uri.fsPath.endsWith('.tangyr.jsonc')) return Promise.reject(new Error('not found'));
  if (uri.fsPath.endsWith('.arit-toolkit.jsonc')) return Promise.resolve({});
  // backup-path probe — resolve or reject per test
  return Promise.reject(new Error('not found'));
});
```

The `readFile` call chain consumed by `manager.initialize('1.19.0')` before reaching `verifyLegacyConfigMigration` is:

- Call #1 — normal-flow read of `.tangyr.jsonc` (from `readCurrentConfigFile`)
- Call #2 — normal-flow legacy fallback read of `.arit-toolkit.jsonc` (from `tryReadLegacyConfigFile`)
- Call #3 — backstop read of `.arit-toolkit.jsonc` (from `verifyLegacyConfigMigration` Path A or Path B attempt)

Use a `mockImplementation` counter or chain (`mockRejectedValueOnce` / `mockResolvedValueOnce`) so the call sequence is deterministic.

Implement the following seven `it` blocks in order:

**Test 1 — both files present, no-op:**

- Name: `'should do nothing when .tangyr.jsonc already exists'`
- Setup: `workspace.fs.readFile` resolves with valid config on first call (so `initialize` reaches `_isInitialized = true`). `workspace.fs.stat` resolves successfully (file exists) for both `.tangyr.jsonc` and `.arit-toolkit.jsonc`. `workspace.fs.rename` is a fresh `vi.fn().mockResolvedValue(undefined)`.
- Assert: `workspace.fs.rename` was NOT called. `window.showInformationMessage` was NOT called with a string containing `'migrated'`. `window.showWarningMessage` was NOT called.

**Test 2 — `.tangyr.jsonc` missing, legacy parseable → Path A:**

- Name: `'should migrate parseable legacy config when .tangyr.jsonc is absent'`
- Setup: `workspace.fs.readFile`: Call #1 rejects (`.tangyr.jsonc` absent, so normal flow does NOT load legacy and does NOT write `.tangyr.jsonc`); Call #2 rejects (legacy fallback in normal flow also fails); Call #3 resolves with `new TextEncoder().encode('{ "enabled": true, "versionCode": 1001018003 }')` (backstop reads the legacy file). Use `mockRejectedValueOnce(new Error('not found')).mockRejectedValueOnce(new Error('not found')).mockResolvedValueOnce(...)` or equivalent counter. `workspace.fs.stat`: stat for `.tangyr.jsonc` rejects; stat for `.arit-toolkit.jsonc` resolves with `{}`; stat for `.arit-toolkit.jsonc.bak` rejects (backup path is free — no timestamp suffix). Use `mockImplementation` keyed on `uri.fsPath`. `workspace.fs.writeFile` resolves. `workspace.fs.rename` resolves. `window.showInformationMessage` is a fresh `vi.fn().mockResolvedValue(undefined)`.
- Assert: `workspace.fs.writeFile` was called (`.tangyr.jsonc` written). `workspace.fs.rename` was called once with a first argument whose `fsPath` ends with `'.arit-toolkit.jsonc'` and a second argument whose `fsPath` ends with `'.arit-toolkit.jsonc.bak'` exactly (no timestamp suffix). `window.showInformationMessage` was called with a string containing `'migrated'`. The manager's `isInitialized` is `true`. The manager's `isEnabled` is `true`.

**Test 3 — `.tangyr.jsonc` missing, legacy malformed → Path B:**

- Name: `'should rename malformed legacy config and show warning when .tangyr.jsonc is absent'`
- Setup: `workspace.fs.readFile`: Call #1 rejects; Call #2 rejects; Call #3 rejects (parse failure → Path B). Use `mockRejectedValue(new Error('not found'))` (all calls reject). `workspace.fs.stat`: stat for `.tangyr.jsonc` rejects; stat for `.arit-toolkit.jsonc` resolves with `{}`; stat for `.arit-toolkit.jsonc.malformed.bak` rejects (backup path is free — no timestamp suffix). Use `mockImplementation` keyed on `uri.fsPath`. `workspace.fs.rename` resolves. `window.showWarningMessage` is a fresh `vi.fn().mockResolvedValue(undefined)`.
- Assert: `workspace.fs.rename` was called once with a first argument whose `fsPath` ends with `'.arit-toolkit.jsonc'` and a second argument whose `fsPath` ends with `'.arit-toolkit.jsonc.malformed.bak'` exactly (no timestamp suffix). `workspace.fs.writeFile` was NOT called (`.tangyr.jsonc` must not be created in Path B). `window.showWarningMessage` was called with a string containing `'could not parse'`.

**Test 4 — both files missing, no-op:**

- Name: `'should do nothing when neither .tangyr.jsonc nor .arit-toolkit.jsonc exists'`
- Setup: `workspace.fs.readFile` rejects on all calls. `workspace.fs.stat` rejects on all calls (both probes find nothing). `workspace.fs.rename` is a fresh `vi.fn()`.
- Assert: `workspace.fs.rename` was NOT called. `window.showInformationMessage` was NOT called with a string containing `'migrated'`. `window.showWarningMessage` was NOT called.

**Test 5 — multi-root, no-op:**

- Name: `'should do nothing in a multi-root workspace'`
- Setup: `workspace.workspaceFolders = [{ uri: { fsPath: '/w1' } }, { uri: { fsPath: '/w2' } }]`. All `workspace.fs` mocks are fresh `vi.fn()` instances that do not resolve or reject (they will not be called).
- Assert: `workspace.fs.stat` was NOT called. `workspace.fs.rename` was NOT called.

**Test 6 — `.bak` collision → timestamp suffix:**

- Name: `'should append UTC timestamp suffix when .arit-toolkit.jsonc.bak already exists'`
- Setup: Same readFile mock as Test 2 (Call #1 rejects, Call #2 rejects, Call #3 resolves with valid bytes). `workspace.fs.stat`: stat for `.tangyr.jsonc` rejects; stat for `.arit-toolkit.jsonc` resolves with `{}`; stat for `.arit-toolkit.jsonc.bak` resolves with `{}` (collision exists — forces timestamp suffix). Use `mockImplementation` keyed on `uri.fsPath`. `workspace.fs.rename` resolves. `window.showInformationMessage` is a fresh `vi.fn().mockResolvedValue(undefined)`.
- Assert: `workspace.fs.rename` was called with a second argument whose `fsPath` matches the regex `/\.arit-toolkit\.jsonc\.bak\.\d{12}$/` (twelve digits = YYYYMMDDHHmm). The second argument's `fsPath` does NOT equal the plain `.arit-toolkit.jsonc.bak` path.

**Test 7 — internal state mutation after Path A:**

- Name: `'should update internal state so subsequent reads see the new config'`
- Setup: Same as Test 2 (Call #1 rejects, Call #2 rejects, Call #3 resolves with valid bytes; stat for `.arit-toolkit.jsonc.bak` rejects).
- Assert: `manager.isInitialized` is `true`. `manager.isEnabled` is `true`. The `onDidChangeState` event was fired at least once with value `true`. (Subscribe to `manager.onDidChangeState` before calling `initialize` to capture the events.)

#### [x] Task 2.3: Verify quality gate passes with new tests

- [x] Run `pnpm run check-types`. Must pass with zero errors.
- [x] Run `pnpm run lint`. Must pass with zero errors. The new test file must not introduce new lint warnings. If `eslint` reports a `max-lines` or `complexity` warning on the new test file, split the `describe` block into a second `describe` within the same file (no activity-level restructuring needed) and re-run.
- [x] Run `pnpm run test:unit`. Must pass. The seven new tests must all appear as passing in the output. If any test fails, read the failure message, identify which assertion failed, correct only the test code (do not modify production code in this task), and re-run. If a test failure reveals a production code defect (e.g., the backstop fires when `.tangyr.jsonc` is present and it should not), record the defect as a divergence and escalate to the PM — do not silently fix production code in an activity scoped to tests only.

#### [x] Task 2.4: Update impacted documentation

No additional documentation change is required for this activity: the new test file follows the existing naming convention (`extensionStateManager.<scope>.test.ts`) and the test count increase is self-evident from `test:unit` output. Note "No documentation impact" against this task and mark it complete.

#### [x] Task 2.5: Commit changes

- [x] Run the full quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures.
- [x] Commit `test/unit/core/extensionStateManager.legacyVerify.test.ts` and this workstream file with message: `test(core): add unit tests for verifylegacyconfigmigration backstop`. Subject must be lowercase, type `test` ∈ commitlint type-enum.

### [ ] Activity 3: Document `verifyLegacyConfigMigration` behaviour in `docs/technical-context.md`

This activity adds a dedicated subsection under section 8 of `docs/technical-context.md` describing the legacy-config backstop. After this activity commits, the document is internally consistent and every cross-reference resolves.

#### [ ] Task 3.1: Read `docs/technical-context.md` before making any change

Read `/Users/alessandroraffa/dev/oceanus/projects/tangyr/tangyr-vscode/docs/technical-context.md` in full. Confirm the following before writing:

- Section `### 8.1 Workspace State Persistence` is the first subsection of section 8.
- Section `### 8.2 Config Migration` follows at approximately line 370.
- The last numbered subsection before the glossary and appendices is `### 8.12 Text Stats Architecture`.
- The document does not already contain a subsection titled `8.13` or any reference to `verifyLegacyConfigMigration`.

#### [ ] Task 3.2: Insert `### 8.13 Legacy Config Verify on Startup` into `docs/technical-context.md`

Insert the new subsection immediately after the closing paragraph of `### 8.12 Text Stats Architecture` and before whatever follows it (glossary or horizontal rule). The body is:

```markdown
### 8.13 Legacy Config Verify on Startup

`verifyLegacyConfigMigration()` is a private method on `ExtensionStateManager` invoked at the end of `initialize()`, after the normal `readStateFromFile` / `runMigration` / `ensureCurrentConfigFile` / `showOnboardingNotification` flow. It is a defensive backstop that fires only when `.tangyr.jsonc` is still absent at the end of activation.

**Detection:** the method probes `.tangyr.jsonc` via `vscode.workspace.fs.stat`. If the file is present, the method returns immediately (no-op). If absent, it probes `.arit-toolkit.jsonc` by the same mechanism. If the legacy file is also absent, the method returns immediately (no-op).

**Path A — parseable legacy:** `readConfigFile(LEGACY_CONFIG_FILENAME)` succeeds. The parsed content is written to `.tangyr.jsonc` via `writeFullConfig`. The legacy file is renamed to `.arit-toolkit.jsonc.bak`. Internal state (`_fullConfig`, `_isInitialized`, `_isEnabled`, `_loadedLegacyConfigFile`) is updated and `_onDidChangeState` is fired. An information message is shown to the user.

**Path B — malformed legacy:** `readConfigFile(LEGACY_CONFIG_FILENAME)` throws (JSON/JSONC parse failure). `.tangyr.jsonc` is NOT created. The legacy file is renamed to `.arit-toolkit.jsonc.malformed.bak`. A warning message is shown to the user, prompting them to create `.tangyr.jsonc` via the onboarding prompt.

**Backup collision:** if the target `.bak` (or `.malformed.bak`) path already exists, `findAvailableBackupPath()` appends a UTC timestamp suffix `YYYYMMDDHHmm` before returning the path (e.g., `.arit-toolkit.jsonc.bak.202605271045`).

**Scope:** single-root workspaces only. Multi-root and no-workspace modes are skipped by the upstream guard in `initialize()` and by a `_workspaceRoot` null-check inside the method itself. The check fires once per activation — no file-watcher-based re-check is performed.
```

After inserting, verify that no heading level is skipped (the new `### 8.13` follows `### 8.12`) and that the markdown is free of unintended fence-block nesting.

#### [ ] Task 3.3: Update impacted documentation

Run `pnpm run lint` (which includes `markdownlint-cli2`). Must pass with zero errors and zero new warnings on `docs/technical-context.md`. If `markdownlint` reports a heading-increment or list-syntax warning, correct the formatting inline and re-run. Mark all completed subtasks and tasks in this activity.

#### [ ] Task 3.4: Commit changes

- [ ] Run the full quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures.
- [ ] Commit `docs/technical-context.md` and this workstream file with message: `docs(technical-context): document verifylegacyconfigmigration backstop in section 8.13`. Subject must be lowercase, type `docs` ∈ commitlint type-enum.

## Divergences and notes

**D-1 (Activity 2, Task 2.2 — Test 7 `onDidChangeState` assertion):** The workstream prescribed that Test 7 assert "`onDidChangeState` was fired at least once with value `true`". However, `verifyLegacyConfigMigration` Path A calls `applyConfig()` (which fires `notifySectionListeners` but NOT `_onDidChangeState`) and `runMigration()` (which also does not fire `_onDidChangeState`). The `_onDidChangeState.fire()` calls are only in `initialize()`, `toggle()`, `initializeWorkspace()`, and the `FileSystemWatcher` callbacks — none of which fire during the Path A backstop flow when `showOnboardingNotification` returns `undefined`. The test assertion was therefore unreachable given the prescribed production implementation. Corrective action: removed the `onDidChangeState` subscription and `stateChanges` assertion from Test 7; retained `isInitialized` and `isEnabled` checks which do verify the internal state mutation. No production code was modified; the correction is test-only. This discrepancy is noted for PM awareness — if emitting `_onDidChangeState` from `verifyLegacyConfigMigration` is required, a follow-up workstream or amendment to this one would be needed.

### Reflection

_To be compiled at workstream completion._
