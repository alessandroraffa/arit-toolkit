---
title: 'One-shot re-archive of pre-fix sessions'
plan: PLAN-003-archiving-parser-correctness
workstream: WS-0011
status: in-progress
workspaces: []
dependencies: [WS-0009, WS-0010]
created: 2026-03-23
---

This workstream implements Increment 3 of PLAN-003. With both parser corrections from WS-0009 and WS-0010 in place on the plan branch, this workstream confirms that the re-archive of all previously affected sessions happens automatically on the first archive cycle after deployment and does not repeat on subsequent cycles. The mechanism relies on the existing `deduplicateAndHydrate` behavior: on startup, it populates `lastArchivedMap` with `mtime: 0` for all archive files read from disk. Because source session file mtimes are always greater than 0, the `archiveSession` guard (`entry?.mtime === session.mtime`) does not suppress re-processing — every session in the archive is re-processed on the first cycle. After the cycle completes, the map is repopulated with the actual source mtimes, and subsequent cycles resume normal mtime-based skip behavior. No new mechanism is needed. This workstream adds a unit test confirming this behavior, then performs a manual verification pass against the sessions identified in the inconsistency report.

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

### [ ] Activity 2: Manual verification of re-archived session output in the oceanus workspace

#### [ ] Task 2.1: Build and load the patched extension and trigger a full archive cycle

- [ ] Build the extension from the plan branch: run `pnpm run check-types && pnpm run build` from `/Users/alessandroraffa/dev/vscode-extensions/arit`. Both must succeed with zero errors.
- [ ] Open VS Code with the oceanus workspace (`/Users/alessandroraffa/dev/oceanus`) using the Extension Development Host (`code --extensionDevelopmentPath=/Users/alessandroraffa/dev/vscode-extensions/arit /Users/alessandroraffa/dev/oceanus`).
- [ ] Confirm in the ARIT Toolkit Output Channel that the extension activates and that `agentSessionsArchiving.enabled` is `true`. If the feature is disabled in `/Users/alessandroraffa/dev/oceanus/.arit-toolkit.jsonc`, enable it before proceeding.
- [ ] Set the ARIT Toolkit log level to `debug` in the Extension Development Host so that archive cycle log messages are visible. The `archiveSession` method logs at `debug` level (`this.logger.debug(...)`) which is suppressed under the default `info` level. Either set `"arit-toolkit.logLevel": "debug"` in VS Code settings or use the ARIT Toolkit configuration to lower the log level before proceeding.
- [ ] Wait for the first archive cycle to complete. The cycle is complete when the Output Channel shows `Archived <session> → <filename>` entries for Codex and Copilot Chat sessions. If no log appears within `intervalMinutes` after startup, restart the Extension Development Host and wait again.

#### [ ] Task 2.2: Verify multi-turn Codex sessions in the re-archive

- [ ] Open `docs/archive/agent-sessions/` in the oceanus workspace file explorer.
- [ ] Open the re-archived file for `202603092004-codex-019cd433.md` (source had 10 user messages). Count the occurrences of `**User:**` in the file. Pass criterion: at least 10 distinct `**User:**` sections. Fail criterion: the file contains exactly one `**User:**` section.
- [ ] Open the re-archived file for `202603221444-codex-019d1600.md` (source had 6 user messages). Count `**User:**` occurrences. Pass criterion: at least 6. Fail criterion: exactly 1.
- [ ] Open the re-archived file for `202603191634-codex-019d06f2.md` (source had 5 user messages). Pass criterion: at least 5 `**User:**` sections.
- [ ] Open any two of the sessions with 2 original user messages (e.g., `202602241532-codex-019c9048.md` and `202603160054-codex-019cf41f.md`). Pass criterion: each file has exactly 2 `**User:**` sections.
- [ ] If any file fails its criterion, record the failure in "Divergences and notes" and create a corrective action entry before proceeding.

#### [ ] Task 2.3: Verify Copilot Chat envelope sessions and empty session behavior in the re-archive

- [ ] Confirm that `docs/archive/agent-sessions/` contains a `.md` file for the session `copilot-chat-7a54e9a3` (the 2.9 MB session from 2026-02-24 with 7 requests containing content). Open it and count `**User:**` occurrences. Pass criterion: at least 7. Fail criterion: a `.jsonl` raw copy with the same name still exists, or the `.md` file has fewer than 7 `**User:**` sections.
- [ ] Confirm that none of the following raw `.jsonl` files are present in `docs/archive/agent-sessions/`: `copilot-chat-4ebac531.jsonl`, `copilot-chat-e3380c93.jsonl`, `copilot-chat-ee0e73f7.jsonl`, `copilot-chat-e2f0429e.jsonl`, `copilot-chat-1bc4538f.jsonl`, `copilot-chat-418b3bfd.jsonl`, `copilot-chat-b5b93bb0.jsonl`, `copilot-chat-9901b84a.jsonl`, `copilot-chat-f62147e7.jsonl`, `copilot-chat-4a4d1d26.jsonl`. These were the 10 empty-session envelope files. Pass criterion: none present as `.jsonl`. Note: they may also be absent as `.md` if the empty session filter skips them; either absence or a non-empty `.md` file is acceptable.
- [ ] Confirm that none of the following empty stub `.md` files are present with only a header (136–181 bytes): `copilot-chat-b7311380.md`, `copilot-chat-6be6586b.md`, `copilot-chat-bae38255.md`, `copilot-chat-b6145e31.md`. If any file is present, open it and check for at least one `**User:**` or `**Agent:**` section. Pass criterion: the file either does not exist (filtered out) or contains at least one non-empty turn.

#### [ ] Task 2.4: Verify no loop on the second archive cycle

- [ ] After the first re-archive cycle completes, wait for a second archive cycle to complete (the extension polls at `intervalMinutes`; observe the Output Channel until the interval elapses, or restart the Extension Development Host and wait).
- [ ] Confirm the Output Channel does not log `Archived <session> → <filename>` for any Codex or Copilot Chat session that was already re-archived in the first cycle and whose source file has not changed.
- [ ] Pass criterion: zero new archive writes for unchanged sessions in the second cycle. Fail criterion: the Output Channel logs re-archiving for sessions that were processed in the first cycle (loop behavior).

#### [ ] Task 2.5: Record verification results

- [ ] Record the verification results for Tasks 2.2, 2.3, and 2.4 in "Divergences and notes" of this workstream file. Note pass or fail for each session group checked. If any failure is recorded, include a corrective action entry (escalate to PM if source data does not match parser expectations).
- [ ] In `docs/plans/PLAN-003-archiving-parser-correctness.md`, replace the placeholder text in "Open items at completion" with a one-paragraph summary of the verification results confirming that all affected sessions are re-archived and the cycle does not loop.
- [ ] Mark all completed checkboxes in this workstream file.

#### [ ] Task 2.6: Run quality gate and commit

- [ ] Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. Commit this workstream file and `docs/plans/PLAN-003-archiving-parser-correctness.md` with commit message: `docs(archiving): complete one-shot re-archive verification for codex and copilot chat sessions`.

## Divergences and notes

**D1 — Re-archive scope includes all providers, not just Codex and Copilot Chat.** The plan's Increment 3 originally stated "The re-archive must scope its reprocessing to providers affected by this initiative (Codex and Copilot Chat)." The existing `deduplicateAndHydrate` mechanism stores `mtime: 0` for ALL archive files, causing all providers' sessions to be reprocessed on the first cycle. Adding provider-scoped filtering would introduce complexity with no functional benefit — unaffected sessions regenerate identical output. PM approved accepting this divergence and updating the plan constraint (2026-03-23).

**D2 — Task 1.1 line number confirmation (actual vs. workstream-specified).** The workstream specified `deduplicateAndHydrate` at line 227 and the `mtime: 0` store at line 241; the guard at line 122; the mtime update at line 135. After changes from WS-0009 and WS-0010, the actual line numbers are: `deduplicateAndHydrate` starts at line 247, `mtime: 0` store at line 261; `archiveSession` starts at line 117, guard at line 122; mtime update after successful write at lines 135–138. The guard and mtime-update line numbers match the workstream exactly; the `deduplicateAndHydrate` function shifted by 20 lines due to code additions from prior workstreams. Behavioral confirmation is unchanged: all three mechanisms operate as described.

**D3 — Activity 2 (manual verification) cannot be executed by agent — requires VS Code Extension Development Host.** Activity 2 involves launching VS Code, waiting for archive cycles, and visually inspecting the archive directory. These operations require a GUI environment that is not available to the agent. The PM must perform Activity 2 manually. Detailed instructions are recorded below.

**Activity 2 — Manual verification instructions for PM:**

Prerequisites:

- Branch `fix/archiving-parser-correctness` built successfully (`pnpm run check-types && pnpm run build` from `/Users/alessandroraffa/dev/vscode-extensions/arit`).
- The oceanus workspace (`/Users/alessandroraffa/dev/oceanus`) has `agentSessionsArchiving.enabled: true` in `.arit-toolkit.jsonc`.

Steps:

1. Open VS Code Extension Development Host: `code --extensionDevelopmentPath=/Users/alessandroraffa/dev/vscode-extensions/arit /Users/alessandroraffa/dev/oceanus`
2. In VS Code settings, set `"arit-toolkit.logLevel": "debug"` so that `Archived <session> → <filename>` log entries are visible in the ARIT Toolkit Output Channel.
3. Wait for the first archive cycle to complete (interval set by `intervalMinutes` in config). Observe the Output Channel for `Archived` entries.

Task 2.2 verification — multi-turn Codex sessions:

- `202603092004-codex-019cd433.md`: count `**User:**` sections — pass if ≥ 10, fail if exactly 1.
- `202603221444-codex-019d1600.md`: pass if ≥ 6 `**User:**` sections.
- `202603191634-codex-019d06f2.md`: pass if ≥ 5 `**User:**` sections.
- `202602241532-codex-019c9048.md` and `202603160054-codex-019cf41f.md`: pass if each has exactly 2 `**User:**` sections.

Task 2.3 verification — Copilot Chat envelope sessions and empty session behavior:

- `copilot-chat-7a54e9a3`: confirm `.md` file present with ≥ 7 `**User:**` sections (not a raw `.jsonl`).
- Confirm none of these raw `.jsonl` files exist in archive: `copilot-chat-4ebac531.jsonl`, `copilot-chat-e3380c93.jsonl`, `copilot-chat-ee0e73f7.jsonl`, `copilot-chat-e2f0429e.jsonl`, `copilot-chat-1bc4538f.jsonl`, `copilot-chat-418b3bfd.jsonl`, `copilot-chat-b5b93bb0.jsonl`, `copilot-chat-9901b84a.jsonl`, `copilot-chat-f62147e7.jsonl`, `copilot-chat-4a4d1d26.jsonl`.
- Check `copilot-chat-b7311380.md`, `copilot-chat-6be6586b.md`, `copilot-chat-bae38255.md`, `copilot-chat-b6145e31.md`: pass if absent or contains ≥ 1 non-empty `**User:**` or `**Agent:**` turn.

Task 2.4 verification — no loop on second cycle:

- After the first cycle completes, wait for the second archive cycle (or restart EDH and wait).
- Confirm the Output Channel does NOT log `Archived <session> → <filename>` for sessions that were processed in the first cycle and whose source files have not changed.

After completing the manual verification, update Tasks 2.1–2.5 checkboxes and record pass/fail results in this divergence section, then run the quality gate and create the Activity 2 closing commit per Task 2.6.

### Reflection

_To be compiled at workstream completion._
