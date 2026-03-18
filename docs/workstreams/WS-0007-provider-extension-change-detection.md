---
title: 'Full session archiving — provider extension and change detection'
plan: 202603181530-full-session-archiving-plan
workstream: WS-0007
status: idle
workspaces: []
dependencies: [WS-0004]
created: 2026-03-18
---

This workstream implements Increment 5 of the full session archiving plan. It extends the `SessionFile` type with an optional composite modification indicator, extends `ClaudeCodeProvider.findSessions` to stat companion directory files and compute that indicator, updates `archiveService.ts` change detection to use the composite indicator when present, and extends `ClaudeCodeProvider.getWatchPatterns` to return additional patterns covering companion subdirectories. Other providers are unaffected — they omit the new field. The archive service falls back to the main JSONL mtime when the composite indicator is absent, preserving backward compatibility.

## Execution instructions

Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the workstream status is `draft`, do NOT start execution — follow `agent-coding/skills/draft-review/SKILL.md` to validate the workstream. Verify that WS-0006 has status `completed` before starting (WS-0007 depends on WS-0004 technically, but sequential execution through WS-0006 is the recommended order). Read the implementation plan at `docs/implementation-plans/202603181530-full-session-archiving-plan.md`, `docs/technical-context.md`, and the execution protocol. Run `nvm use 22.22` before running any pnpm scripts. Check out the branch `feat/full-session-archiving`. If the workstream status is `idle`, set it to `in-progress`.

**Before each activity** → read all tasks and subtasks in the activity to understand the full scope before writing any code.

**During execution** → always read a file before modifying it. Mark each subtask `[x]` immediately upon completion, then the task, then the activity — never batch. After completing each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" before moving to the next task.

**Before each commit** → run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. Document any undocumented divergence before committing.

**When completing the last activity of this workstream** → compile the Reflection sub-block in "Divergences and notes". Update the frontmatter status to `completed`. This is the last workstream for this plan. Verify that no additional workstream is needed (rework, gaps), then propose PR and merge to the project manager.

## Activities, Tasks and Subtasks

### [ ] Activity 1: Extend `SessionFile` type and update `ClaudeCodeProvider`

#### [ ] Task 1.1: Add `compositeMtime` to `SessionFile` in `src/features/agentSessionsArchiving/types.ts`

Open `src/features/agentSessionsArchiving/types.ts`. Read it in full before editing. Add one optional field to the `SessionFile` interface after `readonly mtime: number;`:

```typescript
readonly compositeMtime?: number;
```

`compositeMtime` is the maximum `mtime` across the main JSONL file and all companion files. When absent, the archive service uses `mtime` for change detection. No other fields or interfaces in this file require modification. Existing provider implementations that do not set `compositeMtime` remain valid because the field is optional.

#### [ ] Task 1.2: Implement companion directory mtime computation in `ClaudeCodeProvider`

Open `src/features/agentSessionsArchiving/providers/claudeCodeProvider.ts` (currently 62 lines). Read it in full before editing.

Add a private async method `computeCompositeMtime`:

```typescript
private async computeCompositeMtime(
  mainMtime: number,
  companionDirUri: vscode.Uri
): Promise<number>
```

The method:

1. Attempts `vscode.workspace.fs.readDirectory(companionDirUri)`. If the call throws (directory absent or permission denied), returns `mainMtime` immediately.
2. Initialises `max = mainMtime`.
3. Iterates the top-level directory entries. For each entry whose name is `'subagents'` or `'tool-results'` and whose type is `vscode.FileType.Directory`, constructs the subdirectory URI as `vscode.Uri.joinPath(companionDirUri, name)` and attempts `vscode.workspace.fs.readDirectory(subdirUri)`. If `readDirectory` throws for the subdirectory, skips it and continues.
4. Within each subdirectory, iterates the returned entries. For each entry whose type is `vscode.FileType.File`, constructs the file URI as `vscode.Uri.joinPath(subdirUri, fileName)` and calls `vscode.workspace.fs.stat(fileUri)`. If `stat` throws (permission denied or file disappeared), skips that file and continues. If `stat` succeeds, updates `max` with `Math.max(max, stat.mtime)`.
5. Returns `max`.

`path` is already imported at line 3 of `claudeCodeProvider.ts` — no new import required.

The companion directory URI is derived the same way as in `companionDataResolver.ts`: same parent as the session JSONL, named with the session ID (filename without extension). Derive it using `vscode.Uri.file(path.join(path.dirname(sessionUri.fsPath), sessionId))`.

#### [ ] Task 1.3: Extend `toSessionFile` to include `compositeMtime`

In `claudeCodeProvider.ts`, modify the `toSessionFile` private method. After obtaining `times` from `getFileTimes(uri)`, derive the session ID from `name` using `path.parse(name).name`. Construct the companion directory URI as described in Task 1.2. Call `await this.computeCompositeMtime(times.mtime, companionDirUri)` to get `compositeMtime`. Include it in the returned `SessionFile` object:

```typescript
return {
  uri,
  providerName: this.name,
  archiveName: `claude-code-${path.parse(name).name}`,
  displayName: `Claude Code ${name}`,
  mtime: times.mtime,
  compositeMtime,
  ctime: times.ctime,
  extension: path.extname(name) || '',
};
```

`exactOptionalPropertyTypes: true` permits assigning a `number` to the `compositeMtime` field unconditionally — `computeCompositeMtime` always returns a number (at minimum `mainMtime`), so the field is always present on `ClaudeCodeProvider` sessions.

#### [ ] Task 1.4: Extend `getWatchPatterns` in `ClaudeCodeProvider` to cover companion directories

In `claudeCodeProvider.ts`, locate `getWatchPatterns`. Currently it returns one pattern: `{ baseUri, glob: '*.jsonl' }`. Extend it to return two additional patterns:

```typescript
return [
  { baseUri, glob: '*.jsonl' },
  { baseUri, glob: '*/subagents/*.jsonl' },
  { baseUri, glob: '*/tool-results/*' },
];
```

`baseUri` is the project directory URI. The glob `*/subagents/*.jsonl` matches subagent transcript files in any session's companion directory. The glob `*/tool-results/*` matches any tool-result file in any session's companion directory. The `SessionFileWatcher` already supports multiple patterns per provider — no changes to `sessionFileWatcher.ts` are required.

#### [ ] Task 1.5: Update impacted documentation

Update the workstream file checkboxes.

#### [ ] Task 1.6: Commit changes

Commit `src/features/agentSessionsArchiving/types.ts`, `src/features/agentSessionsArchiving/providers/claudeCodeProvider.ts`, and this workstream file. Use commit message: `feat(agentSessionsArchiving): extend session file type and claude code provider with composite mtime and companion watch patterns`.

### [ ] Activity 2: Update archive service change detection and add unit tests

#### [ ] Task 2.1: Update change detection in `archiveService.ts` to use `compositeMtime`

Open `src/features/agentSessionsArchiving/archiveService.ts`. Read it in full before editing.

Locate the `archiveSession` private method. The current change detection check is:

```typescript
if (entry?.mtime === session.mtime) {
  return;
}
```

Replace it with:

```typescript
const effectiveMtime = session.compositeMtime ?? session.mtime;
if (entry?.mtime === effectiveMtime) {
  return;
}
```

Also update the `lastArchivedMap.set` call at the end of `archiveSession` to store `effectiveMtime` instead of `session.mtime`:

```typescript
this.lastArchivedMap.set(session.archiveName, {
  mtime: effectiveMtime,
  archiveFileName,
});
```

This ensures that when a companion file changes (increasing `compositeMtime` above the stored value), the session is re-archived. When `compositeMtime` is absent (non-Claude-Code providers), `session.mtime` is used — existing behavior preserved.

#### [ ] Task 2.2: Add unit tests for provider companion mtime and watch patterns

Open `test/unit/features/agentSessionsArchiving/providers/claudeCodeProvider.test.ts` (currently 112 lines). Read it before modifying.

Add the following four tests to the existing `describe('ClaudeCodeProvider', () => { ... })` block:

**Test 1 — `compositeMtime` equals main mtime when no companion directory exists:** Mock `workspace.fs.readDirectory` to reject for the companion directory call (throw `new Error('not found')`). Confirm `sessions[0].compositeMtime === sessions[0].mtime`.

**Test 2 — `compositeMtime` is the maximum across main and companion files:** Mock `workspace.fs.readDirectory` using `vi.fn().mockResolvedValueOnce(...)` sequenced four times: (1) the project directory listing returning the session JSONL, (2) the companion directory returning `[['subagents', vscode.FileType.Directory], ['tool-results', vscode.FileType.Directory]]`, (3) the `subagents/` subdirectory returning `[['agent-abc.jsonl', vscode.FileType.File]]`, (4) the `tool-results/` subdirectory returning `[['toolu_xyz.txt', vscode.FileType.File]]`. Mock `workspace.fs.stat` to return `{ mtime: 2000 }` for `subagents/agent-abc.jsonl` and `{ mtime: 1500 }` for `tool-results/toolu_xyz.txt`. The main JSONL mtime comes from the existing `getFileTimes` mock — set it to `1000`. Confirm `sessions[0].compositeMtime === 2000`.

**Test 3 — stat failure on a companion file falls back gracefully:** Use the same `readDirectory` mock structure as Test 2 (companion directory returns two directory entries; each subdirectory returns one file). Mock `workspace.fs.stat` for the `subagents/agent-abc.jsonl` file URI to throw. Mock `workspace.fs.stat` for the `tool-results/toolu_xyz.txt` file URI to return `{ mtime: 1500 }`. Confirm `sessions[0].compositeMtime === 1500` — the one successfully stated file contributes its mtime, and the main JSONL mtime of 1000 is the baseline.

**Test 4 — `getWatchPatterns` returns three patterns including companion globs:** Call `provider.getWatchPatterns('/my/project')`. Confirm `patterns` has length 3. Confirm one pattern has `glob: '*/subagents/*.jsonl'` and another has `glob: '*/tool-results/*'`.

Note: `workspace.fs.readDirectory` is called multiple times per session in these tests — once for the project directory, once for the companion directory, and once each for the `subagents/` and `tool-results/` subdirectories. Use `vi.fn().mockResolvedValueOnce(...)` (four times) to sequence responses. Verify the call order by reading `claudeCodeProvider.ts` after Task 1.3 is implemented.

#### [ ] Task 2.3: Add unit tests for archive service composite mtime change detection

Open `test/unit/features/agentSessionsArchiving/archiveService.test.ts`. Read it before modifying. Add the following two tests inside the existing `describe('AgentSessionArchiveService', () => { ... })` block in a new nested `describe('composite mtime change detection', () => { ... })`:

**Test 1 — skips re-archive when `compositeMtime` is unchanged:** Create a session with `mtime: 1000` and `compositeMtime: 2000`. Run an archive cycle. Then run a second archive cycle with the same session (same `compositeMtime: 2000`). Confirm `workspace.fs.writeFile` (or `workspace.fs.copy`) was called only once — not on the second cycle.

**Test 2 — triggers re-archive when `compositeMtime` increases:** Create a session with `compositeMtime: 2000` on the first cycle, then `compositeMtime: 3000` on the second cycle. Confirm the archive operation is called twice.

Use `createMockSession({ mtime: 1000, compositeMtime: 2000 })` — `createMockSession` uses `Partial<SessionFile>` overrides so the new field can be added without modifying the helper.

#### [ ] Task 2.4: Run the quality gate

Run `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must exit with code 0. If the archiveService tests fail because `createMockSession` does not forward the `compositeMtime` field, verify that the `SessionFile` type now includes the field and that `createMockSession`'s spread pattern (`...overrides`) already covers it.

#### [ ] Task 2.5: Update impacted documentation

Update the workstream file checkboxes. Update `docs/technical-context.md` if the session file model section describes `SessionFile` fields — add `compositeMtime` to the description. If the technical context does not describe individual fields at this level of detail, no update is needed.

#### [ ] Task 2.6: Commit changes

Commit `src/features/agentSessionsArchiving/archiveService.ts`, `test/unit/features/agentSessionsArchiving/providers/claudeCodeProvider.test.ts`, `test/unit/features/agentSessionsArchiving/archiveService.test.ts`, and this workstream file. Use commit message: `feat(agentSessionsArchiving): update change detection to use composite mtime for companion file awareness`.

## Divergences and notes

_No divergences recorded._

### Reflection

_To be compiled at workstream completion._
