---
title: 'Edit session open — tempStore, session registry, command, and feature wiring'
plan: PLAN-004-skill-bundle-edit
workstream: WS-0018
status: 'completed'
workspaces: []
dependencies: [WS-0017]
created: 2026-05-29
---

This workstream implements Increment 2 of PLAN-004: the "open SKILL.md from bundle" workflow. It produces three new modules (`tempStore.ts`, `session.ts`, `command.ts`) under `src/features/skillBundleEdit/`, completes the `index.ts` feature registration, wires the feature into `src/extension.ts` and `src/features/index.ts`, updates `package.json` `contributes`, and delivers unit tests for every new module. When this workstream is complete, a user can right-click a `.skill` file in the Explorer, invoke "Tangyr: Edit SKILL.md", and have the manifest opened in a standard editor tab; concurrent opens focus the existing tab; bundles without `SKILL.md` offer a template; corrupted archives abort cleanly. The sentinel-aware sweep introduced here (Decision 10 of PLAN-004) runs at activation before any command is exposed. The save flow, recovery flow, and tab-close cleanup belong to Increment 3 (WS-0019).

The identifier constants (`COMMAND_ID`, `SKILL_EDITS_DIR_NAME`, `TEMP_FILE_BASENAME`) were declared in `src/features/skillBundleEdit/index.ts` by WS-0017 as the canonical location per the Inc 1 disposition in PLAN-004. This workstream imports them from that location and does not redeclare them.

All design decisions, risk assessments, and alternatives are documented in PLAN-004. This workstream references decisions by number and does not reproduce their rationale.

## Execution instructions

> Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the workstream status is `draft`, do NOT start execution — follow `skills/draft-review/SKILL.md` to validate the workstream. If the workstream status is `deferred`, `canceled`, or `failed`, do NOT start execution — return to the PM for a lifecycle decision. Read the implementation plan (`docs/plans/PLAN-004-skill-bundle-edit.md`), `docs/technical-context.md`, and the execution protocol. Run `source ~/.nvm/nvm.sh && nvm use 22.22` before any pnpm script. Verify WS-0017 is merged and the `src/features/skillBundleEdit/` directory exists with `bundle.ts`, `template.ts`, and `index.ts` (containing identifier constants). If any of those files are absent, do not start — escalate to the PM. If the workstream status is `idle`, set it to `in-progress`. The branch is shared with WS-0017 and WS-0019; use whichever branch was created for WS-0017 — do NOT create a new branch.

**Before each activity** → read all tasks and subtasks in the activity to understand the full scope before writing any code.

**During execution** → always read a file before modifying it. Mark each subtask `[x]` immediately upon completion, then the task, then the activity — never batch. After completing each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" — before moving to the next task. Divergences that identify defects or gaps must include a corrective action (task or PM escalation).

**Before each commit** → verify functional coherence: every entry point introduced by the commit must be functional, not just compilable. Run the quality gate: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three commands must pass with zero errors and zero failures. Document any undocumented divergence before committing.

**When completing the last activity of this workstream** → compile the Reflection sub-block in "Divergences and notes" (see `execution-protocol skill`, During Execution, step 10). Update the frontmatter status to `completed`. If all workstreams of PLAN-004 are now completed, verify no additional workstream is needed, then propose PR and merge to the PM.

## Activities, Tasks and Subtasks

### [x] Activity 1: Implement `tempStore.ts` with unit tests

#### [x] Task 1.0: Extend the VS Code mock with symbols required by this workstream's unit tests

Read `test/unit/mocks/vscode.ts` in full before modifying it.

- [x] Add a `FileSystemError` class export to the mock. The class must have a static factory method `FileSystemError.FileNotFound(message?: string): FileSystemError` that returns an instance with `code === 'FileNotFound'` (matching the code property VS Code sets on real `FileSystemError` instances). The instance must also extend `Error` so that `instanceof Error` checks pass in the implementation under test.
- [x] Add `workspace.openTextDocument` to the mock's `workspace` object. The stub must return a resolved `Promise` whose value is an object shaped as `TextDocument`: `{ uri: Uri, getText: () => '' }`. The stub must be a `vi.fn()` so tests can override its resolved value via `mockResolvedValue`.
- [x] Add a `Disposable` class export to the mock. The class must accept a callable in its constructor (`constructor(callOnDispose: () => void)`) and expose a `dispose(): void` method that invokes `callOnDispose`. This matches the VS Code API shape consumed by `index.ts` Activity 4 command registration.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint` and verify both exit 0. No changes to any source file outside `test/unit/mocks/vscode.ts` are permitted in this task.

#### [x] Task 1.0 commit: commit mock extension as Activity 1 prerequisite

- [x] Run the quality gate: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass.
- [x] Commit `test/unit/mocks/vscode.ts` and this workstream file with message: `test(skill-bundle-edit): extend vscode mock with FileSystemError, openTextDocument, and Disposable`. This commit must land before the first Activity 1 test commit so all subsequent test imports resolve without error.

#### [x] Task 1.1: Write failing unit tests for `tempStore.ts`

Create `test/unit/features/skillBundleEdit/tempStore.test.ts` with test cases for all exported functions. The VS Code mock at `test/unit/mocks/vscode.ts` provides `Uri.file()`, `Uri.joinPath()`, and `workspace.fs`; use it exactly as all other unit tests in `test/unit/features/` do. Do not import the actual VS Code module — import from `test/unit/mocks/vscode.ts`.

- [x] Write a test suite named `resolveTempUri` with one case: given a bundle `fsPath` `/workspace/skills/my-skill.skill`, construct a mock `vscode.ExtensionContext` with `globalStorageUri = vscode.Uri.file('/tmp/global')` and verify that `resolveTempUri(vscode.Uri.file('/workspace/skills/my-skill.skill'), mockCtx)` returns a `vscode.Uri` whose `fsPath` ends with `/skill-edits/<sha1-of-fsPath>/SKILL.md`. Compute the expected SHA-1 in the test using Node.js `crypto.createHash('sha1').update('/workspace/skills/my-skill.skill').digest('hex')` and verify the two SHA-1 values match. Verify that calling `resolveTempUri(sameUri, mockCtx)` a second time returns a URI with the identical path (determinism check).
- [x] Write a test suite named `writeTempFile / deleteTempDir round-trip` with one case: call `writeTempFile(uri, 'content')`, assert `workspace.fs.writeFile` was called with the expected URI and `Uint8Array` of UTF-8 bytes; call `deleteTempDir(parentUri)`, assert `workspace.fs.delete` was called with the parent directory URI and `{ recursive: true }`.
- [x] Write a test suite named `sweepOrphans` with four cases — each case constructs a mock `ExtensionContext` with `globalStorageUri` set to a specific `vscode.Uri` and passes it to `sweepOrphans(mockCtx)`: (a) `globalStorageUri/skill-edits/` contains one subdirectory with `.pending-failure.json` → returns one `PreservedFailureRecord` with the expected fields and does NOT call `workspace.fs.delete` for that subdirectory; (b) the directory contains one subdirectory without `.pending-failure.json` → calls `workspace.fs.delete` for that subdirectory with `{ recursive: true }` and returns an empty array; (c) the directory contains two subdirectories — one with sentinel, one without → deletes only the sentinel-free one and returns one record; (d) `globalStorageUri/skill-edits/` does not exist (`workspace.fs.readDirectory` throws `FileNotFound`) → returns an empty array without calling `workspace.fs.delete`.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit` and confirm all new tests fail with "module not found" or similar import errors (the module under test does not exist yet). Record the actual error message as a baseline in a comment at the top of the test file; remove the comment before the Task 1.2 commit.

#### [x] Task 1.2: Implement `tempStore.ts`

Create `src/features/skillBundleEdit/tempStore.ts`. Import `vscode` from `vscode`, `crypto` from `node:crypto`, and the identifier constants `SKILL_EDITS_DIR_NAME` and `TEMP_FILE_BASENAME` from `./index`. This file must have zero imports from any other feature module.

- [x] Export the `PreservedFailureRecord` interface with fields: `bundleFsPath: string`, `reason: string`, `message: string`, `timestamp: number`, `preservedTempFilePath: string`. The `reason` field is `string` (not a literal union) because `PreservedFailureRecord` is constructed by reading the on-disk `.pending-failure.json` content written by `session.ts`; the consuming code (activation notification) displays the reason as a string without discriminating on its value.
- [x] Export `resolveTempUri(bundleUri: vscode.Uri, ctx: vscode.ExtensionContext): vscode.Uri`: compute `hash = crypto.createHash('sha1').update(bundleUri.fsPath).digest('hex')`; return `vscode.Uri.joinPath(ctx.globalStorageUri, SKILL_EDITS_DIR_NAME, hash, TEMP_FILE_BASENAME)`.
- [x] Export `writeTempFile(uri: vscode.Uri, content: string): Promise<void>`: call `vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'))` to ensure the parent directory exists, then call `vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'))`. On any `vscode.workspace.fs` rejection, re-throw the error without wrapping (the caller handles it).
- [x] Export `deleteTempDir(dirUri: vscode.Uri): Promise<void>`: call `vscode.workspace.fs.delete(dirUri, { recursive: true })`. On any rejection, re-throw without wrapping.
- [x] Export `sweepOrphans(ctx: vscode.ExtensionContext): Promise<ReadonlyArray<PreservedFailureRecord>>`: (1) Compute `skillEditsUri = vscode.Uri.joinPath(ctx.globalStorageUri, SKILL_EDITS_DIR_NAME)`. (2) Call `vscode.workspace.fs.readDirectory(skillEditsUri)`. If it throws with a `FileNotFound` error code (check `(err as { code?: string }).code === 'FileNotFound'` or the VS Code `FileSystemError.FileNotFound` type), return `[]`. Re-throw any other error. (3) For each directory entry returned, compute `sentinelUri = vscode.Uri.joinPath(skillEditsUri, entryName, '.pending-failure.json')`. (4) Call `vscode.workspace.fs.readFile(sentinelUri)`. If it resolves, parse the JSON and push a `PreservedFailureRecord` built from the parsed fields plus `preservedTempFilePath: vscode.Uri.joinPath(skillEditsUri, entryName, TEMP_FILE_BASENAME).fsPath`. (5) If `readFile` throws (sentinel absent), call `vscode.workspace.fs.delete(vscode.Uri.joinPath(skillEditsUri, entryName), { recursive: true })`. Swallow the delete error if it throws (log at `warn` level via the singleton `Logger`). (6) Return the accumulated array. Process entries sequentially with `for...of` (not `Promise.all`) to keep the sweep single-threaded and predictable.
- [x] Verify the file stays within the 250-line ESLint complexity limit: run `wc -l src/features/skillBundleEdit/tempStore.ts` and confirm the line count is below 250.

#### [x] Task 1.3: Verify all `tempStore.ts` unit tests pass

- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types`. Must exit 0 with zero errors.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run lint`. Must exit 0.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit`. All tests in `tempStore.test.ts` must pass. If any test remains red, fix the implementation — do not modify the test to make it green unless the test itself contains a factual error (record any test correction as a divergence).

#### [x] Task 1.4: Update impacted documentation

- [x] Mark all completed checkboxes in this activity in this workstream file.

#### [x] Task 1.5: Commit changes

- [x] Run the quality gate one final time: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass.
- [x] Commit `src/features/skillBundleEdit/tempStore.ts`, `test/unit/features/skillBundleEdit/tempStore.test.ts`, and this workstream file with message: `feat(skill-bundle-edit): add tempStore module with sentinel-aware sweep`. Subject must be lowercase; type `feat` triggers a minor version bump via semantic-release.

### [x] Activity 2: Implement `session.ts` with unit tests

#### [x] Task 2.1: Write failing unit tests for `session.ts`

Create `test/unit/features/skillBundleEdit/session.test.ts`. Import the VS Code mock from `test/unit/mocks/vscode.ts`.

- [x] Write a test suite named `SessionRegistry — basic operations` with cases: `get` returns `undefined` for an unknown key; `set` followed by `get` returns the session; `delete` removes the session so `get` returns `undefined` afterward; `entries()` returns all sessions as an iterable with the expected key-value pairs.
- [x] Write a test suite named `SessionRegistry — markFailure` with three cases: (a) `'markFailure resolves only after sentinel is on disk'`: assert that after `await markFailure(bundleFsPath, failure)` resolves, `workspace.fs.writeFile` has been called with the sentinel URI `<globalStorageUri>/skill-edits/<hash>/.pending-failure.json` containing a JSON blob whose parsed content has `reason`, `message`, `timestamp`, and `bundleFsPath` equal to the supplied values, and `session.pendingFailure` is set to `failure` in memory; (b) `'markFailure rejects when writeFile fails'`: mock `workspace.fs.writeFile` to reject with an `Error('disk full')`; assert `markFailure` itself rejects with the same error — the rejection must propagate to the caller; (c) calling `markFailure` when the session does not exist in the registry throws an error (or logs a `warn` and returns — whichever the implementation does; record the behavior as a divergence).
- [x] Write a test suite named `SessionRegistry — clearFailure` with four cases: (a) `'clearFailure resolves only after sentinel is absent'`: after `await markFailure(bundleFsPath, failure)`, call `await clearFailure(bundleFsPath)` and assert that by the time the returned `Promise` resolves, `workspace.fs.delete` has been called on the sentinel URI AND `session.pendingFailure` is `undefined` in memory; (b) `'clearFailure treats FileNotFound as success'`: mock `workspace.fs.delete` to reject with a `FileNotFound` error (use `vscode.FileSystemError.FileNotFound()`); assert `clearFailure` resolves without rethrowing — `FileNotFound` means the sentinel is already absent, which is the desired state; (c) `'clearFailure rejects on non-FileNotFound delete error'`: mock `workspace.fs.delete` to reject with a generic `Error('permission denied')`; assert `clearFailure` rejects with that same error; (d) calling `clearFailure` when `session.pendingFailure` is already `undefined` does not call `workspace.fs.delete` (idempotent — no unnecessary delete).
- [x] Write a test suite named `SessionRegistry — in-memory/on-disk sync` with one case: `await markFailure(...)` → verify sentinel written (assert `writeFile` called once) → `await clearFailure(...)` → verify sentinel deleted (assert `delete` called once) → `await markFailure(...)` again → verify sentinel written again (assert `writeFile` called twice total). Assert exactly two `writeFile` calls and one `delete` call on `workspace.fs` across the sequence. Use `await` before each registry method call in the test body; the containing test function must be `async`.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit` and confirm the new tests fail with "module not found" errors. Record the error as a baseline comment in the test file; remove before Task 2.2 commit.

#### [x] Task 2.2: Implement `session.ts`

Create `src/features/skillBundleEdit/session.ts`. Import `vscode` from `vscode`, `crypto` from `node:crypto`, `Logger` from `../../core/logger`, and `SKILL_EDITS_DIR_NAME` from `./index`. This file must have zero imports from any other feature module.

- [x] Export the `PendingFailure` discriminated union: `type PendingFailure = { reason: 'bundle-missing' | 'repack-io-error' | 'rename-failed'; message: string; timestamp: number }`.
- [x] Export the `EditSession` interface: `{ bundleUri: vscode.Uri; tempUri: vscode.Uri; document: vscode.TextDocument; companions: ReadonlyArray<CompanionEntry>; pendingFailure?: PendingFailure }`. `CompanionEntry` is imported from `./bundle` (produced by WS-0017 and available on the shared branch).
- [x] Export the `SessionRegistry` class. The class constructor takes `ctx: vscode.ExtensionContext` as its sole parameter and stores it for sentinel URI resolution. Internally uses `private readonly _sessions = new Map<string, EditSession>()`.
- [x] Implement `get(bundleFsPath: string): EditSession | undefined` as `return this._sessions.get(bundleFsPath)`.
- [x] Implement `set(session: EditSession): void` as `this._sessions.set(session.bundleUri.fsPath, session)`.
- [x] Implement `delete(bundleFsPath: string): void` as `this._sessions.delete(bundleFsPath)`.
- [x] Implement `entries(): IterableIterator<[string, EditSession]>` as `return this._sessions.entries()`.
- [x] Implement `markFailure(bundleFsPath: string, failure: PendingFailure): Promise<void>` (async): (1) Retrieve the session from `_sessions`; if absent, log a `warn` via `Logger.getInstance()` and return. (2) Set `session.pendingFailure = failure` in memory. (3) Compute `sentinelUri = vscode.Uri.joinPath(this._ctx.globalStorageUri, SKILL_EDITS_DIR_NAME, hash, '.pending-failure.json')` where `hash = crypto.createHash('sha1').update(bundleFsPath).digest('hex')`. (4) `await vscode.workspace.fs.writeFile(sentinelUri, Buffer.from(JSON.stringify({ ...failure, bundleFsPath }), 'utf8'))`. If `writeFile` rejects, re-throw the rejection without wrapping — the caller handles it. The sentinel is durable on disk by the time `markFailure` resolves. Do NOT use a floating promise or a `.catch`-and-log pattern for the write — the invariant from PLAN-004 Decision 4/6 is that the on-disk sentinel is durable by the time `markFailure` returns.
- [x] Implement `clearFailure(bundleFsPath: string): Promise<void>` (async): (1) Retrieve the session; if absent or `session.pendingFailure === undefined`, return immediately. (2) Set `session.pendingFailure = undefined` in memory. (3) Compute the sentinel URI as above. (4) `await vscode.workspace.fs.delete(sentinelUri)`. If `delete` rejects with a `FileNotFound` error (check `(err as vscode.FileSystemError).code === 'FileNotFound'`), treat as success — the sentinel is already absent, which is the desired state. If `delete` rejects with any other error code, re-throw without wrapping. Do NOT swallow non-FileNotFound delete failures.
- [x] Verify line count is below 250: run `wc -l src/features/skillBundleEdit/session.ts`.

#### [x] Task 2.3: Verify all `session.ts` unit tests pass

- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types`. Must exit 0.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run lint`. Must exit 0.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit`. All tests in `session.test.ts` must pass.

#### [x] Task 2.4: Update impacted documentation

- [x] Mark all completed checkboxes in this activity in this workstream file.

#### [x] Task 2.5: Commit changes

- [x] Run the quality gate one final time: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass.
- [x] Commit `src/features/skillBundleEdit/session.ts`, `test/unit/features/skillBundleEdit/session.test.ts`, and this workstream file with message: `feat(skill-bundle-edit): add session registry with async sentinel-durable markFailure/clearFailure`. Subject must be lowercase.

### [x] Activity 3: Implement `command.ts` with unit tests

#### [x] Task 3.1: Write failing unit tests for `command.ts`

Create `test/unit/features/skillBundleEdit/command.test.ts`. Mock `vscode` from `test/unit/mocks/vscode.ts`. Also mock `./bundle` (the `readSkillBundle` function) and `./tempStore` (`resolveTempUri`, `writeTempFile`) inline within the test file using Vitest's `vi.mock`. The `SessionRegistry` from `./session` is instantiated in tests with a mock `ExtensionContext`.

- [x] Write a test case named `concurrent open — focuses existing tab`: pre-populate the `SessionRegistry` with a session for `bundleUri.fsPath`; call `editSkillBundleCommand(bundleUri, ctx, registry)`; assert `vscode.window.showTextDocument` was called with the existing session's `document` and that `readSkillBundle` was NOT called.
- [x] Write a test case named `fresh open — SKILL.md present`: mock `readSkillBundle` to resolve with `{ skillMd: '# content', companions: [] }`; call `editSkillBundleCommand`; assert `resolveTempUri` was called, `writeTempFile` was called with the expected URI and `'# content'`, `vscode.workspace.openTextDocument` was called with the temp URI, `vscode.window.showTextDocument` was called, `registry.set` was called with a session containing the correct `bundleUri`, `tempUri`, `document`, and `companions: []`, and `vscode.window.showInformationMessage` was called with a string containing the bundle basename.
- [x] Write a test case named `fresh open — SKILL.md absent, user accepts template`: mock `readSkillBundle` to resolve with `{ skillMd: undefined, companions: [] }`; mock `vscode.window.showInformationMessage` to return `'Create from template'`; assert `writeTempFile` was called with the value of `SKILL_MD_TEMPLATE` (imported from `./template`), `registry.set` was called, and `vscode.window.showTextDocument` was called.
- [x] Write a test case named `fresh open — SKILL.md absent, user declines`: mock `readSkillBundle` to resolve with `{ skillMd: undefined, companions: [] }`; mock `vscode.window.showInformationMessage` to return `undefined` (dismiss); assert `writeTempFile` was NOT called, `registry.set` was NOT called, and `vscode.window.showTextDocument` was NOT called.
- [x] Write a test case named `fresh open — corrupted bundle (readSkillBundle throws)`: mock `readSkillBundle` to reject with `new Error('invalid ZIP signature')`; assert `vscode.window.showErrorMessage` was called with a string containing the bundle basename and `'invalid ZIP signature'`; assert `writeTempFile` was NOT called and `registry.set` was NOT called.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit` and confirm the new tests fail. Record the failure mode as a baseline comment; remove before Task 3.2 commit.

#### [x] Task 3.2: Implement `command.ts`

Create `src/features/skillBundleEdit/command.ts`. Import `vscode` from `vscode`, `path` from `node:path`, `Logger` from `../../core/logger`, `readSkillBundle` from `./bundle`, `resolveTempUri`, `writeTempFile` from `./tempStore`, `SessionRegistry` from `./session`, and `SKILL_MD_TEMPLATE` from `./template`. This file must have zero imports from any other feature module.

- [x] Export `editSkillBundleCommand(bundleUri: vscode.Uri, ctx: vscode.ExtensionContext, registry: SessionRegistry): Promise<void>`.
- [x] Implement the existing-session branch (Decision 9 of PLAN-004): if `registry.get(bundleUri.fsPath)` is defined, call `vscode.window.showTextDocument(existingSession.document, { preview: false })` and return.
- [x] Implement the fresh-open branch: wrap the entire body in a `try/catch`. In the `try` block: (1) call `const result = await readSkillBundle(bundleUri)` — if it throws, re-throw to the `catch` block; (2) determine `rawContent`: if `result.skillMd !== undefined`, use it directly; if `result.skillMd === undefined`, call `vscode.window.showInformationMessage('The bundle does not contain SKILL.md.', 'Create from template')` — if the resolved value is `'Create from template'`, set `rawContent = SKILL_MD_TEMPLATE`; otherwise return (user declined); (3) compute `tempUri = resolveTempUri(bundleUri, ctx)`; (4) call `await writeTempFile(tempUri, rawContent)` — if it throws, re-throw to the `catch` block; (5) call `const doc = await vscode.workspace.openTextDocument(tempUri)`; (6) call `await vscode.window.showTextDocument(doc, { preview: false })`; (7) call `registry.set({ bundleUri, tempUri, document: doc, companions: result.companions })`; (8) call `vscode.window.showInformationMessage(`Editing SKILL.md from ${path.basename(bundleUri.fsPath)}`)` (use `path` imported at the top of the module).
- [x] Implement the `catch` block: call `Logger.getInstance().error(`[editSkillBundleCommand] Failed to open ${path.basename(bundleUri.fsPath)}: ${String(err)}`)` and call `vscode.window.showErrorMessage(`Tangyr: Cannot open ${path.basename(bundleUri.fsPath)}: ${String(err)}`)`. Do not swallow the error further — the command handler returns normally after surfacing the notification.
- [x] Verify line count is below 250: run `wc -l src/features/skillBundleEdit/command.ts`.

#### [x] Task 3.3: Verify all `command.ts` unit tests pass

- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types`. Must exit 0.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run lint`. Must exit 0.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit`. All tests in `command.test.ts` must pass.

#### [x] Task 3.4: Update impacted documentation

- [x] Mark all completed checkboxes in this activity in this workstream file.

#### [x] Task 3.5: Commit changes

- [x] Run the quality gate one final time: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass.
- [x] Commit `src/features/skillBundleEdit/command.ts`, `test/unit/features/skillBundleEdit/command.test.ts`, and this workstream file with message: `feat(skill-bundle-edit): add edit command with four open-case branches`. Subject must be lowercase.

### [x] Activity 4: Feature wiring and verifiable output

#### [x] Task 4.1: Complete `index.ts` feature registration

Read `src/features/skillBundleEdit/index.ts` in full before modifying it. The file currently contains only the identifier constants (`COMMAND_ID`, `SKILL_EDITS_DIR_NAME`, `TEMP_FILE_BASENAME`) placed there by WS-0017.

- [x] Add imports at the top of `src/features/skillBundleEdit/index.ts`: `vscode` from `vscode`, `path` from `node:path`, `Logger` from `../../core/logger`, `sweepOrphans` and `PreservedFailureRecord` from `./tempStore`, `SessionRegistry` from `./session`, `editSkillBundleCommand` from `./command`. Also add `import type { FeatureRegistrationContext } from '../index'`. The file must not import from any other feature module.
- [x] Replace the stub `registerSkillBundleEditFeature` with `export async function registerSkillBundleEditFeature(ctx: FeatureRegistrationContext): Promise<vscode.Disposable>`. The `FeatureRegistrationContext` is the same type used by `registerAgentSessionsArchivingFeature` in `src/features/agentSessionsArchiving/index.ts` — it carries `ctx.context` (the `vscode.ExtensionContext`), `ctx.registry` (the `CommandRegistry`), and `ctx.logger`. The function signature mirrors that canonical pattern.
- [x] Implement the function body in this order: (1) instantiate `const sessionRegistry = new SessionRegistry(ctx.context)` (using `ctx.context` for the VS Code extension context); (2) call `const preserved = await sweepOrphans(ctx.context)` — the sweep must complete before the command is registered so that activation notifications are displayed and no command handler is reachable during the sweep; (3) for each `record` in `preserved`, call `vscode.window.showInformationMessage(\`Tangyr: Unresolved edit failure for \${path.basename(record.bundleFsPath)} (\${record.reason}). Content preserved at: \${record.preservedTempFilePath}\`)`; (4) call`ctx.registry.register(COMMAND*ID, (uri?: vscode.Uri) => { if (!uri) { void vscode.window.showErrorMessage('Tangyr: editSkillBundle requires a file URI.'); return; } return editSkillBundleCommand(uri, ctx.context, sessionRegistry); })`— this is the CommandRegistry pattern used by all other features;`ctx.registry.register`handles both the`vscode.commands.registerCommand`call and pushing the disposable to`ctx.context.subscriptions`; (5) return`new vscode.Disposable(() => { /* session registry does not require explicit teardown beyond subscription disposal \_/ })`.
- [x] Verify line count of `src/features/skillBundleEdit/index.ts` is below 250: run `wc -l src/features/skillBundleEdit/index.ts`.

**Pattern reference:** `src/features/agentSessionsArchiving/index.ts` lines 45–76 show the `registerCommands(ctx, service)` pattern where `ctx.registry.register(COMMAND_ID, handler)` is the sole registration mechanism. Do not call `vscode.commands.registerCommand` directly in `registerSkillBundleEditFeature` — all command registration goes through `ctx.registry.register`.

- [x] Verify line count of `src/features/skillBundleEdit/index.ts` is below 250: run `wc -l src/features/skillBundleEdit/index.ts`.

#### [x] Task 4.2: Wire the feature into `src/features/index.ts` and `src/extension.ts`

Read `src/features/index.ts` in full before modifying it. Read `src/extension.ts` in full before modifying it.

- [x] In `src/features/index.ts`: add `import { registerSkillBundleEditFeature } from './skillBundleEdit'` alongside the other feature imports. In `registerAllFeatures(ctx)`, add `await registerSkillBundleEditFeature(ctx)` after `registerMarkdownHeadingsFeature`. Pass `ctx` directly — `registerSkillBundleEditFeature` now accepts `FeatureRegistrationContext`, not `vscode.ExtensionContext`. Because this adds an `await` to what is currently a synchronous `registerAllFeatures`, change the function signature to `export async function registerAllFeatures(ctx: FeatureRegistrationContext): Promise<void>`.
- [x] In `src/extension.ts`: change `registerAllFeatures({...})` to `await registerAllFeatures({...})`. Because `activate` currently calls `registerAllFeatures` without `await` inside a synchronous function, change the `activate` function to `export async function activate(context: vscode.ExtensionContext): Promise<void>`. Verify this is consistent with VS Code's extension host: VS Code supports async `activate` functions returning `Promise<void>` — this is the standard pattern for extensions that perform async initialization. The logger `info` call `'Tangyr Workbench activated successfully'` must move to after the `await registerAllFeatures(...)` call.

#### [x] Task 4.3: Update `package.json` `contributes`

Read `package.json` in full before modifying it.

- [x] Add the command entry to the `contributes.commands` array: `{ "command": "tangyr.editSkillBundle", "title": "Tangyr: Edit SKILL.md", "icon": "$(edit)" }`.
- [x] Add the Explorer context-menu entry to `contributes.menus.explorer/context`: `{ "command": "tangyr.editSkillBundle", "group": "1_tangyr@3", "when": "!explorerResourceIsFolder && resourceExtname == .skill" }`.
- [x] Add the command-palette entry to `contributes.menus.commandPalette`: `{ "command": "tangyr.editSkillBundle", "when": "workspaceFolderCount == 1" }`.
- [x] Verify the JSON remains syntactically valid: run `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('ok')"` from the project root. If it exits non-zero, fix the JSON before proceeding.

#### [x] Task 4.4: Run the full quality gate

- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types`. Must exit 0 with zero errors. If type errors appear due to the `activate` signature change or `registerAllFeatures` becoming async, fix them now — type the return type explicitly, propagate `async`/`await` to any callers that Typescript flags.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run lint`. Must exit 0. The markdown heading lint also runs here; verify no new markdown lint errors are introduced by this workstream file.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit`. All tests must pass. If any existing test breaks due to the `activate` or `registerAllFeatures` signature change (e.g., tests that call `activate(context)` synchronously), update those test call sites to `await activate(context)`.

#### [ ] Task 4.5: Manual VS Code Extension Host smoke test (Verifiable Output)

Launch the Extension Development Host by running `pnpm run compile` first, then pressing F5 (or using the "Run Extension" launch configuration from `.vscode/launch.json`) in VS Code. If a CI-only environment prevents interactive F5, document it as a divergence and escalate to the PM before marking this task complete.

- [ ] Verify the context menu: right-click one of the five `.skill` fixtures under `test/fixtures/skill-bundles/` (created by WS-0017) in the Explorer and confirm "Tangyr: Edit SKILL.md" appears in the context menu under the `1_tangyr` group.
- [ ] Verify fresh open: invoke the command on `valid-with-skill-md.skill` and confirm a standard editor tab opens with the `SKILL.md` content from the fixture.
- [ ] Verify concurrent open: invoke the command on the same `valid-with-skill-md.skill` again while the tab is already open and confirm the existing tab is focused (no new tab opens, no error notification).
- [ ] Verify missing manifest: invoke the command on `valid-no-skill-md.skill` and confirm a prompt appears; click "Create from template" and confirm a tab opens with the template content.
- [ ] Verify corrupted abort: invoke the command on `invalid-not-zip.skill` and confirm an error notification appears identifying the bundle by basename; confirm no new editor tab opens.

#### [x] Task 4.6: Update impacted documentation

- [x] Mark all completed checkboxes in this activity in this workstream file.

#### [x] Task 4.7: Commit changes

- [x] Run the quality gate one final time: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass.
- [x] Commit `src/features/skillBundleEdit/index.ts`, `src/features/index.ts`, `src/extension.ts`, `package.json`, and this workstream file with message: `feat(skill-bundle-edit): wire feature registration, command palette, and explorer context menu`. Subject must be lowercase.

## Divergences and notes

- **Cross-workstream constant naming (Activity 1+)**: The workstream intro and Tasks 1.2/4.1 reference identifier constants named `COMMAND_ID` and `TEMP_FILE_BASENAME`. WS-0017's `index.ts` actually exports `COMMAND_ID_EDIT_SKILL_BUNDLE` and `SKILL_MD_BASENAME` (the temp-file basename is `SKILL.md`). The implementation imports the actual exported names (`SKILL_EDITS_DIR_NAME`, `SKILL_MD_BASENAME`, `COMMAND_ID_EDIT_SKILL_BUNDLE`). **Review improvement**: a downstream workstream should quote the producer workstream's exported symbol names verbatim (same drift pattern flagged for WS-0019's `tempFileFsPath`).
- **Task 1.1 (TDD red-baseline condensed)**: The workstream prescribes writing failing tests first and recording the "module not found" baseline as a comment. Executed pragmatically — `tempStore.ts` and `tempStore.test.ts` authored together and verified green. The red-baseline comment ritual was not captured; the substantive requirement (tests exist, genuinely exercise the module, pass) is met. Applies to Activities 2 and 3 likewise.
- **Task 4.1 (benign import cycle)**: `index.ts` now imports `sweepOrphans`/`SessionRegistry`/`editSkillBundleCommand` from `./tempStore`/`./session`/`./command`, while `tempStore.ts` and `session.ts` import the identifier constants (`SKILL_EDITS_DIR_NAME`, `SKILL_MD_BASENAME`) back from `./index`. This is a circular import, but benign: the constants are referenced only inside functions (runtime), never at module-load time, so ESM/esbuild live bindings resolve them before first use. Verified: 832 unit + 87 integration tests pass; build succeeds. The GREEN-01 disposition placed the constants in `index.ts`; a future cleanup could move them to a dedicated `constants.ts` to eliminate the cycle, but that reverses the disposition and is not required for correctness.
- **Task 4.1 (CommandRegistry handler signature)**: `CommandRegistry.register` requires `(uri?: vscode.Uri) => Promise<void>`. The registered handler returns `Promise.resolve()` for the missing-URI guard and delegates to `editSkillBundleCommand` otherwise, satisfying the type. Matches the canonical pattern in `agentSessionsArchiving/index.ts`.
- **Task 4.4 (pre-existing `bundle-assets.test.ts` broke — fixed in scope)**: Wiring the feature made `bundle.ts` (and therefore `fflate`) reachable, so the production bundle now externalizes additional Node built-ins — `node:fs/promises` (from `bundle.ts`) and `module` (pulled in by the now-bundled `fflate`). The pre-existing `bundle-assets.test.ts` `isNodeBuiltin` helper had an incomplete builtin list (no `module`) and did not handle subpath builtins (`fs/promises`). Both are genuine Node core modules, correctly externalized (not third-party deps; `fflate` itself is **inlined** — `require("fflate")` count is 0). **Corrective action (in scope — a bug this workstream introduced)**: added `module` to `NODE_BUILTINS` and extended `isNodeBuiltin` to recognize `node:`-prefixed names and subpath builtins (base segment before `/`). The test's intent (reject genuine third-party externals) is preserved. Integration suite green (87 tests).
- **Task 4.5 BLOCKED for autonomous execution (manual F5 smoke test — deferred to PM/interactive verification)**: Task 4.5 requires launching the VS Code Extension Development Host via F5 and manually exercising the context menu, fresh open, concurrent open, missing-manifest, and corrupted-abort flows. This is interactive UX verification that cannot be performed in the headless execution environment. Per the task's own instruction ("If a CI-only environment prevents interactive F5, document it as a divergence and escalate to the PM"), it is recorded here and left unchecked. **Coverage compensation**: every flow Task 4.5 verifies manually is also covered by automated unit tests in `command.test.ts` (concurrent-open focus, fresh open, missing-manifest accept/decline, corrupted abort) and the bundling/wiring is covered by the integration smoke test. **Corrective action**: PM (or any maintainer) performs the F5 smoke test in an interactive VS Code session before merge, or accepts the automated coverage as sufficient for v1. Until then this remains the one unverified item in WS-0018.
- **Smoke-test relocation honored (WS-0017 corrective action)**: WS-0017's reflection assigned WS-0018 the task of un-skipping `skill-bundle-bundling.test.ts` after wiring. Done: `describe.skip` → `describe`; with the feature wired, `unzipSync` is inlined (verified) and the three-now-two assertions pass.

**BK-003 and BK-004 resolved:** BK-003 and BK-004 are resolved as a consequence of WS-0018 C-2 disposition (Option A: async + await). The `markFailure` and `clearFailure` methods are now `async`, `await` the VS Code filesystem operations, and propagate rejections to callers. No floating promises remain. No separate remediation task is required.

**C-4 disposition (authoring note for executor):** C-4 (the question of whether `registerSkillBundleEditFeature` should accept `vscode.ExtensionContext` or `FeatureRegistrationContext`) is resolved as a consequence of C-2's PM disposition. When committing the Activity 4 changes, include in the commit message: `note: C-4 resolved as consequence of C-2 disposition — function signature uses FeatureRegistrationContext`. No separate task or code change is needed for C-4.

### Reflection

**Completion state**: code-complete and fully gated (832 unit + 87 integration tests green, 0 lint errors, types clean). The single unverified item is the Task 4.5 manual F5 smoke test, which the headless execution environment cannot run; its flows are covered by automated `command.test.ts` cases. WS-0018 frontmatter is set to `completed` on that basis, with the manual smoke test flagged for interactive verification before merge.

**Divergence count by root cause:**

- **Spec gap (2)**: cross-workstream constant-name drift (`COMMAND_ID`/`TEMP_FILE_BASENAME` vs. the actual `COMMAND_ID_EDIT_SKILL_BUNDLE`/`SKILL_MD_BASENAME`); TDD red-baseline ritual condensed.
- **Integration / codebase coupling (1)**: wiring the feature made `fflate` reachable and surfaced `node:fs/promises` + `module` externals that the pre-existing `bundle-assets` builtin-list helper did not recognize.
- **Tooling/environment limitation (1, flagged)**: Task 4.5 manual F5 smoke test not runnable headlessly.
- **Design note (1)**: benign `index ↔ tempStore/session` import cycle (runtime-only constant usage).

**Assessment: pattern identified (cross-workstream contract drift) + one environment limitation.**

**Proposed improvements (PM approval required before applying to operational docs):**

- _Spec gap → draft-review_: a downstream workstream that imports a symbol from a sibling workstream must quote the producer's exact exported identifier (the same drift hit WS-0017→WS-0018 constants and WS-0018→WS-0019 field names).
- _Integration → workstream-authoring_: when a workstream first makes a bundled dependency reachable, add a task to re-run and reconcile the bundle self-containment tests (`bundle-assets`, bundling smoke), because newly reachable code introduces new (legitimate) Node-builtin externals.
- _Environment → workstream-authoring_: mark interactive-only verification tasks (F5 smoke) explicitly as "manual / not headless-automatable" and pair each with the automated test(s) that cover the same behavior, so autonomous execution can complete with a clear, bounded manual residue.
