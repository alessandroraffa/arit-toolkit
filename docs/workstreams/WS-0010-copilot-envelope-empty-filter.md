---
title: 'Copilot Chat envelope unwrapping, empty session filtering, and turn mismatch investigation'
plan: PLAN-003-archiving-parser-correctness
workstream: WS-0010
status: in-progress
workspaces: []
dependencies: []
created: 2026-03-23
---

This workstream implements Increment 2 of PLAN-003. It addresses three defects. First, `CopilotChatParser.parseContent` in `src/features/agentSessionsArchiving/markdown/parsers/copilotChatParser.ts` returns the VS Code serialization envelope object (`{kind: 0, v: {...}}`) directly when `JSON.parse` succeeds, because it does not check for the envelope before returning. The parser then searches for `requests` at the top level of the envelope, finds nothing, returns `status: 'unrecognized'`, and the archive service falls through to `copyRawArchive`. The fix detects the envelope and extracts `v` before returning. Second, `AgentSessionArchiveService.writeArchiveFile` in `src/features/agentSessionsArchiving/archiveService.ts` does not check whether a parsed session contains meaningful content before writing, producing empty stub files. The fix adds a guard that skips the write and logs the skip when the session has no non-empty turns. Third, three sessions show user/agent turn mismatches in the archive; this workstream investigates whether the parser drops valid response items and applies a correction if a parser defect is identified.

## Execution instructions

> Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the workstream status is `draft`, do NOT start execution — follow `agent-coding/operational-framework/skills/draft-review/SKILL.md` to validate the workstream. If the workstream status is `deferred`, do NOT start execution — wait for the PM to move it back to `draft` or `idle`. If the workstream status is `canceled`, do NOT start execution — it is terminal. If the workstream status is `failed`, do NOT start execution — return to the PM because a lifecycle decision is required before any resume attempt. Read `docs/plans/PLAN-003-archiving-parser-correctness.md`, `docs/technical-context.md`, and the execution protocol. Run `nvm use 22.22` before running any pnpm scripts. If the workstream status is `idle`, set it to `in-progress`. If no plan branch exists yet, create it (see `execution-protocol skill`, Branch and PR Lifecycle) and push to remote.

**Before each activity** → read all tasks and subtasks in the activity to understand the full scope before writing any code.

**During execution** → always read a file before modifying it. Mark each subtask `[x]` immediately upon completion, then the task, then the activity — never batch. After completing each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" — before moving to the next task. Divergences that identify defects or gaps must include a corrective action (task or PM escalation).

**Before each commit** → verify functional coherence: every entry point introduced by the commit must be functional, not just compilable. Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. Document any undocumented divergence before committing.

**When completing the last activity of this workstream** → compile the Reflection sub-block in "Divergences and notes" (see `execution-protocol skill`, During Execution, step 10). Update the frontmatter status to `completed`. If all workstreams of the plan are now completed, verify that no additional workstream is needed, then propose PR and merge to the project manager.

## Activities, Tasks and Subtasks

### [x] Activity 1: Investigate user/agent turn mismatches in Copilot Chat source files

#### [x] Task 1.1: Locate source files for the two mismatch sessions with a response gap

- [x] Locate the source file for session `202504051500-copilot-chat-9d33fd10` (archived with 12 user turns and 11 agent turns) in VS Code workspaceStorage or globalStorage Copilot Chat directories. The file will be in the VS Code globalStorage directory for the Copilot Chat extension or in a workspace-scoped storage path.
- [x] Locate the source file for session `202603221254-copilot-chat-6c25d312` (archived with 6 user turns and 3 agent turns) in the same directories.
- [x] For each located file, determine whether it is single-line JSON (direct format or envelope), multi-line JSONL (delta format), or absent. If absent, record the finding and skip Tasks 1.2 and 1.3 for that session.

#### [x] Task 1.2: Count requests and non-empty responses in source files

- [x] For `9d33fd10`: parse the file (applying envelope unwrapping if `kind: 0` is detected, or JSONL reconstruction if the file is multi-line). Count the total number of entries in `requests`. Count how many of those entries have a `response` array with at least one item whose `kind` is not `null` or whose `value` is non-empty. If the count of non-empty responses equals 12, the parser drops one valid response — identify which `kind` value on the missing response item is not handled by `extractResponse` in `copilotChatParser.ts`. If the count equals 11, the source data is genuinely incomplete.
- [x] For `6c25d312`: apply the same analysis. If non-empty responses number 6, identify the three `kind` values being dropped. If non-empty responses number 3, the source data is genuinely incomplete.

#### [x] Task 1.3: Record investigation finding

- [x] Record the investigation finding in "Divergences and notes" of this workstream file before proceeding to Activity 2. If a parser defect is identified, state the specific `kind` value(s) that `extractResponse` does not handle and that produce dropped response items. If the source data is genuinely incomplete for one or both sessions, state this with the evidence (request count vs. response count in source).

#### [x] Task 1.4: Commit investigation results

- [x] Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass. Commit this workstream file with commit message: `fix(archiving): investigate copilot chat turn mismatch in source files`.

### [ ] Activity 2: Apply fixes to the Copilot Chat parser and archive service

#### [ ] Task 2.1: Fix `parseContent` in `copilotChatParser.ts` to detect and unwrap the VS Code envelope

Read `src/features/agentSessionsArchiving/markdown/parsers/copilotChatParser.ts` in full before making any changes.

- [ ] Replace the `try` block body within `parseContent` (lines 68–69) with the following implementation: `const raw = JSON.parse(content) as { v?: unknown }; const inner = raw.v !== null && raw.v !== undefined && typeof raw.v === 'object' ? raw.v : raw; return inner as CopilotSession;`. Keep the method signature (line 67), `catch` block (lines 70–72), and closing brace (line 73) unchanged.
- [ ] Confirm that the new implementation handles three cases: (a) content is `{kind: 0, v: {requests: [...]}}` — `inner` is `raw.v` which has `requests`; (b) content is `{requests: [...]}` with no `v` property — `raw.v` is `undefined`, so `inner` is `raw` itself, preserving the existing behavior; (c) content fails `JSON.parse` — falls through to `tryJsonl`, unchanged.

#### [ ] Task 2.2: Add empty session filtering in `archiveService.ts`

Read `src/features/agentSessionsArchiving/archiveService.ts` in full before making any changes.

- [ ] In `writeArchiveFile` (lines 143–173), insert the following block immediately after the `if (result.status === 'unrecognized')` block (which ends at line 160) and before the `const mdFileName` declaration (line 162):

  ```ts
  const allTurnsEmpty = result.session.turns.every(
    (turn) =>
      !turn.content.trim() &&
      turn.toolCalls.length === 0 &&
      !turn.thinking &&
      turn.filesRead.length === 0 &&
      turn.filesModified.length === 0
  );
  if (allTurnsEmpty) {
    this.logger.info(
      `Skipped empty session ${session.displayName} — zero non-empty turns`
    );
    return undefined;
  }
  ```

- [ ] Verify the emptiness criteria match `isEmptyTurn` in `src/features/agentSessionsArchiving/markdown/renderer.ts` (lines 24–31): `!turn.content.trim()`, `turn.toolCalls.length === 0`, `!turn.thinking`, `turn.filesRead.length === 0`, `turn.filesModified.length === 0`.

Note: `writeArchiveFile` returns `undefined` for skipped empty sessions. The caller `archiveSession` (line 134) only updates `lastArchivedMap` when the return value is truthy. To prevent perpetual reprocessing of empty sessions on every cycle, the `archiveSession` method must also update `lastArchivedMap` when `writeArchiveFile` returns `undefined`. Add the following immediately after the existing `if (archiveFileName)` block (after line 140): `else { this.lastArchivedMap.set(session.archiveName, { mtime: session.mtime, archiveFileName: '' }); }`. This records the session's mtime so the next cycle's guard (`entry?.mtime === session.mtime`) skips it.

#### [ ] Task 2.3: Fix `extractResponse` in `copilotChatParser.ts` for confirmed dropped `kind` values (conditional)

If Task 1.2 identified specific `kind` values that `extractResponse` does not handle and that cause valid response items to be dropped, perform the following. If Task 1.2 confirmed incomplete source data for both sessions, skip this task and record the skip in "Divergences and notes".

- [ ] In the `for` loop of `extractResponse` (lines 131–143), add a branch for each confirmed dropped `kind` value. If the `kind` produces text content, push the item's `value` to `textParts`. If the `kind` produces tool content, add to `toolCalls` using `buildToolCall`. If the `kind` produces thinking content, push to `thinkingParts`. Follow the pattern of the existing branches in the loop.
- [ ] Confirm the new branch does not overlap with the existing `kind === null` and `kind === 'markdownContent'` condition on line 140.

#### [ ] Task 2.4: Add unit tests for envelope parsing, empty session filtering, and any confirmed turn mismatch correction

In `test/unit/features/agentSessionsArchiving/markdown/parsers/copilotChatParser.test.ts`, add the following test cases after the existing tests.

- [ ] Add test `'should parse an envelope-format session with kind 0 and v containing requests'`: content is `JSON.stringify({ kind: 0, v: { requests: [{ message: { text: 'Hello' }, response: [{ kind: 'markdownContent', value: 'Hi there.' }] }] } })`; assert `session.turns.length === 2`, `turns[0].role === 'user'` with `content === 'Hello'`, `turns[1].role === 'assistant'` with `content === 'Hi there.'`.
- [ ] Add test `'should parse an envelope-format session where v.requests is empty'`: content is `JSON.stringify({ kind: 0, v: { requests: [] } })`; assert `result.status === 'parsed'` and `session.turns.length === 0`.
- [ ] Add test `'should parse an envelope-format session with multiple requests'`: content is `JSON.stringify({ kind: 0, v: { requests: [{ message: { text: 'Q1' }, response: [{ kind: 'markdownContent', value: 'A1' }] }, { message: { text: 'Q2' }, response: [{ kind: 'markdownContent', value: 'A2' }] }] } })`; assert `session.turns.length === 4` and turns alternate user/assistant in order.
- [ ] Add test `'should continue to parse direct-format sessions without envelope'`: use the direct-format JSON `{ requests: [{ message: { text: 'How do I sort an array?' }, response: [{ kind: 'markdownContent', value: 'Use Array.sort().' }] }] }`; assert the same result as the existing `'should parse user and assistant turns from requests'` test — this is a regression guard.
- [ ] If Task 2.3 added handling for confirmed dropped `kind` values: add one test per new `kind` value using the confirmed payload structure from Task 1.2. Assert that the assistant turn produced for that request item is non-empty.

In `test/unit/features/agentSessionsArchiving/archiveService.test.ts`, add the following test cases inside the `describe('runArchiveCycle')` block.

- [ ] Add test `'should skip writing and log info for a parsed copilot-chat session with zero non-empty turns'`: create a session with `providerName: 'copilot-chat'` and `extension: '.json'`; set `workspace.fs.readFile = vi.fn().mockResolvedValue(new TextEncoder().encode(JSON.stringify({ kind: 0, v: { requests: [] } })))`; run the archive cycle; assert `workspace.fs.writeFile` was not called and `logger.info` was called with a string containing `'Skipped empty session'`. Then run a second archive cycle and assert the session is not re-parsed (the `lastArchivedMap` entry prevents reprocessing).
- [ ] Add test `'should write the archive file for a parsed copilot-chat session with at least one non-empty turn'`: create a session with `providerName: 'copilot-chat'` and `extension: '.json'`; set `workspace.fs.readFile = vi.fn().mockResolvedValue(new TextEncoder().encode(JSON.stringify({ requests: [{ message: { text: 'Hello' }, response: [{ kind: 'markdownContent', value: 'Hi.' }] }] })))`; also set `workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined)`; run the archive cycle; assert `workspace.fs.writeFile` was called.

#### [ ] Task 2.5: Update impacted documentation

- [ ] Update `docs/technical-context.md` section 8.6 ("Agent Session Archiving Model"): add a sentence to the `ParseResult` paragraph noting that the Copilot Chat parser detects and unwraps the VS Code `{kind, v}` serialization envelope before accessing session fields. Add a sentence noting that the archive service skips writing sessions where all turns have empty content, no tool calls, no thinking, and no file references, logging the skip at `info` level.
- [ ] Mark all completed checkboxes in this workstream file.

#### [ ] Task 2.6: Run quality gate and commit

- [ ] Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. If any check fails, resolve the failure before committing.
- [ ] Commit `src/features/agentSessionsArchiving/markdown/parsers/copilotChatParser.ts`, `src/features/agentSessionsArchiving/archiveService.ts`, `test/unit/features/agentSessionsArchiving/markdown/parsers/copilotChatParser.test.ts`, `test/unit/features/agentSessionsArchiving/archiveService.test.ts`, `docs/technical-context.md`, and this workstream file with commit message: `fix(archiving): unwrap copilot chat envelope, filter empty sessions, resolve turn mismatch`.

## Divergences and notes

**Activity 1 investigation finding — turn mismatch source analysis:**

- **Session `9d33fd10` (direct JSON, no envelope):** File located at `workspaceStorage/2d7b0a91d5ebbf29362cd73610268f70/chatSessions/9d33fd10-2d2c-41f9-9df3-9406d1d7df9f.json` (and duplicate at `6cabd8a896839c5d7a516c90465f1d6a`). Format: single-line JSON, direct format — no `{kind, v}` envelope. Request count: 12. Request 3 has an empty `response` array (0 items) — the source data is genuinely incomplete for that turn. Non-empty text responses: 11, matching the archived count. Unhandled `kind` values found (`progressMessage`, `inlineReference`) have no text `value`, so they do not produce dropped response items. Conclusion: **source data genuinely incomplete; no parser defect identified**.
- **Session `6c25d312` (JSONL delta format):** File located at `workspaceStorage/6cabd8a896839c5d7a516c90465f1d6a/chatSessions/6c25d312-7471-4689-95f1-61456e19f0e3.jsonl`. Format: multi-line JSONL delta. Total requests after reconstruction: 6. Requests 1, 2, 3 have responses containing only `mcpServersStarting`, `progressMessage`, `warning`, and `command` items — all without a text `value`. Requests 0, 4, 5 have meaningful text content (18, 10, and 4 text items respectively). Non-empty responses: 3, matching the archived count. Conclusion: **source data genuinely incomplete; no parser defect identified; 6 user turns vs 3 agent turns accurately reflects the source**.
- **Task 2.3 implication:** Both sessions have genuinely incomplete source data. Task 2.3 (fix `extractResponse` for confirmed dropped `kind` values) is **skipped** per its conditional: "If Task 1.2 confirmed incomplete source data for both sessions, skip this task."

### Reflection

_To be compiled at workstream completion._
