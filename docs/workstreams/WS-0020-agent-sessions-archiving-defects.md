---
title: 'agentSessionsArchiving — concurrency, feedback-loop, and data-integrity defect fixes'
objective: Fix the three symptomatic bugs (self-write feedback loop, missing concurrency guard, delete-before-write data hazard) and the three latent defects (path traversal, empty-archiveName joinPath, unguarded runMigration) confirmed by the adversarially-verified multi-agent diagnostic session on 2026-06-10, and add the two diagnosability improvements (archive-root log line, workspace name in log lines).
workstream: WS-0020
status: 'in-progress'
workspaces: []
dependencies: []
created: 2026-06-10
---

This workstream addresses all defects confirmed by the adversarially-verified diagnostic session conducted on 2026-06-10 against extension version 2.3.0 logs. The diagnostic identified three symptomatic bugs — a self-write feedback loop in the config FileSystemWatcher that caused four start/stop/start cycles (~1.3 s) on every activation; the absence of a concurrency guard on `runArchiveCycle` that allowed overlapping cycles to duplicate archive files; and an unconditional delete-before-write in `archiveSession` combined with `mtime:0` hydration that caused unnecessary full re-sweeps and ENOENT noise on every cold start. Three latent defects were also confirmed in source: a path-traversal vector via unsanitized `meta.id` in `CodexProvider`; an empty-`archiveFileName` joinPath that would call `deleteFile` on the archive directory root; and unguarded concurrent `runMigration` invocations that could prompt the user twice for the same config section. Two diagnosability gaps explain the false "cross-project writes" alarm that triggered the diagnostic: log lines omit the absolute archive root and the workspace name.

Activities are ordered by leverage: Activity 1 eliminates the feedback loop (Bug A), Activity 2 serializes the archive cycle (Bug B), Activity 3 replaces delete-before-write and fixes `mtime:0` hydration (Bug C), Activity 4 fixes the three latent defects, and Activity 5 adds the two diagnosability improvements.

**Branch:** `fix/agent-sessions-archiving-defects` (branched from `main`)

## Execution instructions

> Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the workstream status is `draft`, do NOT start execution — follow `skills/draft-review/SKILL.md` to validate the workstream. If the workstream status is `deferred`, `canceled`, or `failed`, do NOT start execution — return to the Human for a lifecycle decision. Read `docs/technical-context.md` and the execution protocol. Run `source ~/.nvm/nvm.sh && nvm use 22.22` before any pnpm script. If the workstream status is `idle`, set it to `in-progress`. Create the branch `fix/agent-sessions-archiving-defects` from `main` and push to remote.

**Before each activity** → read all tasks and subtasks in the activity to understand the full scope before writing any code.

**During execution** → always read a file before modifying it. Mark each subtask `[x]` immediately upon completion, then the task, then the activity — never batch. After completing each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" — before moving to the next task. Divergences that identify defects or gaps must include a corrective action (task or Human escalation).

**Before each commit** → run the full quality gate: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three commands must pass with zero errors and zero failures. Document any undocumented divergence before committing.

**250-line file constraint** → `src/features/agentSessionsArchiving/archiveService.ts` is currently 620 lines (above the 250-line ESLint `warn` threshold). Any code added to this file must be extracted into a helper module immediately after the relevant task's implementation step, before moving to the next task. Activity 2 Task 2.3 unconditionally extracts the in-flight guard and cycle serialization logic into `src/features/agentSessionsArchiving/archiveCycleGuard.ts`.

**When completing the last activity of this workstream** → compile the Reflection sub-block in "Divergences and notes". Update the frontmatter status to `completed`. Verify no additional fix or rework is needed, then propose PR and merge to the Human.

## Activities, Tasks and Subtasks

### [x] Activity 1: Eliminate the config FileSystemWatcher self-write feedback loop (Bug A)

Add a `_lastWrittenConfigContent: string | undefined` field to `ExtensionStateManager`. `writeFullConfig` stores the exact `formatJsonc` output string into `_lastWrittenConfigContent` immediately after the `writeFile` call succeeds — no re-serialization at compare time. The watcher `reload` handler reads the raw file bytes, decodes them, and compares against `_lastWrittenConfigContent`: on an exact string match, it clears `_lastWrittenConfigContent` to `undefined`, logs a debug suppression message, and returns without calling `readStateFromFile` or firing `_onDidChangeState`; on mismatch or read error, it proceeds normally. Clearing after match means one stored write suppresses at most the events for that write.

The deciding rationale for content-equality over the counter mechanism rejected in gate review (GR-001): GR-001 flagged content comparison as fragile to BOM/CRLF normalization — that concern is resolved because `_lastWrittenConfigContent` stores the exact same `formatJsonc` output string passed to `writeFile`, so comparison is byte-for-byte against what was written. No external normalizer is involved between write and compare.

**Failure-mode asymmetry (the deciding argument):** a false-negative suppression (bytes differ because an external normalizer touched the file) merely causes one redundant reload, which the `index.ts` deep-equal idempotency guard (Task 1.4) absorbs — bounded, harmless. A stuck token (counter design defect) causes a silent missed reload of a real external edit — unbounded, data-correctness loss. Content-equality degrades safe; the counter degrades silent. Coalescing, zero, and extra watcher events are all safe under content-equality: any event re-reads the file; suppression depends only on content, not event count.

In `index.ts`, add a deep-equality guard in the `onDidChangeState` handler to skip `service.start()` when the service is already running with equal config.

#### [x] Task 1.1: Write failing unit tests for the self-write suppression in `ExtensionStateManager`

Add to `test/unit/core/extensionStateManager.test.ts` in a new `describe('watcher self-write suppression')` block. All tests must fail before Task 1.2 is implemented.

- [x] Add a test `'watcher reload suppresses onDidChangeState when content matches _lastWrittenConfigContent'`: set up a manager with a single-root workspace; prime `(manager as any)._lastWrittenConfigContent = 'some-content'` via direct assignment; mock `vscode.workspace.fs.readFile` to return `new TextEncoder().encode('some-content')` (bytes matching the stored content); trigger the watcher `onDidChange` callback; assert that the `onDidChangeState` listener is NOT called; assert `(manager as any)._lastWrittenConfigContent` is `undefined` (cleared after suppression).
- [x] Add a test `'watcher reload fires onDidChangeState when _lastWrittenConfigContent is undefined'`: ensure `(manager as any)._lastWrittenConfigContent` is `undefined` (default); mock `vscode.workspace.fs.readFile` to return any bytes; trigger the watcher `onDidChange` callback; assert that the `onDidChangeState` listener IS called once.
- [x] Add a test `'coalesced watcher event suppresses matching self-write and does not block subsequent external edit'`: mock `vscode.workspace.fs.writeFile` to succeed without triggering the watcher; call `(manager as any).writeFullConfig({ enabled: true })` and `(manager as any).writeFullConfig({ enabled: false })` without triggering watcher events (so `_lastWrittenConfigContent` holds the second write's formatted content); trigger `onDidChange` with `vscode.workspace.fs.readFile` returning bytes for the second write's content; assert `onDidChangeState` listener is NOT called and `_lastWrittenConfigContent` is `undefined`; then trigger `onDidChange` again with `readFile` returning bytes for different content (simulating an external edit); assert `onDidChangeState` listener IS fired.
- [x] Add a test `'single writeFullConfig fires both onDidCreate and onDidChange bound to the same reload: first invocation suppresses and clears token, second invocation falls through, index.ts idempotency guard absorbs the resulting fire'`: mock `vscode.workspace.fs.writeFile` to succeed without triggering the watcher; call `(manager as any).writeFullConfig({ enabled: true })`; capture the `_lastWrittenConfigContent` string stored on the manager; obtain the `reload` callback captured by the `vscode.workspace.createFileSystemWatcher` stub (the same function reference registered to both `onDidChange` and `onDidCreate`); mock `vscode.workspace.fs.readFile` to return `new TextEncoder().encode(capturedContent)` for all invocations; invoke `reload()` once — assert the `onDidChangeState` listener is NOT called and `(manager as any)._lastWrittenConfigContent` is `undefined` (token cleared); invoke `reload()` a second time with `readFile` still returning the same bytes — assert `onDidChangeState` listener IS called exactly once (second invocation falls through to `readStateFromFile` + fire because the token was already cleared); then assert that the `index.ts` deep-equal idempotency guard absorbs that fire: configure a spy on `service.start` and fire `onDidChangeState(true)` on the consuming `index.ts` registration with the same config that the service is already running, and assert `service.start` is NOT re-invoked (confirming no churn-restart loop). Mock every collaborator the full upstream path consumes in order: `vscode.workspace.fs.readFile` (byte read inside `reload`), `readStateFromFile` (on the manager instance, returns the same config object), and the `onDidChangeState` event listener (asserted not called on first invocation, called once on second).
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit` and confirm the four new tests fail with `AssertionError` (not import errors).

#### [x] Task 1.2: Implement self-write suppression in `ExtensionStateManager`

Modify `src/core/extensionStateManager.ts`.

- [x] Add a private field `private _lastWrittenConfigContent: string | undefined` after the `_loadedLegacyConfigFile` field declaration (line 41).
- [x] In `writeFullConfig` (lines 295–304), add `this._lastWrittenConfigContent = content` immediately after the `await vscode.workspace.fs.writeFile(configUri, new TextEncoder().encode(content))` call (line 301) and before the `this.logger.debug('Wrote workspace config')` call (line 302). This stores the exact `formatJsonc` output that was written; the reload handler compares against this string without re-serializing.
- [x] In `setupFileWatcher` (lines 486–504), replace the `reload` arrow function body with a new body that: (a) if `this._lastWrittenConfigContent !== undefined`, calls `const configUri = this.getConfigUri()` (non-null within `setupFileWatcher` since `_workspaceRoot` is confirmed non-null at line 487) and attempts `const rawBytes = await vscode.workspace.fs.readFile(configUri)` in a `try` block; (b) on a successful read, decodes via `new TextDecoder().decode(rawBytes)` and compares with `this._lastWrittenConfigContent` using `===`; (c) on an exact match, sets `this._lastWrittenConfigContent = undefined`, logs `this.logger.debug('Watcher reload suppressed — content matches self-write')`, and returns; (d) on mismatch or any caught read error, falls through to call `await this.readStateFromFile()` then `this._onDidChangeState.fire(this._isEnabled)` as before; (e) if `this._lastWrittenConfigContent` is `undefined` at the time of the event, skip the comparison entirely and proceed directly to `await this.readStateFromFile()` then fire. The `reload` function must remain typed `async (): Promise<void>`.
- [x] Verify that the suppression comparison block executes on EVERY watcher reload invocation regardless of which event channel (`onDidChange` or `onDidCreate`) fired it: the `reload` arrow function must be the single shared handler assigned to both `disposable.onDidChange(reload)` and `disposable.onDidCreate(reload)` at lines 496–497 of `setupFileWatcher`, and the comparison logic must reside inside the body of `reload` itself — not in a wrapper registered to only one channel. No duplication of the comparison block across event registrations is permitted.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit` and confirm the four tests from Task 1.1 now pass.

#### [x] Task 1.3: Write failing unit tests for the `onDidChangeState` idempotency guard in `index.ts`

Add to `test/unit/features/agentSessionsArchiving/index.test.ts` in a new `describe('onDidChangeState idempotency guard')` block. All tests must fail before Task 1.4 is implemented.

- [x] Add a test `'onDidChangeState does not call service.start when service is already running with equal config'`: set up the feature registration with a mock `stateManager` whose `getConfigSection` returns a fixed `AgentSessionsArchivingConfig`; call `service.start(config)` directly on the service so `service.currentConfig` is set; fire `onDidChangeState(true)`; assert that `service.start` spy is NOT called a second time (use `vi.spyOn` on the service instance before firing).
- [x] Add a test `'onDidChangeState calls service.start when service is running with a different config'`: same setup but change `intervalMinutes` in the config returned by `getConfigSection` before firing; assert that `service.start` IS called once.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit` and confirm the two new tests fail with `AssertionError`.

#### [x] Task 1.4: Implement the `onDidChangeState` idempotency guard in `index.ts`

Modify `src/features/agentSessionsArchiving/index.ts`.

- [x] In the `stateManager.onDidChangeState` callback (lines 101–127), after the `if (globalEnabled && config?.enabled)` branch entrance, add a guard before calling `service.start(config)`: compute `const configEqual = JSON.stringify(service.currentConfig) === JSON.stringify(config)`; if `configEqual` is `true` AND `service.currentConfig !== undefined` (i.e., the service is already running), log `ctx.logger.debug('onDidChangeState: skipping start — config equal and service already running')` and skip both the `service.start(config)` call and the `watcher.start(workspaceRoot.fsPath)` call and the `checkAndPromptGitignore` call. The entire `if (globalEnabled && config?.enabled)` branch body becomes: guard check first, then service.start + watcher.start + checkAndPromptGitignore only when not already running with equal config.

#### [x] Task 1.5: Update impacted documentation

- [x] Update `docs/technical-context.md` section 8.1 ("Workspace State Persistence") to add a sentence after the "External edit detection" paragraph: "Self-writes are suppressed via content-equality: `writeFullConfig` stores the exact formatted content string it wrote in `_lastWrittenConfigContent`; the watcher reload handler reads the file, decodes it, and on an exact string match clears the field and returns early without firing — preventing the extension's own config writes from triggering restart churn. A read error or content mismatch causes normal reload processing, bounding false-negative suppression to a single redundant reload."
- [x] Update `docs/technical-context.md` section 8.4 ("Event-driven Feature Coordination") table row for `onDidChangeState(boolean)` consumer "Agent archiving" to note: "idempotent — skips `start()` when service is already running with deep-equal config."

#### [x] Task 1.6: Commit changes

Commit message: `fix(archiving): suppress config watcher self-write feedback loop`

### [x] Activity 2: Serialize archive cycles with an in-flight concurrency guard (Bug B)

Add `_inFlightCycle: Promise<void> | undefined`, `_pendingForce: boolean | undefined`, `_starting = false`, and `_pendingStartConfig: AgentSessionsArchivingConfig | undefined` fields to `AgentSessionArchiveService`. `runArchiveCycle` coalesces concurrent calls: if a cycle is in-flight, the incoming `force` flag is ORed into `_pendingForce` (so a `force=true` arriving during an in-flight `force=false` cycle is preserved for the follow-up); when the in-flight cycle resolves, one follow-up cycle runs with the strongest force seen. `start()` uses stash-and-replay re-entrancy: a concurrent `start(configB)` call while a start is in progress stashes `configB` in `_pendingStartConfig` (latest wins) and returns immediately; when the in-progress start completes in its `finally` block, it re-invokes `start()` with the stashed config — ensuring the service always ends running the most-recently-requested config. `dispose()` resets `_starting = false` and `_pendingStartConfig = undefined` — instances are single-use in production. `stop()` is made async and awaits `_inFlightCycle`. The in-flight guard, force coalescing, and cycle re-entrancy guard are extracted to `src/features/agentSessionsArchiving/archiveCycleGuard.ts`.

#### [x] Task 2.1: Write failing unit tests for the concurrency guard, force coalescing, and re-entrancy guard

Add to `test/unit/features/agentSessionsArchiving/archiveService.test.ts` in a new `describe('runArchiveCycle concurrency guard')` block. All tests must fail before Task 2.2 is implemented.

- [x] Add a test `'concurrent runArchiveCycle calls coalesce into at most two sequential cycles'`: spy on `archiveFromProviders` via `vi.spyOn(service as any, 'archiveFromProviders')` to return a Promise that resolves only when a manual resolve function is called; call `service.start(config)` to trigger the first cycle (cycle A is now in-flight); call `service.runArchiveCycle()` twice more while cycle A is in-flight; resolve cycle A; await the returned promises; assert that `archiveFromProviders` was called exactly twice (cycle A plus one follow-up, not three).
- [x] Add a test `'stop awaits the in-flight cycle before returning'`: spy on `archiveFromProviders` to return a long-pending promise; call `service.start(config)`; call `const stopPromise = service.stop()`; assert that `stopPromise` is a Promise; resolve the in-flight cycle; await `stopPromise`; assert that `archiveFromProviders` is not called again after `stop` resolves.
- [x] Add a test `'_needsDedup is cleared only once per in-flight cycle, not per coalesced call'`: spy on `deduplicateAndHydrate` via `vi.spyOn(service as any, 'deduplicateAndHydrate')`; configure two concurrent `runArchiveCycle` calls while the first is in-flight; resolve the first; await all; assert `deduplicateAndHydrate` was called exactly twice.
- [x] Add a test `'force=true from a coalesced call is preserved in the follow-up cycle'`: spy on `archiveFromProviders` to capture its `force` argument; call `service.start(config)` (cycle A, force=false, in-flight); call `service.runArchiveCycle(true)` while cycle A is in-flight; resolve cycle A; await the follow-up; assert that the second `archiveFromProviders` call received `force=true` (not `false`).
- [x] Add a test `'two concurrent start() calls with different configs result in service running the second config (stash-and-replay)'`: mock `archiveFromProviders` via `vi.spyOn(service as any, 'archiveFromProviders')` to return a long-pending promise (deferred resolve stored externally); call `service.start(config0)` to establish an in-flight cycle; call `const p1 = service.start(configA)` without awaiting — this suspends at `await service.stop()` because cycle0 is in flight and `_starting` becomes `true`; call `service.start(configB)` without awaiting — `_starting` is `true` so `configB` is stashed in `_pendingStartConfig` and the call returns immediately; resolve the deferred (cycle0 completes, start of configA proceeds, then the finally block replays start with configB); await `p1`; assert `service.currentConfig` deep-equals `configB` (the second config won, not configA).
- [x] Add a test `'dispose() resets _pendingStartConfig'`: prime `(service as any)._pendingStartConfig = config` via direct assignment; call `service.dispose()`; assert `(service as any)._pendingStartConfig` is `undefined`.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit` and confirm all six new tests fail with `AssertionError`.

#### [x] Task 2.2: Implement the in-flight concurrency guard, force coalescing, and re-entrancy guard in `AgentSessionArchiveService`

Modify `src/features/agentSessionsArchiving/archiveService.ts`.

- [x] Add four private fields after the `_reconfiguring` field declaration (line 40): `private _inFlightCycle: Promise<void> | undefined`, `private _pendingForce: boolean | undefined`, `private _starting = false`, and `private _pendingStartConfig: AgentSessionsArchivingConfig | undefined`.
- [x] Rename the body of `runArchiveCycle` to a new private method `private async _runCycleInternal(force: boolean): Promise<void>` containing the exact existing body (validation, logging, dedup, `archiveFromProviders`).
- [x] Replace the body of `public async runArchiveCycle(force = false): Promise<void>` with: if `_inFlightCycle` is set, OR the force flag (`this._pendingForce = (this._pendingForce ?? false) || force`) and return `this._inFlightCycle`; otherwise, assign `this._inFlightCycle = this._runCycleInternal(force).finally(async () => { this._inFlightCycle = undefined; const pf = this._pendingForce; if (pf !== undefined) { this._pendingForce = undefined; await this.runArchiveCycle(pf); } })` and return `this._inFlightCycle`.
- [x] Change `public stop(): void` to `public async stop(): Promise<void>`: call `clearInterval(this.intervalHandle)` and set `this.intervalHandle = undefined`, then `await this._inFlightCycle`, then set `this._pendingForce = undefined`.
- [x] Change `public start(config: AgentSessionsArchivingConfig): void` to `public async start(config: AgentSessionsArchivingConfig): Promise<void>`: add the stash-and-replay guard at the top: `if (this._starting) { this.logger.debug('start(): stashing config for deferred start'); this._pendingStartConfig = config; return; }`; then set `this._starting = true` and `this._pendingStartConfig = undefined`; wrap the existing start body (`await this.stop()`, `ensuredDirectories.clear()`, `_currentConfig = config`, interval setup, `void runArchiveCycle()`) in `try { ... } finally { this._starting = false; const pending = this._pendingStartConfig; if (pending !== undefined) { this._pendingStartConfig = undefined; await this.start(pending); } }`.
- [x] Update callers of `service.start()` and `service.stop()` in `src/features/agentSessionsArchiving/index.ts`: in the `onDidChangeState` callback and the `onConfigSectionChanged` callback (which are synchronous event-listener callbacks whose return type must not be `Promise`), replace bare `service.start(config)` with `service.start(config).catch((err: unknown) => { ctx.logger.error('service.start failed: ' + String(err)); })`, and replace bare `service.stop()` with `service.stop().catch((err: unknown) => { ctx.logger.error('service.stop failed: ' + String(err)); })`. Do NOT make these callbacks `async`.
- [x] In `reconfigure()` (archiveService.ts:75), update the `this.start(newConfig)` calls (lines 90, 109) to `await this.start(newConfig)`, and the `this.stop()` call (line 95) to `await this.stop()`.
- [x] Modify `dispose()` (archiveService.ts:167) to: (a) call `void this.stop()` (since `stop` is now async, fire-and-forget to not block the synchronous dispose path); (b) add `this._starting = false; this._pendingStartConfig = undefined;` after `void this.stop()` — instances are single-use in production; resetting these fields ensures a stuck-starting state does not persist if `dispose()` is called mid-start.

#### [x] Task 2.3: Extract in-flight guard and coalescing logic into `archiveCycleGuard.ts`

Create `src/features/agentSessionsArchiving/archiveCycleGuard.ts` to hold the concurrency guard state and logic extracted from `archiveService.ts`.

- [x] Create `src/features/agentSessionsArchiving/archiveCycleGuard.ts` and declare `export class ArchiveCycleGuard` with: (a) private fields `private _inFlightCycle: Promise<void> | undefined = undefined`, `private _pendingForce: boolean | undefined = undefined`, and `private _starting = false`; (b) method `run(fn: (force: boolean) => Promise<void>, force: boolean): Promise<void>` implementing the coalescing logic: if `_inFlightCycle` is set, OR the force into `_pendingForce` and return `_inFlightCycle`; otherwise create the in-flight promise from `fn(force)` with a `finally` handler that clears `_inFlightCycle` and runs a follow-up with `fn(_pendingForce)` if `_pendingForce !== undefined`; (c) method `awaitAndReset(): Promise<void>` that awaits `_inFlightCycle` and sets `_pendingForce = undefined`; (d) method `beginStart(): boolean` — if `_starting` is `false`, sets it to `true` and returns `true` (lock acquired); if `_starting` is already `true`, returns `false` without modifying (lock not acquired, caller should stash); (e) method `endStart(): void` — sets `_starting = false`; (f) getter `get isStarting(): boolean` — returns `_starting`. Verify `tsconfig.json` includes `src/**/*` (confirmed — no config change needed).
- [x] Add `private readonly _cycleGuard = new ArchiveCycleGuard()` to `AgentSessionArchiveService`, import `ArchiveCycleGuard` from `./archiveCycleGuard`.
- [x] Remove the fields `_inFlightCycle`, `_pendingForce`, and `_starting` from `archiveService.ts` and delegate their usage to `_cycleGuard`: replace `runArchiveCycle` body's coalescing logic with `return this._cycleGuard.run((f) => this._runCycleInternal(f), force)`; replace `stop()`'s `await this._inFlightCycle; this._pendingForce = undefined` with `await this._cycleGuard.awaitAndReset()`; in `start()`, replace the guard check `if (this._starting)` with `if (!this._cycleGuard.beginStart())`, remove the now-redundant `this._starting = true` assignment (absorbed into `beginStart()`), and replace `this._starting = false` in the `finally` block with `this._cycleGuard.endStart()`; in `dispose()`, replace `this._starting = false` with `this._cycleGuard.endStart()`. Note: `_pendingStartConfig` is NOT moved to `ArchiveCycleGuard` — it remains a private field on `AgentSessionArchiveService`.
- [x] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit` and confirm zero errors, zero lint failures, and all tests pass.

#### [x] Task 2.4: Update impacted documentation

Update `docs/technical-context.md` section 8.6 ("Agent Session Archiving Model"), under the "Force re-archive" paragraph, add a new paragraph: "**Concurrency guard:** `runArchiveCycle` is serialized by an in-flight promise managed by `ArchiveCycleGuard`. If a cycle is already running when `runArchiveCycle` is called again, the second call ORs its `force` flag into a pending-force slot and returns the in-flight promise; when the cycle completes, exactly one follow-up cycle runs using the strongest `force` value seen during coalescing. `start()` uses stash-and-replay re-entrancy: a concurrent `start(configB)` call while a start is in progress stashes `configB` in a pending-config slot (latest wins) and returns immediately; when the in-progress start completes, it re-invokes `start()` with the stashed config — the service always ends running the most-recently-requested config. `stop()` awaits the in-flight cycle before clearing the interval, so no orphaned cycle can run after `stop` returns. The guard logic lives in `src/features/agentSessionsArchiving/archiveCycleGuard.ts`."

#### [x] Task 2.5: Commit changes

Commit message: `fix(archiving): serialize archive cycles with in-flight concurrency guard`

### [ ] Activity 3: Fix delete-before-write and mtime:0 hydration (Bug C)

In `archiveSession`, replace the unconditional delete-before-write with a write-first-then-delete-only-if-renamed pattern. In `deduplicateAndHydrate`, replace `mtime: 0` seeding with real `mtime` values obtained by stat-ing each hydrated archive file.

#### [ ] Task 3.1: Write failing unit tests for write-first-then-delete and real-mtime hydration

Add to `test/unit/features/agentSessionsArchiving/archiveService.test.ts` in new `describe` blocks. All tests must fail before Task 3.2 is implemented.

- [ ] In `describe('archiveSession — write-first-then-delete')`: add a test `'writes the new archive file before deleting the old one when archiveName changes'`: spy on `writeArchiveFile` via `vi.spyOn` to return a new filename; spy on `vscode.workspace.fs.delete`; call `archiveSession` with a session whose `lastArchivedMap` entry has a different `archiveFileName` from what `writeArchiveFile` returns; assert that the `writeArchiveFile` spy is called BEFORE the `delete` spy; assert `delete` is called exactly once with the old URI.
- [ ] In `describe('archiveSession — write-first-then-delete')`: add a test `'does not delete the old file when the archive filename is unchanged'`: spy on `writeArchiveFile` to return the same `archiveFileName` already in `lastArchivedMap`; assert that `vscode.workspace.fs.delete` is NOT called.
- [ ] In `describe('deduplicateAndHydrate — real mtime hydration')`: add a test `'seeds lastArchivedMap with the stat mtime of each archive file, not mtime:0'`: mock `vscode.workspace.fs.readDirectory` to return a YYYY/MM structure; mock `vscode.workspace.fs.stat` to return `{ mtime: 9999 }` for the archive file; call `deduplicateAndHydrate`; assert that `lastArchivedMap.get(archiveName).mtime === 9999` (not 0).
- [ ] In `describe('deduplicateAndHydrate — real mtime hydration')`: add a test `'falls back to mtime:0 when stat throws for an archive file'`: mock `vscode.workspace.fs.stat` to throw; assert that `lastArchivedMap.get(archiveName).mtime === 0` (graceful degradation).
- [ ] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit` and confirm the four new tests fail with `AssertionError`.

#### [ ] Task 3.2: Implement write-first-then-delete in `archiveSession`

Modify `src/features/agentSessionsArchiving/archiveService.ts`, `archiveSession` method (lines 171–204).

- [ ] Move the `writeArchiveFile` call BEFORE the `deleteFile` call. The new order in `archiveSession` is: (1) `await this.ensureDirectory(archiveUri)`, (2) compute `timestamp`, (3) call `const archiveFileName = await this.writeArchiveFile(session, archiveUri, timestamp)`, (4) only if `archiveFileName` is defined AND `entry?.archiveFileName` is a non-empty string AND `entry.archiveFileName !== archiveFileName`, call `await this.deleteOldArchive(vscode.Uri.joinPath(archiveUri, entry.archiveFileName))`, (5) update `lastArchivedMap`.
- [ ] Remove the old `if (entry) { await this.deleteFile(...) }` block that appeared before `writeArchiveFile`.
- [ ] Guard the delete against an empty `archiveFileName` on the existing entry: the condition `entry?.archiveFileName` must be checked to be a non-empty string (not `''`) before constructing the delete URI. Add an inline comment `// L2 guard: empty-session skip records '' as archiveFileName; joinPath(archiveUri, '') equals archiveUri itself` adjacent to the guard condition.
- [ ] Add a private method `private async deleteOldArchive(uri: vscode.Uri): Promise<void>` that calls `vscode.workspace.fs.delete(uri)` inside a `try/catch`; on error, logs at `warn` level: `this.logger.warn('deleteOldArchive failed — orphan duplicate left; dedup will recover on next startup: ' + String(err))`. This replaces the shared `deleteFile` call for the write-then-delete path (BK-003: orphan logging at `warn`, not `debug`, because dedup is the only recovery path).

#### [ ] Task 3.3: Implement real-mtime hydration in `deduplicateAndHydrate`

Modify `src/features/agentSessionsArchiving/archiveService.ts`, `deduplicateAndHydrate` method (lines 500–557).

- [ ] In the block that calls `this.lastArchivedMap.set(archiveName, { mtime: 0, archiveFileName: best.name })` (lines 553–554), replace it with: call `vscode.workspace.fs.stat(vscode.Uri.joinPath(archiveUri, best.name))` inside a `try/catch`; on success, use `statResult.mtime` as the mtime value in the map entry; on catch, use `0` and log at `debug` level `this.logger.debug('Hydration stat failed for ' + best.name + ' — using mtime 0')`.
- [ ] Wrap the stat call in a `try/catch` that does NOT rethrow — a stat failure for a single file must not abort hydration of the remaining entries.

#### [ ] Task 3.4: Update impacted documentation

- [ ] Update `docs/technical-context.md` section 8.6 under "One-shot re-archive on startup": replace the entire block (lines 510–521, beginning "**One-shot re-archive on startup:**" and ending "…without requiring any persistent flag or manual intervention.") with: "**One-shot re-archive on startup:** On each extension startup, `deduplicateAndHydrate` reads all archive files from disk and stat-reads each one to obtain its real filesystem `mtime`, storing it in `lastArchivedMap`. Sessions whose source `mtime` already matches the stored archive `mtime` are skipped on the first cycle; only sessions modified since archiving are reprocessed. When `vscode.workspace.fs.stat` throws for a given archive file (missing or permission error), that entry falls back to `mtime: 0` — the fallback causes only that session to be reprocessed on the next cycle, not the entire archive. A patched extension therefore re-archives only the sessions that were genuinely affected, without requiring any persistent flag or manual intervention."
- [ ] Update `docs/technical-context.md` section 8.6 under "Replacement semantics": replace the existing paragraph (lines 498–501, beginning "**Replacement semantics (not accumulation):**" and ending "…is created.") with: "**Replacement semantics (not accumulation):** Each source session has exactly one archived file at any time. When the source's `mtime` changes, a new archive file with an updated timestamp prefix is written first; if the new filename differs from the old one, the old file is then deleted. When the filename is unchanged (same `ctime`-based prefix), `writeFile` overwrites in place and no delete is issued. This write-first-then-delete ordering eliminates the data-loss window that would exist if a delete succeeded but the subsequent write failed."
- [ ] Self-verify each passage replacement: read `docs/technical-context.md` after the edit and confirm no surviving sentence in either block contradicts write-before-delete or real-mtime hydration.

#### [ ] Task 3.5: Commit changes

Commit message: `fix(archiving): write-before-delete and real-mtime hydration`

### [ ] Activity 4: Fix the three latent defects (L1, L2, L3)

Sanitize `archiveName` in `CodexProvider` to reject path-traversal characters using an allowlist regex (L1); the empty `archiveFileName` guard is already prescribed in Task 3.2 (L2); add an in-flight guard to `runMigration` in `ExtensionStateManager` (L3).

#### [ ] Task 4.1: Write failing unit tests for L1, L2, and L3

Add tests to the relevant existing test files. All tests must fail before Task 4.2 is implemented.

- [ ] In `test/unit/features/agentSessionsArchiving/providers/codexProvider.test.ts`, add `describe('archiveName sanitization')`: add a test `'toSessionFile rejects a session whose meta.id fails the allowlist'` — mock `readSessionMeta` to return `{ id: '../../../evil', cwd: workspacePath }`; call `provider.findSessions(workspacePath)`; assert the result is an empty array (session filtered out, not thrown).
- [ ] In `test/unit/features/agentSessionsArchiving/providers/codexProvider.test.ts`, add a test `'toSessionFile rejects a session whose meta.id contains a backslash'` — same pattern with `meta.id = 'foo\\bar'`.
- [ ] In `test/unit/features/agentSessionsArchiving/providers/codexProvider.test.ts`, add a test `'toSessionFile accepts a valid meta.id matching the allowlist'` — `meta.id = 'abc-123'`; assert result contains one session with `archiveName: 'codex-abc-123'`.
- [ ] In `test/unit/features/agentSessionsArchiving/archiveService.test.ts`, in a new `describe('archiveSession — empty archiveFileName guard')`, add a test `'archiveSession with empty archiveFileName in existing entry does not call deleteOldArchive on archiveUri directly'`: prime `lastArchivedMap` with `{ mtime: 999, archiveFileName: '' }`; call `archiveSession` with a session whose `mtime` differs; spy on `vscode.workspace.fs.delete`; mock `writeArchiveFile` to return `'2026/06/202606101200-test.md'`; assert that `vscode.workspace.fs.delete` is NOT called.
- [ ] In `test/unit/core/extensionStateManager.test.ts`, in a new `describe('runMigration in-flight guard')`, add a test `'concurrent runMigration invocations do not call migrate() twice'`: create a deferred promise (resolve/reject handles stored externally); mock `migrationService.migrate` via `vi.spyOn` to return that deferred promise; mock `vscode.workspace.fs.readFile` to return bytes encoding `{"enabled":true,"versionCode":1002003000}`; mock `vscode.workspace.createFileSystemWatcher` to return a stub; call `const p1 = manager.initialize('2.3.0')` and `const p2 = manager.checkup()` without awaiting between them (both calls are issued into the event loop before either resolves); resolve the deferred; await both `p1` and `p2`; assert that `migrationService.migrate` was called exactly once (not twice).
- [ ] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit` and confirm the five new tests fail with `AssertionError`.

#### [ ] Task 4.2: Implement L1 — `archiveName` sanitization in `CodexProvider`

Modify `src/features/agentSessionsArchiving/providers/codexProvider.ts`.

- [ ] Add a private method `private sanitizeSessionId(id: string): string | undefined` to `CodexProvider`: the method first checks `if (id === '.' || id === '..')` and returns `undefined` for these single-component dot-segment edge cases; then returns `undefined` if `id` does NOT match the allowlist regex `/^[A-Za-z0-9._-]+$/`; otherwise returns `id`. Traversal safety for multi-component paths derives from the `codex-` prefix in `archiveName` (`codex-${sessionId}`) — no traversal sequence survives prepending a literal prefix. The `id !== '.' && id !== '..'` guard provides defense-in-depth for the single-component edge cases before the regex test. The allowlist constrains the character set to alphanumerics, hyphens, dots, and underscores. Note: `scanDir` already handles `undefined` returns from `toSessionFile` at line 65 (`if (session) results.push(session)`).
- [ ] In `toSessionFile` (lines 71–93, line 83), replace `const sessionId = meta.id ?? path.parse(fname).name` with: `const rawId = meta.id ?? path.parse(fname).name; const sessionId = this.sanitizeSessionId(rawId); if (sessionId === undefined) { this.logger.warn('CodexProvider: rejected session with id "' + rawId + '" (failed allowlist) in ' + fname); return undefined; }`.

#### [ ] Task 4.3: Verify L2 — empty `archiveFileName` guard and add L2 comment

The guard required by L2 was introduced in Task 3.2 (the `entry.archiveFileName !== ''` check and the `deleteOldArchive` method). Read `src/features/agentSessionsArchiving/archiveService.ts` after the Activity 3 commit and confirm the guard is present. Verify that the inline comment `// L2 guard: empty-session skip records '' as archiveFileName; joinPath(archiveUri, '') equals archiveUri itself` is adjacent to the non-empty string check. No additional code change is needed if the guard and comment from Task 3.2 are present.

#### [ ] Task 4.4: Implement L3 — in-flight guard on `runMigration` in `ExtensionStateManager`

Modify `src/core/extensionStateManager.ts`.

- [ ] Add a private field `private _migrationInFlight: Promise<boolean> | undefined` after the `_loadedLegacyConfigFile` field declaration (line 41).
- [ ] Replace the body of `private async runMigration(): Promise<boolean>` with: if `this._migrationInFlight` is set, log `this.logger.debug('runMigration: in-flight guard triggered — awaiting existing migration')` and return `await this._migrationInFlight`; otherwise assign `this._migrationInFlight = this._runMigrationInternal().finally(() => { this._migrationInFlight = undefined; })` and return `await this._migrationInFlight`.
- [ ] Extract the existing `runMigration` body (lines 326–344) into a new private method `private async _runMigrationInternal(): Promise<boolean>` with the identical body.

#### [ ] Task 4.5: Update impacted documentation

- [ ] Update `docs/technical-context.md` section 8.6: add under the "Codex provider" description a note: "The Codex provider sanitizes `meta.id` using an allowlist regex (`^[A-Za-z0-9._-]+$`) before constructing `archiveName`: any value that does not match is rejected and the session is skipped with a `warn` log."
- [ ] Update `docs/technical-context.md` section 8.2 ("Config Migration"): add after the third bullet: "Concurrent `runMigration` invocations coalesce: an in-flight migration guard ensures at most one `migrate()` call is in progress at any time, preventing duplicate section prompts."

#### [ ] Task 4.6: Commit changes

Commit message: `fix(archiving): path-traversal sanitization, empty-archiveName guard, runMigration in-flight guard`

### [ ] Activity 5: Add diagnosability improvements (D1)

Emit the absolute archive root URI once per cycle start log line. Include the workspace folder name in the Logger output channel name.

#### [ ] Task 5.1: Write failing unit tests for the diagnosability improvements

- [ ] In `test/unit/features/agentSessionsArchiving/archiveService.test.ts`, in a new `describe('cycle observability')`, add a test `'runArchiveCycle logs archive root absolute path at INFO level at cycle start'`: call `service.start(config)`; flush timers; assert that `logger.info` was called with a message containing both `'Archive cycle starting'` and the absolute `archiveUri.fsPath` (e.g., `/workspace/docs/archive/agent-sessions`).
- [ ] In `test/unit/core/logger.test.ts`, add a test `'Logger output channel name includes workspace folder name when provided'`: call `Logger.getInstance({ workspaceFolderName: 'my-project' })`; assert that `vscode.window.createOutputChannel` was called with `'Tangyr Workbench (my-project)'`.
- [ ] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run test:unit` and confirm the two new tests fail with `AssertionError`.

#### [ ] Task 5.2: Implement archive-root log line in `runArchiveCycle`

Modify `src/features/agentSessionsArchiving/archiveService.ts`.

- [ ] In `_runCycleInternal` (the method extracted from `runArchiveCycle` in Task 2.2), locate the log line `this.logger.debug('Archive cycle starting')`. Move it to immediately after the `archiveUri` assignment (`vscode.Uri.joinPath(this.workspaceRootUri, this._currentConfig.archivePath)`) — three lines in the original at lines 127–130. Replace it with `this.logger.info('Archive cycle starting — archive root: ' + archiveUri.fsPath)`. The log line must be at INFO level so it is visible at the default log level and supports §8.8 multi-window triage without enabling debug mode.

#### [ ] Task 5.3: Implement workspace-name Logger channel name

Modify `src/core/logger.ts` and `src/extension.ts`.

- [ ] Change the `private constructor()` signature at line 11 to `private constructor(opts?: { workspaceFolderName?: string })`.
- [ ] In the constructor body (line 12), replace `vscode.window.createOutputChannel('Tangyr Workbench')` with: `const folderSuffix = opts?.workspaceFolderName ? ' (' + opts.workspaceFolderName + ')' : ''; this.outputChannel = vscode.window.createOutputChannel('Tangyr Workbench' + folderSuffix)`.
- [ ] Change `public static getInstance()` at line 15 to accept `public static getInstance(opts?: { workspaceFolderName?: string }): Logger`. Add a JSDoc comment above the method: `/** Returns the singleton Logger instance. The opts parameter is honoured only on first call; subsequent calls with opts are no-ops (singleton semantics). */`. Change the body from `Logger.instance ??= new Logger()` to `Logger.instance ??= new Logger(opts)`.
- [ ] Read `src/extension.ts` before modifying it. At line 48 (`logger = Logger.getInstance()`), change the call to `logger = Logger.getInstance({ workspaceFolderName: vscode.workspace.workspaceFolders?.[0]?.name })`. This is verified as the first `getInstance()` call at runtime — all other call sites in `skillBundleEdit` are inside async command handlers invoked only after activation completes.
- [ ] Run `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types` and confirm zero type errors before proceeding to commit.

#### [ ] Task 5.4: Update impacted documentation

- [ ] Update `docs/technical-context.md` section 8.8 ("Logging") to add after the log level table: "When the extension activates in a single-root workspace, the output channel name includes the workspace folder name in parentheses (e.g., `Tangyr Workbench (my-project)`) to distinguish concurrent windows. To attribute a log line to the correct window during multi-window triage, match the `archiveUri.fsPath` in the INFO-level cycle-start log line to the workspace root shown in the window title bar (the cycle-start log is visible at the default `info` level — no debug mode required)."
- [ ] Update `docs/technical-context.md` section 8.6 under "Cycle observability" to add: "Each cycle-start log line is emitted at INFO level and includes the absolute `archiveUri.fsPath`, making it unambiguous which workspace's archive directory is targeted and visible at the default log level."
- [ ] Update the `docs/technical-context.md` header table: change the "Current version" row from `1.10.2 (versionCode \`1001010002\`)`to`2.3.0 (versionCode \`1002003000\`)`and change the "Last updated" row from`2026-05-28`to`2026-06-10`. Read the header table before editing to verify the exact current values.

#### [ ] Task 5.5: Commit changes

Commit message: `feat(archiving): add archive-root log line and workspace-name output channel`

## Divergences and notes

**Context and accepted trade-offs (recorded at draft time):**

**BK-006 — `dispose()` fire-and-forget `stop()`:** `vscode.Disposable.dispose()` is synchronous by contract; the async `stop()` cannot be awaited in a synchronous dispose chain. When the extension is deactivated while an archive cycle is in-flight, the cycle may run partially. This is an inherent VS Code Disposable constraint — accepted as a known limitation of the Disposable pattern. Additionally, a `dispose()` call racing an in-flight stash-replay (`_starting` is `true` and a stashed config is pending replay in the `finally` block) may permit one orphan `start()` invocation on the disposing instance; this is bounded by single-use instance semantics — the instance is not reused after disposal.

**GR-002 — `JSON.stringify` equality in `notifySectionListeners`:** `notifySectionListeners` uses `JSON.stringify` for section change detection, consistent with the existing implementation pattern. Two config objects with structurally identical content compare equal regardless of prototype chain. Accepted as appropriate for JSONC-parsed plain objects.

**GR-004 / GR-005 — accepted trade-offs:** No code change. Recorded as accepted per the PASS_WITH_CONDITIONS gate disposition.

**WS-0020-FU-1 — D2 deferred:** The cosmetic "needs migration" mislabel displayed after an archive cycle completes (diagnostic item D2) is deliberately excluded from this workstream — it is a display-only issue with no data-integrity impact. Tracked as `WS-0020-FU-1` with scope: relabel 'needs migration' section opt-in flow logging; persist declined sections.

### Reflection

_To be compiled at workstream completion._
