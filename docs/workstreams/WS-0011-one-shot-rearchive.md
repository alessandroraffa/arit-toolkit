---
title: 'One-shot re-archive of pre-fix sessions'
plan: PLAN-003-archiving-parser-correctness
workstream: WS-0011
status: completed
workspaces: []
dependencies: [WS-0009, WS-0010]
created: 2026-03-23
---

This workstream implements Increment 3 of PLAN-003. With both parser corrections from WS-0009 and WS-0010 in place on the plan branch, this workstream confirms that the re-archive of all previously affected sessions happens automatically on the first archive cycle after deployment and does not repeat on subsequent cycles. The mechanism relies on the existing `deduplicateAndHydrate` behavior: on startup, it populates `lastArchivedMap` with `mtime: 0` for all archive files read from disk. Because source session file mtimes are always greater than 0, the `archiveSession` guard (`entry?.mtime === session.mtime`) does not suppress re-processing — every session in the archive is re-processed on the first cycle. After the cycle completes, the map is repopulated with the actual source mtimes, and subsequent cycles resume normal mtime-based skip behavior. No new mechanism is needed. This workstream adds a unit test confirming this behavior, then persists an isolated extension-host verification harness and runbook to execute the verification pass against the sessions identified in the inconsistency report.

## Execution instructions

> Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the workstream status is `draft`, do NOT start execution — follow `agent-coding/operational-framework/skills/draft-review/SKILL.md` to validate the workstream. If the workstream status is `deferred`, do NOT start execution — wait for the PM to move it back to `draft` or `idle`. If the workstream status is `canceled`, do NOT start execution — it is terminal. If the workstream status is `failed`, do NOT start execution — return to the PM because a lifecycle decision is required before any resume attempt. Confirm that WS-0009 and WS-0010 are both `completed` before proceeding. Read `docs/plans/PLAN-003-archiving-parser-correctness.md`, `docs/technical-context.md`, and the execution protocol. Run `nvm use 22.22` before running any pnpm scripts. If the workstream status is `idle`, set it to `in-progress`.

**Before each activity** → read all tasks and subtasks in the activity to understand the full scope before writing any code.

**During execution** → always read a file before modifying it. Mark each subtask `[x]` immediately upon completion, then the task, then the activity — never batch. After completing each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" — before moving to the next task. Divergences that identify defects or gaps must include a corrective action (task or PM escalation).

**Before each commit** → verify functional coherence: every entry point introduced by the commit must be functional, not just compilable. Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. Document any undocumented divergence before committing.

**When completing the last activity of this workstream** → compile the Reflection sub-block in "Divergences and notes" (see `execution-protocol skill`, During Execution, step 10). Update the frontmatter status to `completed`. All workstreams of PLAN-003 are now completed — verify that no additional fix or rework workstream is needed, then propose PR and merge to the project manager.

## Activities, Tasks and Subtasks

### [x] Activity 1: Confirm re-archive mechanism and add unit test

#### [x] Task 1.1: Confirm the `deduplicateAndHydrate` and `archiveSession` behavior in source

Read `src/features/agentSessionsArchiving/archiveService.ts` in full before proceeding.

- [x] Locate `deduplicateAndHydrate` (line 227). Confirm that line 241 stores `mtime: 0` for each archive file found on disk: `this.lastArchivedMap.set(archiveName, { mtime: 0, archiveFileName: best.name })`.
- [x] Locate `archiveSession` (line 117). Confirm that line 122 reads `entry?.mtime === session.mtime` and returns early only when the stored mtime equals the source file mtime. Because `deduplicateAndHydrate` stores `mtime: 0` and all real source file mtimes are positive integers, this guard never triggers for a session hydrated from disk, ensuring re-processing.
- [x] Confirm that after a successful archive write (line 135), `lastArchivedMap` is updated with the actual source `session.mtime`, so the second cycle's guard does trigger (stored mtime equals source mtime), preventing a loop.
- [x] Record the confirmation in "Divergences and notes". If any line numbers do not match (due to changes from WS-0009 or WS-0010), record the actual line numbers.

#### [x] Task 1.2: Add unit test verifying that a hydrated session is reprocessed on the first cycle but skipped on the second

Open `test/unit/features/agentSessionsArchiving/archiveService.test.ts` and add the following test case inside the `describe('runArchiveCycle')` block.

- [x] Add test `'should reprocess a session whose archive was hydrated from disk with mtime 0, then skip it on the second cycle'`: set `workspace.fs.readDirectory = vi.fn().mockResolvedValue([['202603090513-copilot-chat-test-session.md', 1]])` (returning one existing archive file entry for `test-session`); create a mock session with `archiveName: 'copilot-chat-test-session'`, `mtime: 1000`, `providerName: 'test-provider'`, `extension: '.json'`; set `workspace.fs.copy = vi.fn().mockResolvedValue(undefined)`; call `service.start(DEFAULT_CONFIG)` then `await service.runArchiveCycle()` — assert `workspace.fs.copy` was called (the session was re-processed despite already having an archive file, because `deduplicateAndHydrate` stored `mtime: 0`); clear the copy mock; call `await service.runArchiveCycle()` a second time — assert `workspace.fs.copy` was not called (the second cycle skips the session because `lastArchivedMap` now stores `mtime: 1000`).

#### [x] Task 1.3: Update impacted documentation

- [x] Update `docs/technical-context.md` section 8.6 ("Agent Session Archiving Model") under "Replacement semantics (not accumulation)": add a sentence stating that on each startup, `deduplicateAndHydrate` stores `mtime: 0` for all archive files read from disk, causing every session to be re-processed on the first archive cycle. After that cycle, the map is updated with actual source mtimes and subsequent cycles apply normal skip behavior.
- [x] Mark all completed checkboxes in this activity.

#### [x] Task 1.4: Run quality gate and commit

- [x] Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. Commit `test/unit/features/agentSessionsArchiving/archiveService.test.ts`, `docs/technical-context.md`, and this workstream file with commit message: `test(archiving): verify one-shot re-archive via mtime-0 hydration on startup`.

### [x] Activity 2: Automated verification of re-archived session output in the oceanus workspace

#### [x] Task 2.1: Persist and run the isolated extension-host verification harness

- [x] Persist the launcher at `scripts/agent-session-archiving/run-one-shot-rearchive-verification.cjs` and the extension-host runner at `scripts/agent-session-archiving/one-shot-rearchive-runner.cjs`.
- [x] Add the autonomous procedure at `docs/operations/runbooks/agent-session-archiving-verification.md`.
- [x] Build the extension from the plan branch with `pnpm run build`.
- [x] Execute the runbook command against `/Users/alessandroraffa/dev/oceanus` with a copied `workspaceStorage` snapshot from `6cabd8a896839c5d7a516c90465f1d6a` and confirm exit code `0`.

#### [x] Task 2.2: Verify multi-turn Codex sessions in the re-archive

- [x] The runner compares the archive files for `019cd433`, `019d1600`, `019d06f2`, `019c9048`, and `019cf41f` against the source Codex JSONL files under `~/.codex/sessions`, deriving the expected turn counts from `user_message` events instead of from stale workstream assumptions.
- [x] Verified results: `019cd433` = 10 user turns, `019d1600` = 6, `019d06f2` = 5, `019c9048` = 3, `019cf41f` = 3.

#### [x] Task 2.3: Verify Copilot Chat envelope sessions and empty session behavior in the re-archive

- [x] The runner verified that `copilot-chat-7a54e9a3` is archived as markdown with at least 7 `**User:**` sections.
- [x] Source-backed empty envelope sessions `e3380c93`, `ee0e73f7`, `e2f0429e`, `1bc4538f`, `9901b84a`, `f62147e7`, and `4a4d1d26` no longer remain as raw `.jsonl` outputs in the archive.
- [x] Source-backed stub cases `b7311380` and `6be6586b` are absent after filtering; `b6145e31` remains as non-empty markdown with at least one turn section.
- [x] Orphan archive outputs remain for `4ebac531`, `418b3bfd`, and `b5b93bb0` (raw `.jsonl`) plus `bae38255` (header-only `.md`) because those Copilot source sessions are no longer present in current `workspaceStorage`, so no source-backed re-archive is possible.

#### [x] Task 2.4: Verify no loop on the second archive cycle

- [x] The runner waited `intervalMinutes + 45s` after the first cycle, snapshotted archive mtimes for the validated Codex and Copilot targets, and confirmed that unchanged source-backed targets were not rewritten on the second cycle.

#### [x] Task 2.5: Record verification results

- [x] Record the verification results for Tasks 2.2, 2.3, and 2.4 in "Divergences and notes" of this workstream file.
- [x] Replace the placeholder text in `docs/plans/PLAN-003-archiving-parser-correctness.md` with a completion summary referencing the automated runbook.
- [x] Mark all completed checkboxes in this workstream file except the final quality-gate-and-commit task.

#### [x] Task 2.6: Run quality gate and commit

- [x] Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. Result on 2026-04-28: zero errors, the same 7 pre-existing lint warnings already present on the branch, and 64/64 test files with 730/730 tests passed.
- [x] Commit this workstream file and `docs/plans/PLAN-003-archiving-parser-correctness.md` with commit message: `docs(archiving): complete one-shot re-archive verification for codex and copilot chat sessions`.

## Divergences and notes

**D1 — Re-archive scope includes all providers, not just Codex and Copilot Chat.** The plan's Increment 3 originally stated "The re-archive must scope its reprocessing to providers affected by this initiative (Codex and Copilot Chat)." The existing `deduplicateAndHydrate` mechanism stores `mtime: 0` for ALL archive files, causing all providers' sessions to be reprocessed on the first cycle. Adding provider-scoped filtering would introduce complexity with no functional benefit — unaffected sessions regenerate identical output. PM approved accepting this divergence and updating the plan constraint (2026-03-23).

**D2 — Task 1.1 line number confirmation (actual vs. workstream-specified).** The workstream specified `deduplicateAndHydrate` at line 227 and the `mtime: 0` store at line 241; the guard at line 122; the mtime update at line 135. After changes from WS-0009 and WS-0010, the actual line numbers are: `deduplicateAndHydrate` starts at line 247, `mtime: 0` store at line 261; `archiveSession` starts at line 117, guard at line 122; mtime update after successful write at lines 135–138. The guard and mtime-update line numbers match the workstream exactly; the `deduplicateAndHydrate` function shifted by 20 lines due to code additions from prior workstreams. Behavioral confirmation is unchanged: all three mechanisms operate as described.

**D3 — Activity 2 now uses a persisted isolated extension-host runner instead of manual EDH inspection.** The verification was executed with `scripts/agent-session-archiving/run-one-shot-rearchive-verification.cjs`, which copies the target workspace's `workspaceStorage` into a temporary VS Code profile and runs `scripts/agent-session-archiving/one-shot-rearchive-runner.cjs` against that isolated profile. The full operator procedure now lives in `docs/operations/runbooks/agent-session-archiving-verification.md`.

**D4 — The workstream's original "2 user turns" expectation for two Codex samples was stale.** The source JSONL files for `019c9048` and `019cf41f` both contain 3 `user_message` events, not 2. The verification runner now derives the expected Codex turn count directly from the source JSONL so the proof stays aligned with real session data instead of historical assumptions.

**D5 — Source-backed empty Copilot sessions were filtered; orphan archive artifacts remain.** The automated verification confirmed that source-backed empty envelope sessions (`e3380c93`, `ee0e73f7`, `e2f0429e`, `1bc4538f`, `9901b84a`, `f62147e7`, `4a4d1d26`) no longer remain as raw `.jsonl` files in the archive. Four stale artifacts remain because their source sessions are no longer present in current `workspaceStorage`: raw `.jsonl` files `4ebac531`, `418b3bfd`, `b5b93bb0` and header-only stub `.md` `bae38255`. This is accepted: Tangyr Workbench replaces archive files only for session IDs returned by the current provider scan and does not prune orphaned historical artifacts automatically.

### Reflection

- The one-shot re-archive proof is now rerunnable without `.tmp` files via `scripts/agent-session-archiving/` and `docs/operations/runbooks/agent-session-archiving-verification.md`.
- The second-cycle loop check exposed a real provider bug: Copilot `chatSessions` can contain both `.json` and `.jsonl` for the same session ID, so the provider now deduplicates by `archiveName`, keeps the newest source by `mtime`, and prefers `.jsonl` on ties.
- Verification criteria must distinguish source-backed empty sessions from orphan archive artifacts that no longer have a live Copilot source.
