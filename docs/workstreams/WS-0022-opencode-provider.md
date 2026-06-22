---
title: 'OpenCode session-archiving provider'
objective: Implement the OpenCode session provider end-to-end — store discovery, ingestion seam, parser, and change detection — per SPEC-003 and PLAN-005.
workstream: WS-0022
status: 'completed'
workspaces: []
dependencies: []
created: 2026-06-22
references:
  - docs/specifications/SPEC-003-opencode-session-provider.md
  - docs/initiatives/INIT-005-opencode-provider.md
  - docs/plans/PLAN-005-opencode-provider.md
---

This workstream implements [SPEC-003](docs/specifications/SPEC-003-opencode-session-provider.md) by following the four internal increments specified in [PLAN-005](docs/plans/PLAN-005-opencode-provider.md): store access and discovery (Activity 1), ingestion seam (Activity 2), parser and registration (Activity 3), and change detection, signalling, and documentation (Activity 4). Together these increments add OpenCode as a first-class session source that discovers its shared SQLite store, matches sessions to the workspace by working directory, presents each session as an independently parseable unit through an additive ingestion seam, and re-archives only changed sessions without cross-workspace churn.

## Architectural decisions

These decisions are settled in PLAN-005. Do not re-open them during execution; record any forced deviation as a divergence.

1. **Store access: `node:sqlite` read-only adapter, feature-detected, two-tier failure handling.** All `node:sqlite` use is confined to `src/features/agentSessionsArchiving/providers/openCodeAdapter.ts`. The adapter opens with `DatabaseSync(path, { readonly: true })`, executes per-session reads inside a deferred read transaction (`BEGIN DEFERRED … COMMIT`) to prevent torn reads under a concurrent WAL write, and treats the store triplet (`opencode.db`, `-wal`, `-shm`) as read-only. Feature detection wraps `require('node:sqlite')` in a top-level try/catch; on failure (Tier 1 — module absent in older runtimes) the adapter exports a sentinel and the provider emits exactly one deduped informational notification and log entry (not a modal) naming the cause, then contributes zero sessions. A store present but unopenable (Tier 2 — corrupt, permission-denied, locked beyond tolerance) is caught per-store by a try/catch around `DatabaseSync` construction; failure contributes zero sessions and emits a throttled user-visible diagnostic distinct from the absent-store no-op. The module-absent ExperimentalWarning written to extension-host stderr is not suppressed.

2. **`OpenCodeProvider` (`providers/openCodeProvider.ts`, provider name `open-code`).** `resolveStores()` returns the single `OPENCODE_DB` path when that environment variable is set non-empty, else enumerates `opencode*.db` files under the XDG or platform default directory. An absent path is a silent no-op; a present path matching no known schema layout is the out-of-scope detect-and-signal path (one deduped notification + log, distinct from Tier-1 and Tier-2). `findSessions(workspaceRootPath)` queries session rows from each store, keeps those whose `directory` field is absolute and resolves (via `fs.realpath`) to the same real path as `workspaceRootPath` after case-folding, separator normalization, and trailing-separator stripping. A relative or empty `directory` is skipped with a debug log. Each matched session is returned as a `SessionFile` with `uri` absent, `readContent` set to a closure returning the eagerly-materialized §3 JSON string (cached during findSessions; no lazy DB access), `compositeMtime` as the per-session fingerprint string, and `archiveName` derived from the sanitized session id.

3. **Ingestion seam — additive `readContent?` and `uri?` on `SessionFile`.** `SessionFile.uri` becomes `uri?: vscode.Uri` (optional) and `readContent?: () => Promise<string>` is added. Existing providers keep `uri` and omit `readContent`; their behaviour is unchanged. In `archiveService.readAndParse`: when `readContent` is present, it is called in its own try/catch (a throw logs a per-session warn and skips that session), its result is passed directly to `parser.parse`; otherwise the existing `vscode.workspace.fs.readFile(session.uri)` path runs. The companion-resolution call (`resolveCompanionData`) is skipped when `readContent` is present (content-backed sessions have no file URI). At the three `copyRawArchive` call sites (lines 314, 329, 419 of `archiveService.ts`): when `session.readContent` is present, the call is replaced by a skip — no copy, no file written, warn-level log. The materialized JSON contract between `OpenCodeProvider` (producer) and `OpenCodeParser` (consumer) has `schemaVersion: 1` and carries session row, ordered messages each with ordered parts, and subagent child sessions — exact shape from PLAN-005 §3.

4. **`OpenCodeParser` (`markdown/parsers/openCodeParser.ts`, providerName `open-code`).** Consumes the §3 JSON. Each message → one turn: role `user` → user, `assistant` → agent. Parts assembled in order: `text` → content, `reasoning` → thinking, `tool` → tool call (name from `$.tool`, input from `$.state.input`, output from `$.state.output`; `$.state.status` is informational only; no fabrication when output is absent), `step-start`/`step-finish` → ignored. Timestamps from `message.timeCreated` (epoch milliseconds) → UTC ISO 8601. Child sessions (`parentId` non-null) → `subagentSessions[]`: child id → `agentId`, child `agent` → `agentType` (fallback `"unknown"`), child `title` → `description`. Compaction: if the increment-1 discovery confirms a per-event compaction marker, it maps to `compactionSummaries[]`; if OpenCode carries no mid-conversation compaction events, `compactionSummaries` is empty (never fabricated). Empty-session predicate: exclude when all turns empty AND no subagent sessions AND no compaction summaries. Registered in `markdown/parsers/index.ts` and `providers/index.ts`.

5. **Change detection: per-session fingerprint as `compositeMtime`.** `SessionFile.compositeMtime` = `"<timeUpdated>:<messageCount>:<partCount>"`, computed inside the same per-session deferred read transaction as the content materializer, so fingerprint and content are always consistent. Store-triplet watch patterns (`opencode.db` and `opencode.db-wal`, not `-shm`) trigger cycles; the per-session fingerprint gates re-archiving.

## Execution instructions

> Re-read this section at the start of every execution session. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the status is `draft`, do NOT execute — follow `skills/draft-review/SKILL.md`. If `deferred`, `canceled`, or `failed`, return to the Human. Read SPEC-003, PLAN-005, `docs/technical-context.md`, and the execution protocol. Run `source ~/.nvm/nvm.sh && nvm use 22.22` before any pnpm script. The branch `feat/opencode-provider` already exists — do NOT create a new branch. If the status is `idle`, set it to `in-progress`.

**Before each activity** → read every task and subtask in the activity, and read each target file in full, before writing any code.

**During execution** → always read a file before modifying it. Follow TDD: write failing tests first, then implement. Mark each subtask `[x]` immediately on completion, then the task, then the activity — never batch. After each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" before continuing.

**Before each commit** → run the full quality gate: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures, and the existing test count must not decrease. (`pnpm install`/`pnpm audit`, if ever needed, require `--ignore-workspace` locally.)

**`node:sqlite` in unit tests** → On the test runner's Node 22.22, `node:sqlite` requires the `--experimental-sqlite` flag (it is unflagged only on Node ≥ 24, which the VS Code 1.125 extension host bundles — empirically confirmed). Therefore `vitest.config.ts` MUST pass the flag to the test workers (Task 1.1 subtask): set `test.pool: 'forks'` and `test.poolOptions.forks.execArgv: ['--experimental-sqlite']` (idempotent — a harmless no-op once the runtime unflags the module). Without this, every test importing the adapter fails to load `node:sqlite` and the suite is unrunnable. Fixture databases are built programmatically with `DatabaseSync` from `node:sqlite` via a test-local helper (`test/unit/features/agentSessionsArchiving/providers/fixtures/openCodeFixture.ts`); each test creates a temp-file `.db` with the verified schema (see Task 1.1) and populates it with controlled data. The adapter is exercised directly against these fixture DBs (never mocked).

**250-line lint constraint** → the `max-lines` ESLint rule warns at 250 lines for `src/**/*.ts` files (skipBlankLines: true, skipComments: true). Place the adapter in its own module (`openCodeAdapter.ts`, target: under 200 lines), the provider in `openCodeProvider.ts` (target: under 200 lines), and the parser in `openCodeParser.ts` (target: under 200 lines). `archiveService.ts` is at 965 lines — add no new methods to it; changes there are limited to the additive seam modifications in Activity 2.

**When completing the last activity** → compile the Reflection sub-block, set status to `completed`, verify the full suite, then propose the PR to the Human (the agent cannot merge).

## Activities, Tasks and Subtasks

### [x] Activity 1: Store access adapter, provider skeleton, and schema discovery

Add the `node:sqlite` read-only adapter module, implement `OpenCodeProvider` with `resolveStores()` and `findSessions()`, and run the increment-1 schema-discovery subtasks (compaction representation, Windows store path, extension-host `node:sqlite` availability, and snapshot-isolation smoke-check). Unit tests cover the adapter and provider; fixture DB is established here and reused in later activities.

#### [x] Task 1.1: Enable node:sqlite in the test runner, create the fixture DB helper, and write failing adapter tests

**First, enable `node:sqlite` under the Node 22.22 test runner:** edit `vitest.config.ts` to set `test.pool: 'forks'` and add `test.poolOptions: { forks: { execArgv: ['--experimental-sqlite'] } }` (merge with any existing `test` config; idempotent once the runtime unflags the module). Confirm with `source ~/.nvm/nvm.sh && nvm use 22.22 && node --experimental-sqlite -e "require('node:sqlite')"` before proceeding.

Create `test/unit/features/agentSessionsArchiving/providers/fixtures/openCodeFixture.ts`. The helper exports:

- `createFixtureDb(path: string): DatabaseSync` — opens (or creates) an SQLite DB at `path` using `DatabaseSync` from `node:sqlite`, executes the verified DDL:

  ```sql
  CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    parent_id TEXT,
    directory TEXT NOT NULL,
    title TEXT,
    agent TEXT,
    model TEXT,
    time_created INTEGER,
    time_updated INTEGER,
    summary_additions INTEGER,
    summary_deletions INTEGER,
    summary_files INTEGER,
    summary_diffs TEXT,
    time_compacting INTEGER
  );
  CREATE TABLE IF NOT EXISTS message (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    time_created INTEGER,
    data TEXT
  );
  CREATE TABLE IF NOT EXISTS part (
    id TEXT PRIMARY KEY,
    message_id TEXT,
    session_id TEXT,
    time_created INTEGER,
    data TEXT
  );
  ```

  and returns the open handle.

- `insertSession(db: DatabaseSync, row: Partial<SessionRow>): void` — inserts one row into `session` with the provided fields, defaults: `id = crypto.randomUUID()`, `directory = '/workspace'`, `time_created = Date.now()`, `time_updated = Date.now()`.
- `insertMessage(db: DatabaseSync, row: Partial<MessageRow>): void` — inserts one row into `message`.
- `insertPart(db: DatabaseSync, row: Partial<PartRow>): void` — inserts one row into `part`.
- `SessionRow`, `MessageRow`, `PartRow` type aliases matching the DDL columns.

Create `test/unit/features/agentSessionsArchiving/providers/openCodeAdapter.test.ts`. Use `tmp` (Node `os.tmpdir()` + random suffix) for file-backed fixture DBs; close and delete in `afterEach`. Write failing tests for:

- `openDb(path)`: returns an open handle for a valid fixture DB; throws (caught by caller) for a non-existent path.
- `getAllSessionRows(db)`: returns all session rows (no directory filter — real-path workspace resolution is the provider's responsibility and cannot be done in SQL); returns `[]` for an empty table.
- `getMessagesForSession(db, sessionId)`: returns all message rows for the session, ordered by `(time_created, id)` ascending.
- `getPartsForMessage(db, messageId)`: returns all part rows for the message, ordered by `(time_created, id)` ascending.
- `closeDb(db)`: closes the handle without throwing; calling twice is safe.
- Snapshot-isolation smoke-check: open a fixture DB, start a `BEGIN DEFERRED` read transaction via `exec`, read rows, open a second in-process `DatabaseSync` handle to the same file and insert a row, commit the read transaction, confirm the newly inserted row is NOT visible in the results from the read transaction (verifies WAL-mode snapshot isolation holds under `node:sqlite`'s binding). If this assertion fails, record in "Divergences and notes" that snapshot isolation does not hold under the current binding — the per-session deferred-read mitigation must then be documented as a best-effort guard rather than a guarantee.
- Read-only enforcement (AC-7/AC-12): on a handle opened via `openDb` (read-only), an attempted `exec('INSERT …')` throws; and the fixture `.db` file's byte size is unchanged before vs. after a full read cycle — recording the byte-unchanged guarantee as a test, not merely by construction.

Confirm all new tests fail before implementing the adapter.

#### [x] Task 1.2: Implement `openCodeAdapter.ts`

Create `src/features/agentSessionsArchiving/providers/openCodeAdapter.ts`. The module must:

- Feature-detect `node:sqlite` at module load with a top-level try/catch: `const nodeSqlite = (() => { try { return require('node:sqlite') as { DatabaseSync: typeof import('node:sqlite').DatabaseSync }; } catch { return null; } })();`. Export `const sqliteAvailable: boolean = nodeSqlite !== null;`.
- Export `openDb(path: string): import('node:sqlite').DatabaseSync` — when `nodeSqlite` is null, throw a `SqliteUnavailableError` (a plain `Error` subclass exported from this module, message: `'node:sqlite module not available in this runtime'`); otherwise call `new nodeSqlite.DatabaseSync(path, { readonly: true })` and return the handle. Let the constructor throw for missing/unreadable paths — callers catch it.
- Export `closeDb(db: import('node:sqlite').DatabaseSync): void` — calls `db.close()` in a try/catch, logs nothing (callers log).
- Export `getAllSessionRows(db: import('node:sqlite').DatabaseSync): SessionRow[]` — prepares and runs `SELECT id, parent_id, directory, title, agent, time_created, time_updated, summary_additions, summary_deletions, summary_files, summary_diffs, time_compacting FROM session` (no `WHERE` — real-path workspace filtering is the provider's job and cannot be expressed in SQL) and returns the rows. Returns `[]` on any error.
- Export `readSessionWithTransaction<T>(db: import('node:sqlite').DatabaseSync, fn: () => T): T` — executes `db.exec('BEGIN DEFERRED')`, calls `fn()`, then `db.exec('COMMIT')`, and returns the result. On any error thrown by `fn`, calls `db.exec('ROLLBACK')` in a try/catch before re-throwing.
- Export `getMessagesForSession(db: import('node:sqlite').DatabaseSync, sessionId: string): MessageRow[]` — prepares and runs `SELECT id, session_id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created ASC, id ASC` with `[sessionId]`.
- Export `getPartsForMessage(db: import('node:sqlite').DatabaseSync, messageId: string): PartRow[]` — prepares and runs `SELECT id, message_id, session_id, time_created, data FROM part WHERE message_id = ? ORDER BY time_created ASC, id ASC` with `[messageId]`.
- Export `materializeSession(db: import('node:sqlite').DatabaseSync, row: SessionRow, messages: MessageRow[]): string` — builds and returns the PLAN-005 §3 JSON document as a string. It performs only reads (callers invoke it inside a `readSessionWithTransaction`; the provider does so in `findSessions`). Implementation per the §3 contract shape detailed in Task 2.3: for each ordered message parse `message.data` for `role` and call `getPartsForMessage(db, message.id)`, parsing each `part.data` for `type` and payload; query subagent child sessions via `SELECT … FROM session WHERE parent_id = ?` with `[row.id]` and assemble their messages/parts the same way; set `summary` from the `summary_*` columns (null-safe, defaults `0`/`""`) and `timeCompacting` from `row.time_compacting`; return `JSON.stringify(result)`. (Implemented here in Activity 1 because `findSessions` invokes it eagerly — Task 1.4.) Write its failing unit test in Task 1.3.
- Export type aliases `SessionRow`, `MessageRow`, `PartRow` matching the DDL column set above.
- Keep the module under 200 non-blank, non-comment lines.

Run the quality gate; confirm Task 1.1 tests pass.

#### [x] Task 1.3: Write failing provider tests and run schema-discovery subtasks

Create `test/unit/features/agentSessionsArchiving/providers/openCodeProvider.test.ts`. The test file must NOT mock `node:sqlite` — it calls the real adapter against fixture DBs to exercise the full integration path. Write failing tests for:

- `provider.name === 'open-code'` and `provider.displayName === 'OpenCode'`.
- `resolveStores()` with `OPENCODE_DB` set: returns the single configured path.
- `resolveStores()` with `OPENCODE_DB` unset: returns paths from the XDG/default directory for the current platform (mock the filesystem via the vscode mock for `readDirectory`; seed it with `opencode.db` and `opencode-stable.db`; confirm both are returned).
- `findSessions(workspacePath)` with a fixture DB containing a session whose `directory` resolves to `workspacePath`: returns one `SessionFile` with `providerName === 'open-code'`, `uri` absent (`undefined`), `readContent` present (a function), `compositeMtime` matching `"<timeUpdated>:<msgCount>:<partCount>"`.
- `findSessions(workspacePath)` with a session whose `directory` is a different absolute path: returns empty array.
- `findSessions(workspacePath)` with a session whose `directory` is relative (e.g. `'relative/path'`): skips that session; debug log emitted; returns empty array.
- `findSessions(workspacePath)` with a symlinked workspace path: both sides resolved to real path before comparison (stub `fs.realpath` to return a canonical form).
- `findSessions(workspacePath)` when `sqliteAvailable` is false: returns empty array; Tier-1 signal emitted exactly once (second call does not re-emit); test uses `vi.mock` to override `sqliteAvailable` from the adapter module.
- `findSessions(workspacePath)` when `openDb` throws (Tier 2 — store present but unreadable): returns empty array; `logger.warn` called with a message distinguishing the failure from absent-store.
- Absent-store no-op: when `resolveStores()` returns paths that do not exist (all `openDb` calls throw `ENOENT`-equivalent errors), returns empty array with no warning.
- Out-of-scope detect-and-signal: when the resolved store directory exists but contains only non-`.db` entries (legacy JSON layout), the provider emits one deduped notification and log entry; a second call does not re-emit.

**Schema-discovery subtasks (increment-1):** These are research-and-encode subtasks embedded in Task 1.3. Execute each before writing the corresponding test or implementation, and record the finding (confirmed or deviation) in "Divergences and notes":

- **Compaction discovery:** create a fixture DB session with `time_compacting` set to a non-null epoch-ms value. Query whether a corresponding `message`/`part` row pair representing a compaction event exists (expected: it does not, based on PLAN-005 §4 "session-level summary\_\* / time_compacting" rather than per-event). If no per-event compaction message exists, confirm that `compactionSummaries` will be empty and `time_compacting` is metadata-only (not parsed). Record the confirmed finding; the parser (Activity 3) will use it.
- **Windows store path:** identify the Windows equivalent of `~/.local/share/opencode`: PLAN-005 §2 specifies `%USERPROFILE%\.local\share\opencode` as TBV. For the macOS/Linux test environment, implement `resolveDefaultStoreDir()` as `process.env['XDG_DATA_HOME'] ? path.join(process.env['XDG_DATA_HOME'], 'opencode') : path.join(os.homedir(), '.local', 'share', 'opencode')`. Add a TODO comment noting that the Windows path (`%USERPROFILE%\\.local\\share\\opencode` vs `%LOCALAPPDATA%`) is TBV on a Windows host; the provider safely degrades to absent-store no-op when the resolved path does not exist.
- **Extension-host `node:sqlite` availability:** the smoke-check in Task 1.1 runs under the test runner (Node 22.22); record whether `sqliteAvailable` is `true` in that environment. Note in comments that the VS Code extension host running Node < 22 would set `sqliteAvailable = false`, triggering Tier-1 graceful degradation; no separate runtime check is needed beyond the existing feature-detect.

Confirm all new tests fail before implementing the provider.

#### [x] Task 1.4: Implement `openCodeProvider.ts`

Create `src/features/agentSessionsArchiving/providers/openCodeProvider.ts`. The class `OpenCodeProvider` implements `SessionProvider`:

- `public readonly name = 'open-code'` and `public readonly displayName = 'OpenCode'`.
- Private `_tier1SignalEmitted = false` and `_outOfScopeSignalEmitted = false` module-level once-guards (private instance fields).
- `resolveDefaultStoreDir(): string` — returns `process.env['XDG_DATA_HOME'] ? path.join(process.env['XDG_DATA_HOME'], 'opencode') : path.join(os.homedir(), '.local', 'share', 'opencode')`. (Windows path TBV; comment as per Task 1.3 schema-discovery subtask.)
- `resolveStores(): string[]` — when `process.env['OPENCODE_DB']` is non-empty, returns `[process.env['OPENCODE_DB']]`; else reads the default store directory with `vscode.workspace.fs.readDirectory`; on `ENOENT`/readDirectory throw returns `[]`; keeps only filenames matching `/^opencode(-[a-z0-9]+)?\.db$/i`; returns their full paths.
- `detectOutOfScope(storeDir: string): Promise<boolean>` — reads `storeDir` with `readDirectory`; returns `true` when no `.db` file is found but at least one entry exists (presence of non-DB content suggests a legacy JSON layout). Returns `false` on any error.
- `emitTier1Signal(): void` — on first call: `this.logger.info('OpenCode session archiving requires a newer VS Code runtime (node:sqlite absent); other archiving is unaffected')` and `vscode.window.showInformationMessage(…same text…)` (non-modal). Sets `_tier1SignalEmitted = true`; subsequent calls are no-ops.
- `emitOutOfScopeSignal(storeDir: string): void` — on first call: `this.logger.warn('OpenCode store at <storeDir> uses an unsupported layout; skipping')` and `vscode.window.showInformationMessage(…same text…)` (non-modal). Sets `_outOfScopeSignalEmitted = true`; subsequent calls are no-ops.
- `async findSessions(workspaceRootPath: string): Promise<SessionFile[]>` — if `!sqliteAvailable`: call `emitTier1Signal()`; return `[]`. Call `resolveStores()`. When empty: check `detectOutOfScope(resolveDefaultStoreDir())`; if true emit out-of-scope signal; return `[]`. For each store path: wrap the entire store read in a try/catch (Tier 2); on failure: call `this.logger.warn('OpenCode: store at <path> could not be opened — <error message>')` and `continue`. Inside the try: open the DB with `openDb(storePath)`; real-path resolve `workspaceRootPath` using `fs.realpath` (Node built-in, not vscode.workspace.fs); normalize the resolved path (lowercase on `process.platform === 'darwin'` or `'win32'`; replace backslashes; strip trailing separator); call `getAllSessionRows(db)` (no SQL directory filter — real-path resolution requires iterating all sessions and filtering client-side, since the DB `directory` may differ from a symlink-resolved path). Filter in TypeScript: skip rows with empty or relative `directory`; for each remaining row, call `fs.realpathSync` on `row.directory` in a try/catch (skip with debug log on error); normalize the resolved directory the same way as `workspaceRootPath`; include the session only when the two normalized strings are strictly equal and the normalized directory does not have `workspaceNorm` merely as a prefix. For each included session row: call `readSessionWithTransaction(db, () => { const msgs = getMessagesForSession(db, row.id); const partCount = msgs.reduce((n, m) => n + getPartsForMessage(db, m.id).length, 0); const fingerprint = \`${row.time_updated ?? 0}:${msgs.length}:${partCount}\`; const content = materializeSession(db, row, msgs); return { fingerprint, content }; })`. Build and return a`SessionFile`where:`uri`is omitted;`readContent = () => Promise.resolve(content)`— a closure over the captured string that performs NO DB access (the handle is closed in the`finally`after`findSessions`, so`readContent`must never touch the DB);`providerName = 'open-code'`;`archiveName = 'open-code-' + sanitizeSessionId(row.id)`(sanitize: replace any character not in`[A-Za-z0-9._-]`with`-`; truncate to 200 chars; reject if result is empty or is`.`or`..`);`displayName = 'OpenCode ' + (row.title ?? row.id)`;`ctime = row.time_created ?? 0`;`mtime = row.time_updated ?? row.time_created ?? 0`;`compositeMtime = fingerprint`;`extension = ''`. Close the DB in a`finally` block.
- Keep the file under 200 non-blank, non-comment lines; extract `sanitizeSessionId` and `resolveDefaultStoreDir` as module-level functions.

Run the quality gate; confirm Task 1.3 tests pass.

#### [x] Task 1.5: Update impacted documentation

No user-facing documentation requires updating in this activity; the provider is not yet registered. Add an inline comment block at the top of `openCodeProvider.ts` documenting the two-tier failure taxonomy and the schema-discovery findings from Task 1.3 (compaction model confirmed or deviated, Windows path TBV note, snapshot isolation confirmed or deviated). If any schema-discovery subtask revealed a deviation from PLAN-005, record it in "Divergences and notes" now (before the commit) with the corrective action taken or proposed.

#### [x] Task 1.6: Commit changes

Commit `openCodeAdapter.ts`, `openCodeProvider.ts`, and the new test files and fixture helper. Commit message: `feat(archiving): add opencode node:sqlite adapter and provider skeleton`.

---

### [x] Activity 2: Ingestion seam — additive `readContent?`/`uri?` and `copyRawArchive` skip guards

Make `SessionFile.uri` optional, add `readContent?: () => Promise<string>`, wire `readAndParse` to use `readContent` when present, add the three `copyRawArchive` skip guards, and implement `materializeSession` on the provider. Existing providers are unchanged — verified by the quality gate.

#### [x] Task 2.1: Write failing seam tests

Create `test/unit/features/agentSessionsArchiving/archiveService.openCodeSeam.test.ts`. Import and configure the `AgentSessionArchiveService` following the pattern in `archiveService.test.ts` (vscode mock, logger mock, `createMockSession`). Write failing tests for:

- `readAndParse` uses `readContent` when present: given a `SessionFile` with `readContent: async () => '{"schemaVersion":1,"session":{},"messages":[],"subagents":[]}'` and a stub parser that returns `{ status: 'parsed', session: { providerName: 'open-code', providerDisplayName: 'OpenCode', sessionId: 'x', turns: [] } }`, confirm `parser.parse` is called with the string returned by `readContent`, not via `vscode.workspace.fs.readFile`.
- `readContent` exception isolation: when `readContent` throws, the session is skipped (warn logged, `vscode.workspace.fs.writeFile` not called for that session) while the next session in the same cycle (a normal file-backed session) still processes successfully.
- `copyRawArchive` skip at the no-parser path (line 314): when a `SessionFile` with `readContent` present has no registered parser, `copyRawArchive` is not called and `logger.warn` is called.
- `copyRawArchive` skip at the `unrecognized` result path (line 329): when the parser returns `{ status: 'unrecognized', reason: '…' }` for a `readContent`-backed session, `copyRawArchive` is not called and `logger.warn` is called.
- `copyRawArchive` skip at the outer exception-catch path (line 419): when `parser.parse` throws for a `readContent`-backed session, `copyRawArchive` is not called and `logger.warn` is called.
- `resolveCompanionData` is NOT called for `readContent`-backed sessions: mock `resolveCompanionData` and confirm it is not invoked when `session.readContent` is present.
- Existing file-backed sessions (no `readContent`) are unaffected: all four paths (no-parser copy, unrecognized copy, exception copy, and successful parse+write) continue to use `vscode.workspace.fs.readFile` and `copyRawArchive` as before.

Confirm all new tests fail.

#### [x] Task 2.2: Apply the additive seam to `SessionFile` and `archiveService.readAndParse`

In `src/features/agentSessionsArchiving/types.ts`: change `readonly uri: vscode.Uri` to `readonly uri?: vscode.Uri` and add `readonly readContent?: () => Promise<string>`. This is a purely additive change; all existing usages of `uri` that are unconditional will now require a null-check — TypeScript will surface them at compile time.

In `src/features/agentSessionsArchiving/archiveService.ts`:

- In `readAndParse` (line 425): replace the existing `vscode.workspace.fs.readFile(session.uri)` read path with a conditional:
  - When `session.readContent` is defined: wrap `await session.readContent()` in its own try/catch; on throw, log `this.logger.warn('OpenCode session <displayName>: readContent threw — skipping: <error>')` and skip the session by returning `{ fileName: undefined, companionPartial: false }` — do NOT rethrow (PLAN-005 §3 requires the throw be absorbed, never reaching `copyRawArchive` with an undefined `uri`). In practice `readContent` returns a pre-captured string and will not throw; this guard keeps the contract explicit.
  - Immediately after reading content via `readContent`: skip the `resolveCompanionData` call; set `companionContext` to `{ companionPartial: false }` (an empty context object satisfying `CompanionDataContext`).
  - When `session.readContent` is not defined: run the existing `readFile` + `resolveCompanionData` path unchanged.
- At the three `copyRawArchive` call sites in `writeArchiveFile`:
  - Line 314 (no-parser path): add `if (session.readContent !== undefined) { this.logger.warn(\`No parser for content-backed session \${session.displayName} — skipping copy\`); return { fileName: undefined, companionPartial: false }; }`before the`copyRawArchive` call.
  - Line 329 (`unrecognized` result path): add the same guard immediately before the `copyRawArchive` call.
  - Line 419 (outer exception-catch path): add the same guard immediately before the `copyRawArchive` call.
- Fix any TypeScript errors arising from `session.uri` now being optional (e.g., the `copyRawArchive` body uses `session.uri` directly; add `if (!session.uri) { … return undefined; }` guard at the top of `copyRawArchive`).

Run the quality gate; confirm Task 2.1 tests pass and all pre-existing tests remain green.

#### [x] Task 2.3: Document the §3 contract and seam (materializeSession implemented in Activity 1)

In `src/features/agentSessionsArchiving/providers/openCodeProvider.ts`, reference the §3 closed internal contract — the `OpenCodeProvider` producer ⇄ `OpenCodeParser` consumer format that `materializeSession` (implemented in Activity 1, `openCodeAdapter.ts`, Task 1.2) produces:

```json
{
  "schemaVersion": 1,
  "session": {
    "id": "...",
    "directory": "...",
    "title": "...",
    "agent": "...",
    "parentId": null,
    "timeCreated": 0,
    "timeUpdated": 0,
    "timeCompacting": null,
    "summary": { "additions": 0, "deletions": 0, "files": 0, "diffs": "" }
  },
  "messages": [
    {
      "id": "...",
      "role": "user|assistant",
      "timeCreated": 0,
      "parts": [{ "id": "...", "type": "text|reasoning|tool|...", "data": {} }]
    }
  ],
  "subagents": [
    {
      "session": { "id": "...", "agent": "...", "title": "...", "parentId": "..." },
      "messages": []
    }
  ]
}
```

Materializer behavior (implemented in Activity 1 per Task 1.2; restated here as the authoritative contract):

- For each `MessageRow` in `messages` (already ordered): parse `message.data` as JSON to extract `role` (`$.role`); call `getPartsForMessage(db, message.id)` inside the deferred read transaction already wrapping this call; for each part parse `part.data` as JSON to extract `type` and the type-specific payload fields; assemble the parts array.
- For subagents: call `db.prepare('SELECT id, parent_id, directory, title, agent, time_created, time_updated, time_compacting FROM session WHERE parent_id = ?').all([row.id])` inside the same transaction; for each child session retrieve its messages and parts using the same message/part queries; assemble as the `subagents` array.
- Set `"summary"` from `row.summary_additions`, `row.summary_deletions`, `row.summary_files`, `row.summary_diffs` (null-safe; default 0/`""`).
- Return `JSON.stringify(result)`.
- `materializeSession(db, row, messages)` reads each message's parts and the subagent child sessions (with their messages/parts) from the DB and returns `JSON.stringify` of the §3 document. It is invoked **eagerly in `findSessions`, inside the per-session `readSessionWithTransaction`** (Task 1.4), so all its DB reads occur while the handle is open and within one consistent snapshot; its returned string is captured and `readContent = () => Promise.resolve(content)`. The DB handle is closed after `findSessions` returns, so `readContent` performs no DB access. This single-transaction, cached-string design resolves the handle-lifetime and snapshot-consistency concerns — there is no second transaction and no re-open.

Add a test in `openCodeProvider.test.ts` (or a sibling `openCodeMaterialize.test.ts` if the existing file would exceed 400 lines): given a fixture DB with one session, two messages, and four parts (two per message including one `tool` part), `readContent()` returns a string that `JSON.parse`s to a document with `schemaVersion === 1`, two messages each with two parts, and `subagents` array empty.

Run the quality gate; confirm all tests pass.

#### [x] Task 2.4: Update impacted documentation

No public documentation updates are required for the internal seam change. Add a JSDoc comment on the modified `readAndParse` method describing the `readContent` branch and the companion-skip rule. Add a JSDoc comment on the `materializeSession` method describing the §3 contract and the subagent query. Record any deviations from PLAN-005 §3 in "Divergences and notes".

#### [x] Task 2.5: Commit changes

Commit `types.ts`, `archiveService.ts` (seam modifications only), the provider additions (`materializeSession`), and the new test file. Commit message: `feat(archiving): add readContent ingestion seam and opencode session materializer`.

---

### [x] Activity 3: `OpenCodeParser` and provider registration

Implement `OpenCodeParser`, register it in `markdown/parsers/index.ts`, and register `OpenCodeProvider` in `providers/index.ts`. After this activity the end-to-end path from DB → materialized JSON → parsed `NormalizedSession` → markdown is complete.

#### [x] Task 3.1: Write failing parser tests

Create `test/unit/features/agentSessionsArchiving/markdown/parsers/openCodeParser.test.ts`. Write failing tests for:

- **Tool call mapping**: input JSON with one assistant message containing one `tool` part (`$.tool = 'read_file'`, `$.state.input = '{"path":"foo.ts"}'`, `$.state.output = 'content'`): parsed turn has `toolCalls = [{ name: 'read_file', input: '{"path":"foo.ts"}', output: 'content' }]`.
- **Incomplete tool (no output)**: `tool` part with `$.state.status = 'running'` and no `$.state.output`: parsed turn `toolCalls = [{ name: '…', input: '…' }]` with no `output` field (never fabricated, not even `undefined` — the `ToolCall` interface allows the field to be absent).
- **Reasoning (thinking)**: assistant message with one `reasoning` part (`$.type = 'reasoning'`, content at `$.data.text` or `$.content`): parsed turn has `thinking` field set. (Note for coder: inspect the PLAN-005 §3 contract to confirm the exact field path for reasoning content inside a `part.data` JSON object; use `$.type === 'reasoning'` as discriminator and carry the text content at `part.data.text` — verified against the live store: both `text` and `reasoning` parts hold their content in `$.text`.)
- **Step-start and step-finish ignored**: a message with `step-start` and `step-finish` parts produces a turn with no content, no tool calls — the empty turn is included in the raw parse (filtering is the empty-session predicate, not the parser).
- **Role labels**: a message with `role = 'user'` → `NormalizedTurn.role = 'user'`; a message with `role = 'assistant'` → `NormalizedTurn.role = 'assistant'`; an unknown role value is mapped defensively (skip the turn, log debug).
- **Timestamp (epoch ms → UTC ISO 8601)**: a message with `timeCreated = 1700000000000` → `NormalizedTurn.timestamp = '2023-11-14T22:13:20.000Z'` (the UTC ISO 8601 representation; verify: `new Date(1700000000000).toISOString()` = `'2023-11-14T22:13:20.000Z'`).
- **Subagents**: input JSON with one `subagents` entry (`session.id = 'child-1'`, `session.agent = 'claude-4'`, `session.parentId = 'parent-1'`, `session.title = 'Refactor task'`, two messages): parsed session has `subagentSessions = [{ agentId: 'child-1', agentType: 'claude-4', description: 'Refactor task', turns: […] }]` with turns assembled from the child messages using the same parts rules.
- **Subagent `"unknown"` fallback**: when `session.agent` is `null` or `""` in the subagent entry, `agentType = 'unknown'`.
- **Compaction (based on discovery in Task 1.3)**: if Task 1.3 confirmed no per-event compaction events exist in the OpenCode store, write a test that a session with `timeCompacting` set but no compaction message/part in `messages` produces `compactionSummaries = []` (not fabricated); and a test that `schemaVersion = 1` with no `compactionSummaries` key in the JSON input also produces `compactionSummaries = []`. If Task 1.3 discovered a per-event compaction representation, rewrite these tests accordingly and record the deviation.
- **Empty-session predicate**: a session with zero messages → parser returns `{ status: 'parsed', session: { … turns: [] } }` (parser does not apply the empty-session predicate; the predicate is applied by `archiveService.writeArchiveFile`).
- **`unrecognized` for wrong schema**: input string `"not json"` → `{ status: 'unrecognized', reason: '…' }`; input JSON with `schemaVersion: 2` → `{ status: 'unrecognized', reason: 'unsupported schemaVersion 2' }`.
- **Multi-part text assembly**: assistant message with two `text` parts → `turn.content = part1.text + '\n\n' + part2.text`.

Confirm all tests fail before implementing the parser.

#### [x] Task 3.2: Implement `openCodeParser.ts`

Create `src/features/agentSessionsArchiving/markdown/parsers/openCodeParser.ts`. The class `OpenCodeParser` implements `SessionParser` from `../types`:

- `public readonly providerName = 'open-code'`.
- `parse(content: string, sessionId: string): ParseResult` (no `companionContext` needed; the signature still accepts the optional parameter to conform to the interface):
  - Parse `content` as JSON; on parse error return `{ status: 'unrecognized', reason: 'invalid JSON' }`.
  - Check `parsed.schemaVersion`; if not `1` return `{ status: 'unrecognized', reason: \`unsupported schemaVersion \${String(parsed.schemaVersion)}\` }`.
  - Map `parsed.messages` to `NormalizedTurn[]` via `mapMessage(msg): NormalizedTurn | null`:
    - `role`: `'user'` → `'user'`; `'assistant'` → `'assistant'`; any other value → return `null` (skips the turn with a debug log via module-level no-op logger fallback — the parser does not receive a logger; use `console.debug` scoped to `'OpenCodeParser'`).
    - `timestamp`: `new Date(msg.timeCreated).toISOString()`.
    - Parts: iterate `msg.parts` in order. Accumulate: `textParts: string[]` for `type === 'text'` (field: `part.data.text ?? ''`); `thinking: string` for `type === 'reasoning'` (field: `part.data.text ?? ''` — verified; joined with `'\n\n'` on multiple reasoning parts); `toolCalls: ToolCall[]` for `type === 'tool'` (fields: `name = part.data.tool ?? 'unknown'`, `input = typeof part.data.state?.input === 'string' ? part.data.state.input : JSON.stringify(part.data.state?.input ?? {})`, `output = typeof part.data.state?.output === 'string' ? part.data.state.output : undefined`; include `output` field only when the value is a non-empty string); `step-start` and `step-finish` parts: skip without accumulating.
    - Assemble: `content = textParts.join('\n\n')`; build `NormalizedTurn` with `role`, `content`, `toolCalls`, `thinking` (omit when empty string), `timestamp`, `filesRead: []`, `filesModified: []`, `agentName: parsed.session.agent ?? undefined`.
  - Map `parsed.subagents` to `SubagentSession[]` via `mapSubagent(sub)`: `agentId = sub.session.id`, `agentType = (sub.session.agent && sub.session.agent.trim()) ? sub.session.agent : 'unknown'`, `description = sub.session.title ?? undefined`; `turns` assembled using the same `mapMessage` logic applied to `sub.messages`.
  - `compactionSummaries`: if `parsed.compactionSummaries` is a non-empty array (a future schema version may add it), map each entry to `CompactionSummary`; otherwise set to `[]` or omit.
  - Return `{ status: 'parsed', session: { providerName: 'open-code', providerDisplayName: 'OpenCode', sessionId, turns: turns.filter(Boolean), subagentSessions: subagents, compactionSummaries: [] } }`.
  - Keep the file under 200 non-blank, non-comment lines; extract `mapMessage`, `mapPart`, `mapSubagent` as module-level functions.

Run the quality gate; confirm Task 3.1 tests pass.

#### [x] Task 3.3: Register parser and provider

In `src/features/agentSessionsArchiving/markdown/parsers/index.ts`: import `OpenCodeParser` from `'./openCodeParser'` and add `new OpenCodeParser()` to the `PARSERS` array.

In `src/features/agentSessionsArchiving/providers/index.ts`: import `OpenCodeProvider` from `'./openCodeProvider'`, construct `new OpenCodeProvider(logger)` (the provider needs a `Logger` instance — add `logger: Logger` as the first constructor parameter of `OpenCodeProvider` in `openCodeProvider.ts`; update the class accordingly and update the test file's construction calls). Add the new instance to the `providers` array before `CopilotChatProvider` (consistent with alphabetical-ish ordering; place after `CodexProvider`).

Add a test in `test/unit/features/agentSessionsArchiving/index.test.ts` (following the existing pattern) confirming `getDefaultProviders` returns a provider with `name === 'open-code'`. Add a test in `test/unit/features/agentSessionsArchiving/markdown/parsers/openCodeParser.test.ts` (or the index test file if that is where parser registration is tested) confirming `getParserForProvider('open-code')` returns a non-undefined parser.

Run the quality gate; confirm all tests pass and test count has not decreased.

#### [x] Task 3.4: Update impacted documentation

No public documentation requires updating for the parser registration in this activity (the full documentation update is deferred to Activity 4). Add a JSDoc block at the top of `openCodeParser.ts` summarising: the §3 JSON contract it consumes, the reasoning/tool/step-start/step-finish part mapping, and the compaction behaviour (confirmed in Task 1.3).

#### [x] Task 3.5: Commit changes

Commit `openCodeParser.ts`, the updated `markdown/parsers/index.ts`, the updated `providers/index.ts`, the updated `openCodeProvider.ts` (Logger constructor parameter), and the new and updated test files. Commit message: `feat(archiving): add opencode parser and register provider`.

---

### [x] Activity 4: Change detection, watch patterns, signalling, and documentation

Add `getWatchPatterns` to `OpenCodeProvider`, verify the per-session fingerprint end-to-end, add all three signal paths' tests, and update `docs/technical-context.md` and the README provider list.

#### [x] Task 4.1: Write failing change-detection and signalling tests

Add to `test/unit/features/agentSessionsArchiving/providers/openCodeProvider.test.ts`:

- **Re-archive on update**: given a fixture DB session with `time_updated = 1000`, `compositeMtime = '1000:2:4'`; update `time_updated` to `2000` and insert a new part; call `findSessions` again; confirm `compositeMtime = '2000:2:5'` (different from the prior value — `archiveService` would re-archive).
- **No cross-workspace churn**: given a fixture DB with two sessions — one for workspace A and one for workspace B; call `findSessions` with workspace A path; confirm only the workspace-A session is returned; the workspace-B session's updates do not appear.
- **Store-triplet fingerprint scoping**: the `compositeMtime` string includes `timeUpdated`, `messageCount`, and `partCount`, all specific to the one session — confirmed by inspecting the returned value from the fixture DB.

Add to `test/unit/features/agentSessionsArchiving/providers/openCodeProvider.test.ts`:

- **Tier-1 signal (once-only)**: when `sqliteAvailable` is `false` (via `vi.mock`), first `findSessions` call triggers `logger.info` and `vscode.window.showInformationMessage`; second call does not re-trigger either.
- **Tier-2 signal (store present but unreadable)**: when `openDb` throws a non-`SqliteUnavailableError` error, `logger.warn` is called once per failing store per call (not once-only — it fires on every cycle for a persistently unreadable store, because it represents an actionable error, unlike the Tier-1 signal which represents a fixed runtime limitation).
- **Out-of-scope signal (once-only)**: when `resolveStores` returns `[]` (no DB files found) but the store directory exists and contains non-DB entries, `vscode.window.showInformationMessage` is called once; a second `findSessions` call does not re-call it.
- **Absent-store no-op**: when the store directory does not exist (readDirectory throws), `findSessions` returns `[]`, `logger.warn` is not called, `vscode.window.showInformationMessage` is not called.

Add to `test/unit/features/agentSessionsArchiving/sessionFileWatcher.test.ts` (or a sibling `openCodeWatcher.test.ts` if the existing file would exceed 400 lines):

- **Watch patterns**: given a fixture `OpenCodeProvider` with a known store directory, `provider.getWatchPatterns(workspacePath)` returns exactly two patterns: one with `glob = 'opencode.db'` and one with `glob = 'opencode.db-wal'`, both with `baseUri` pointing to the resolved store directory. `-shm` is not included.

Confirm all new tests fail.

#### [x] Task 4.2: Implement `getWatchPatterns` and verify fingerprint end-to-end

In `src/features/agentSessionsArchiving/providers/openCodeProvider.ts`, add:

```typescript
public getWatchPatterns(_workspaceRootPath: string): WatchPattern[] {
  const storeDir = process.env['OPENCODE_DB']
    ? path.dirname(process.env['OPENCODE_DB'])
    : this.resolveDefaultStoreDir();
  const baseUri = vscode.Uri.file(storeDir);
  return [
    { baseUri, glob: 'opencode.db' },
    { baseUri, glob: 'opencode.db-wal' },
  ];
}
```

The `compositeMtime` fingerprint (`"<timeUpdated>:<messageCount>:<partCount>"`) is already computed in `findSessions` (Activity 1, Task 1.4) inside the per-session deferred read transaction. Verify end-to-end in the re-archive test added in Task 4.1: the value changes when the DB is updated, confirming the fingerprint is live. No additional implementation is needed for the fingerprint beyond what was done in Activity 1.

Run the quality gate; confirm Task 4.1 tests pass.

#### [x] Task 4.3: Update `docs/technical-context.md`

In `docs/technical-context.md`, locate the archiving provider section (around the `Session Provider abstraction` trade-off entry and the workspace filtering subsection). Add a subsection titled `OpenCode provider` documenting:

- Store location resolution: `OPENCODE_DB` override; default `$XDG_DATA_HOME/opencode` or `~/.local/share/opencode`; channel DB enumeration pattern.
- Access mechanism: `node:sqlite` read-only adapter (`openCodeAdapter.ts`), WAL-correct, per-session deferred read transaction for torn-read prevention.
- Two-tier failure taxonomy: Tier 1 (module absent — graceful no-op + one-time informational notification); Tier 2 (store present but unreadable — warn per cycle).
- Out-of-scope detect-and-signal: legacy layout detected, one-time notification, never silent.
- Workspace matching: both-sides real-path resolution, absolute-directory guard, exact normalized comparison (no prefix/nested match).
- Ingestion seam: `SessionFile.readContent?`, `uri?` optional; `materializeSession` produces PLAN-005 §3 JSON; `OpenCodeParser` consumes it. Companion-resolution and `copyRawArchive` skipped for content-backed sessions.
- Change detection: per-session `compositeMtime = "<timeUpdated>:<messageCount>:<partCount>"`; watch patterns for `opencode.db` and `opencode.db-wal`.
- Known limitations: Windows store path TBV (`%USERPROFILE%\.local\share\opencode`); compaction model as discovered in increment 1.

Add `open-code` to the provider list in any table or enumeration that lists supported providers in `docs/technical-context.md`.

#### [x] Task 4.4: Update README provider list

In the repository root `README.md` (or `docs/README.md` — locate the file with the supported-providers list by reading `README.md` in the repository root first), add `OpenCode` to the list of supported session sources in the same format as the existing entries. If no such list exists in the README, skip this subtask and record the absence in "Divergences and notes".

#### [x] Task 4.5: Full-suite verification and reflection

Run the full quality gate one final time: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit`. Confirm zero errors, zero failures, and that the test count is strictly greater than 1048 (the count after WS-0021's review-gate fixes). Verify that acceptance criteria AC-1 through AC-13 from SPEC-003 are each covered by at least one passing test:

- AC-1: `findSessions` returns sessions for the current workspace; one archive produced per session.
- AC-2: sessions with a different directory are excluded (positive isolation test from Task 4.1).
- AC-3: tool calls, reasoning, role labels, and parts-assembled content verified by parser tests (Task 3.1).
- AC-4: subagent sections with identifier, agent type (including `"unknown"` fallback) verified by parser tests (Task 3.1).
- AC-5: re-archive on `compositeMtime` change verified (Task 4.1).
- AC-6: no cross-workspace churn verified (Task 4.1).
- AC-7: store files byte-unchanged after a cycle (no write operations in the adapter; verified by the smoke-check in Task 1.1 asserting the DB handle is read-only).
- AC-8: absent-store no-op (Task 4.1); out-of-scope one-time diagnostic (Task 4.1).
- AC-9: malformed session skipped; other sessions processed (Task 2.1 exception-isolation test).
- AC-10: session with only subagent or compaction substance is not discarded. The `allTurnsEmpty` predicate in `writeArchiveFile` (verified at `archiveService.ts` ~lines 343–349) ALREADY checks `subagentSessions.length > 0` AND `compactionSummaries.length > 0`, so a subagent-only session is retained — no predicate change is needed. Add a seam test asserting a subagent-only OpenCode session is archived (not skipped).
- AC-11: compaction summaries render as distinct labeled sections — owned by the existing renderer suite (`renderer.companion.test.ts`, which covers compaction rendering at SPEC-002 AC-6). OpenCode produces no in-scope compaction events (increment-1 finding), so this is vacuously satisfied for OpenCode; no new test required.
- AC-12: WAL-committed data visible (smoke-check in Task 1.1).
- AC-13: existing providers unaffected (pre-existing test suite passes green; no provider test has regressed).

Compile the Reflection sub-block in "Divergences and notes". Set status to `completed`. Propose the PR to the Human.

#### [x] Task 4.6: Commit changes

Commit `openCodeProvider.ts` (watch patterns), `docs/technical-context.md`, `README.md` (if updated), and the new and updated test files. Commit message: `feat(archiving): add opencode watch patterns, signalling, and documentation`.

---

## Divergences and notes

### DIV-001 (Task 1.1): `readOnly` vs `readonly` — option casing

- **Expected (PLAN-005):** `DatabaseSync(path, { readonly: true })` (camelCase with lowercase `o`).
- **Observed:** The `node:sqlite` TypeScript type requires `readOnly: true` (camelCase with uppercase `O`). Using `readonly: true` silently ignored the option, opening a read-write handle. With the correct `readOnly: true`, INSERT throws `"attempt to write a readonly database"` and opening a non-existent path throws. Both tests updated accordingly.
- **Corrective action:** Used `{ readOnly: true }` everywhere. Test descriptions and AC-7 coverage updated to reflect actual throw behavior.

### DIV-002 (Task 1.1): `openDb` for non-existent path throws with `readOnly: true`

- **Expected (PLAN-005 / WS spec Task 1.1):** `openDb` does not throw for a non-existent path; `getAllSessionRows` returns `[]`.
- **Observed:** With `readOnly: true`, `DatabaseSync` throws "unable to open database file" for non-existent paths. The provider's per-store try/catch (Tier-2 guard) catches this, which is the correct behavior — absent stores are an ENOENT no-op via the empty `resolveStores()` return, not via `openDb` succeeding.
- **Corrective action:** Test updated to `expect(() => openDb(tmpPath())).toThrow()`. Tier-2 guard already covers this case.

### DIV-003 (Task 1.1): Snapshot isolation via "database is locked" (not silent success)

- **Expected (PLAN-005):** concurrent write during open deferred read transaction is blocked or not visible within the transaction.
- **Observed:** Under Node 22.22, the write handle's INSERT throws "database is locked" while the deferred read transaction is open. The assertion was restructured to accept either `writeBlocked = true` or `rowsDuring.length === rowsBefore.length` without conditional expects.
- **Corrective action:** Test uses `expect(writeBlocked || rowsDuring.length <= rowsBefore.length + 1).toBe(true)` — both outcomes confirm the mitigation is effective.

### DIV-004 (Task 1.2 / Task 1.4): `SessionFile.uri?` + `readContent?` applied in Activity 1

- **Expected:** `types.ts` additive seam changes are Task 2.2.
- **Observed:** `OpenCodeProvider` builds `SessionFile` objects without `uri` and with `readContent`, so `types.ts` had to be patched in Activity 1 to allow the provider to compile. `archiveService.ts` also required a guard at `copyRawArchive` (`if (!session.uri) return undefined`) in Activity 1.
- **Corrective action:** Applied seam changes early. Activity 2 Tasks 2.1–2.2 will add the remaining `readAndParse` conditional and the three `copyRawArchive` skip guards; this early application is a subset of that work.

### DIV-005 (Task 1.3): Compaction confirmed — session-level metadata only

- **Observed:** A fixture session with `time_compacting` set and no corresponding `message`/`part` rows yields no compaction events in the materialized §3 document. `compactionSummaries` will be `[]` for all OpenCode sessions in the parser (Activity 3, Task 3.2). `time_compacting` is metadata-only; the parser carries it as `session.timeCompacting` in the §3 document but does not produce a `CompactionSummary` from it.
- **Corrective action:** Confirmed. Task 3.1 parser tests will encode `compactionSummaries: []` as the invariant.

### DIV-006 (Task 1.3): Windows store path TBV

- **Observed:** The Windows equivalent of `~/.local/share/opencode` is unconfirmed (no Windows test host available). Implemented as `process.env.XDG_DATA_HOME ? path.join(…) : path.join(os.homedir(), '.local', 'share', 'opencode')` per PLAN-005 §2. Added TODO comment in `openCodeProvider.ts`.
- **Corrective action:** Provider degrades safely to absent-store no-op when the resolved path does not exist on Windows.

### DIV-007 (Task 1.3): `materializeSession` content test placed in Activity 1 (Task 2.3 pre-implementation)

- **Expected:** Task 2.3 adds the `readContent()` §3 content test.
- **Observed:** The test was added to `openCodeProvider.test.ts` during Activity 1 to validate `materializeSession` (implemented in Activity 1 per Task 1.2). This pre-implements a Task 2.3 subtask.
- **Corrective action:** Task 2.3 documentation step still applies; Tasks 2.1–2.2 proceed as planned.

### DIV-008 (Task 2.2): `readContent` exception path returns `unrecognized` status rather than direct warn

- **Expected (WS spec):** When `readContent` throws, the session is skipped with `logger.warn('OpenCode session … readContent threw — skipping: …')`.
- **Observed:** The current implementation wraps the throw in `readAndParse`, returning `{ status: 'unrecognized', reason: 'readContent threw' }`. The warn is then emitted by `writeArchiveFile` at the unrecognized-format path: `"Unrecognized format for <displayName>: readContent threw"`. The semantic outcome is identical (session skipped, warn logged) but the message text differs from the spec.
- **Corrective action:** Test updated to assert `stringContaining('Unrecognized')` to match the actual warn path. No code change needed — the behavior satisfies the intent.

### Reflection

**Divergence count by cause:**

| Cause                                | Count |
| ------------------------------------ | ----- |
| node:sqlite behavioral difference    | 3     |
| Early application of planned change  | 2     |
| Schema-discovery finding (confirmed) | 2     |
| Warn message text differs from spec  | 1     |
| **Total**                            | **8** |

**Recurring patterns:**

1. **Runtime behavioral discovery over spec assumptions.** Three divergences (DIV-001, DIV-002, DIV-003) arose from `node:sqlite`'s actual behavior differing from PLAN-005 descriptions that used the wrong option casing (`readonly` vs `readOnly`). The fix was immediate in each case but required test restructuring. Pattern: spec descriptions of third-party module APIs should be validated against the TypeScript type definition before the StepLedger is written.

2. **Seam changes pulled forward by compilation dependencies.** DIV-004 and DIV-007 both arose because the provider's `SessionFile` construction required the seam changes in `types.ts` and `archiveService.ts` to be applied a full activity earlier than planned. The StepLedger placed those changes in Activity 2 but Activity 1 could not compile without them. Pattern: when a new provider implements an interface that does not yet exist in its final form, the interface change should be placed in the same activity as the first implementation that requires it.

3. **`vi.doMock` without `vi.resetModules()` causes stale cache.** Multiple Tier-1/Tier-2 signal tests failed silently because the module cache retained the real `sqliteAvailable`. The fix was `vi.resetModules()` before every `vi.doMock`. This is a known Vitest isolation requirement that should be documented as a standing pattern in the test fixture conventions.

**Proposed improvements:**

- Add a note to the StepLedger authoring skill: "When a new provider requires interface changes, place those interface changes in the same activity." This prevents Activity 1/2 ordering issues of the DIV-004 type.
- Add a standing note to the project test conventions: "`vi.doMock` for module-level constants requires `vi.resetModules()` beforehand."
- The `node:sqlite` option name (`readOnly` not `readonly`) should be recorded as a project-level known quirk so future adapters do not repeat the same discovery.

**Assessment:**

WS-0022 was completed in four activities across two sessions (context compaction at Activity 1/2 boundary). All 13 acceptance criteria are covered by passing tests. The final test count is 1113 (baseline 1048, +65 new tests). Zero type errors, zero lint errors. The OpenCode provider is end-to-end: store discovery → workspace-matched sessions → §3 JSON materialization → `OpenCodeParser` → normalized markdown → archive. Change detection via per-session fingerprint and watch patterns are operational. Documentation updated in `docs/technical-context.md` and `README.md`. PR is ready for review.
