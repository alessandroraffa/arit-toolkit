---
title: 'Codex parser multi-turn correction and reasoning investigation'
plan: PLAN-003-archiving-parser-correctness
workstream: WS-0009
status: draft
workspaces: []
dependencies: []
created: 2026-03-23
---

This workstream implements Increment 1 of PLAN-003. The Codex parser currently accumulates all JSONL events into a single `ParseState`, producing at most one user turn and one assistant turn per session regardless of the actual number of conversation exchanges. The root cause is that each `user_message` event overwrites `state.userContent` rather than emitting the previously accumulated turn. The fix changes `processEventMsg` to detect each `user_message` event as a turn boundary: when a new user message arrives while the state already contains accumulated content, the parser emits the completed turn pair before resetting the state. The `parse` method is updated to accumulate a list of completed turns rather than calling `buildTurns` once at the end. The workstream also investigates whether additional reasoning event types beyond `response_item:reasoning` (with `summary_text` blocks) and `event_msg:agent_reasoning` exist in the source JSONL files and extends the parser's event handlers if additional types are confirmed.

## Execution instructions

> Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the workstream status is `draft`, do NOT start execution — follow `agent-coding/operational-framework/skills/draft-review/SKILL.md` to validate the workstream. If the workstream status is `deferred`, do NOT start execution — wait for the PM to move it back to `draft` or `idle`. If the workstream status is `canceled`, do NOT start execution — it is terminal. If the workstream status is `failed`, do NOT start execution — return to the PM because a lifecycle decision is required before any resume attempt. Read `docs/plans/PLAN-003-archiving-parser-correctness.md`, `docs/technical-context.md`, and the execution protocol. Run `nvm use 22.22` before running any pnpm scripts. If the workstream status is `idle`, set it to `in-progress`. If this is the first workstream of the plan to start and no plan branch exists yet, create the branch (see `execution-protocol skill`, Branch and PR Lifecycle) and push it to remote.

**Before each activity** → read all tasks and subtasks in the activity to understand the full scope before writing any code.

**During execution** → always read a file before modifying it. Mark each subtask `[x]` immediately upon completion, then the task, then the activity — never batch. After completing each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" — before moving to the next task. Divergences that identify defects or gaps must include a corrective action (task or PM escalation).

**Before each commit** → verify functional coherence: every entry point introduced by the commit must be functional, not just compilable. Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. Document any undocumented divergence before committing.

**When completing the last activity of this workstream** → compile the Reflection sub-block in "Divergences and notes" (see `execution-protocol skill`, During Execution, step 10). Update the frontmatter status to `completed`. If all workstreams of the plan are now completed, verify that no additional workstream is needed, then propose PR and merge to the project manager.

## Activities, Tasks and Subtasks

### [ ] Activity 1: Investigate reasoning event types in source Codex JSONL files

#### [ ] Task 1.1: Locate source JSONL files for reasoning-present and reasoning-absent sessions

- [ ] Identify all 5 reasoning-present sessions by scanning the archive directory for Codex `.md` files that contain `<summary>Reasoning</summary>`. Cross-reference the results against the inconsistency report section 1.2 (which lists 3 early sessions from 2026-02-24 and 2026-02-28, plus `019cf5f0` and `019d08fb`). Record the 5 session IDs.
- [ ] Locate the source JSONL files for those 5 sessions in `~/.codex/sessions/` by matching file names against the session ID substrings (e.g., files containing `019cf5f0`, `019d08fb` in their name).
- [ ] Locate the source JSONL files for at least 5 of the 31 reasoning-absent sessions, choosing files from different date ranges: at least one from early February, one from mid-March, and one from late March 2026.

#### [ ] Task 1.2: Compare reasoning-related event types across source files

- [ ] For each located source file, extract all distinct `type` values from `event_msg` payload objects and all distinct `type` values from `response_item` payload objects. Scan the raw JSONL lines for this information.
- [ ] Identify any `event_msg` payload type or `response_item` payload type that appears in the reasoning-present files but is absent from the reasoning-absent files.
- [ ] Determine whether `response_item` events with `type: 'reasoning'` and a non-empty `summary` array appear in the reasoning-absent files.
- [ ] Produce a finding: either (a) list the additional event types found in source files that are not handled by the parser's `RESPONSE_HANDLERS` map or `processEventMsg`, with the payload structure of each, or (b) record a confirmed negative — the 31 reasoning-absent sessions genuinely lack reasoning data in their source JSONL.

#### [ ] Task 1.3: Record investigation finding

- [ ] Record the investigation finding in "Divergences and notes" of this workstream file. If additional reasoning event types were found, list their `type` names and payload structures. If the investigation is a confirmed negative, state this explicitly.

#### [ ] Task 1.4: Commit investigation results

- [ ] Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass. Commit this workstream file with commit message: `fix(archiving): investigate codex reasoning event types in source jsonl files`.

### [ ] Activity 2: Refactor Codex parser for multi-turn support and extend reasoning handling

#### [ ] Task 2.1: Refactor `processEventMsg` and `processLine` to support turn-boundary emission

Read `src/features/agentSessionsArchiving/markdown/parsers/codexParser.ts` in full before making any changes.

- [ ] Change the `processEventMsg` function signature from `(payload: EventMsgPayload, state: ParseState): void` to `(payload: EventMsgPayload, state: ParseState, completedTurns: NormalizedTurn[]): void`.
- [ ] In the `user_message` branch of `processEventMsg` (currently lines 116–118), before setting `state.userContent`, add the following three steps: call `buildTurns(state)` and push all resulting `NormalizedTurn` items into `completedTurns`; call `Object.assign(state, emptyState())` to reset all state fields to their initial values; then set `state.userContent = extractUserRequest(payload.message)` as before.
- [ ] Add `import type { NormalizedTurn } from '../types';` to the import at line 1 if `NormalizedTurn` is not already imported in the file scope (it is used in `buildTurns` return type but verify whether it is in scope at the function level).
- [ ] Change the `processLine` function signature from `(line: string, state: ParseState): void` to `(line: string, state: ParseState, completedTurns: NormalizedTurn[]): void`.
- [ ] In `processLine` (lines 245–256), update the call to `processEventMsg` at line 253 to pass `completedTurns` as the third argument: `processEventMsg(obj.payload as EventMsgPayload, state, completedTurns)`.

#### [ ] Task 2.2: Update the `parse` method to collect all turns across boundaries

- [ ] In the `parse` method of `CodexParser` (lines 214–232), declare `const completedTurns: NormalizedTurn[] = []` immediately before the `for` loop over `lines`.
- [ ] In the loop body at the `this.processLine(line, state)` call (line 221), pass `completedTurns` as the third argument: `this.processLine(line, state, completedTurns)`.
- [ ] After the loop, push the result of `buildTurns(state)` into `completedTurns` to capture the final in-progress turn: `completedTurns.push(...buildTurns(state))`.
- [ ] In the returned `NormalizedSession`, replace `turns: buildTurns(state)` with `turns: completedTurns`.

#### [ ] Task 2.3: Extend parser with confirmed additional reasoning event types (conditional)

If Task 1.2 confirmed additional reasoning event types beyond `response_item:reasoning` (with `summary_text`) and `event_msg:agent_reasoning`, perform the following steps. If Task 1.2 is a confirmed negative, skip this task and record the skip in "Divergences and notes".

- [ ] For each confirmed additional `event_msg` payload type: add a branch in `processEventMsg` that appends the reasoning text to `state.thinking` using the pattern `state.thinking += (state.thinking ? '\n\n' : '') + text`, where `text` is extracted from the confirmed payload field.
- [ ] For each confirmed additional `response_item` payload type: add an entry in `RESPONSE_HANDLERS` with a handler function that extracts the reasoning text from the payload and appends it to `state.thinking` using the same pattern as `handleReasoning`.

#### [ ] Task 2.4: Add unit tests for multi-turn Codex sessions

Open `test/unit/features/agentSessionsArchiving/markdown/parsers/codexParser.test.ts` and add the following test cases after the existing tests. The file's helper functions `jsonl`, `expectParsed`, `SESSION_META`, `userMessage`, `assistantMessage`, `functionCall`, `functionCallOutput`, `customToolCall`, and `customToolCallOutput` are already defined and must be reused.

- [ ] Add test `'should produce two user and two assistant turns for a two-turn session'`: input is `SESSION_META`, `userMessage('First request')`, `assistantMessage('First response')`, `userMessage('Second request')`, `assistantMessage('Second response')`; assert `session.turns.length === 4`, `turns[0].role === 'user'` with `content === 'First request'`, `turns[1].role === 'assistant'` with `content === 'First response'`, `turns[2].role === 'user'` with `content === 'Second request'`, `turns[3].role === 'assistant'` with `content === 'Second response'`.
- [ ] Add test `'should produce three turn pairs for a three-turn session'`: input is `SESSION_META` followed by three cycles of `userMessage('Turn N request')` + `assistantMessage('Turn N response')` for N in 1, 2, 3; assert `session.turns.length === 6` and that `turns[0].content`, `turns[2].content`, `turns[4].content` equal the three user message strings in order.
- [ ] Add test `'should produce five turn pairs for a five-turn session'`: input is `SESSION_META` followed by five cycles of `userMessage` + `assistantMessage`; assert `session.turns.length === 10`, `turns[0].content` equals the first user message, `turns[9].content` equals the fifth assistant message.
- [ ] Add test `'should handle consecutive user messages without intervening assistant response'`: input is `SESSION_META`, `userMessage('First')`, `userMessage('Second')`, `assistantMessage('Response to second')`; assert `turns.length === 3`, `turns[0].role === 'user'` with `content === 'First'`, `turns[1].role === 'user'` with `content === 'Second'`, `turns[2].role === 'assistant'` with `content === 'Response to second'`. (The first user message emits a turn boundary that produces a user turn with no accumulated assistant content, so no assistant turn is emitted for it.)
- [ ] Add test `'should assign tool calls to the correct turn in a multi-turn session'`: input is `SESSION_META`, `userMessage('First')`, `functionCall('exec_command', { cmd: 'git status' }, 'call-1')`, `functionCallOutput('call-1', 'On branch main')`, `assistantMessage('Checked.')`, `userMessage('Second')`, `functionCall('exec_command', { cmd: 'git diff' }, 'call-2')`, `functionCallOutput('call-2', 'No changes')`, `assistantMessage('No diff.')`; assert `turns[1].toolCalls.length === 1` and `turns[1].toolCalls[0].input === 'git status'` and `turns[3].toolCalls.length === 1` and `turns[3].toolCalls[0].input === 'git diff'`.

#### [ ] Task 2.5: Add unit tests for reasoning in multi-turn sessions and any confirmed additional reasoning types

In `test/unit/features/agentSessionsArchiving/markdown/parsers/codexParser.test.ts`, add the following.

- [ ] Add test `'should assign reasoning to the correct assistant turn in a multi-turn session'`: input is `SESSION_META`, `userMessage('First')`, `reasoning('Reasoning for first')`, `assistantMessage('First response')`, `userMessage('Second')`, `reasoning('Reasoning for second')`, `assistantMessage('Second response')` (using the existing `reasoning` helper in the test file); assert `turns[1].thinking === 'Reasoning for first'` and `turns[3].thinking === 'Reasoning for second'`.
- [ ] If Task 2.3 added handlers for confirmed additional reasoning event types: add one test per new event type using the confirmed payload structure. Assert that the `thinking` field on the assistant turn of a single-turn session contains the expected reasoning text.

#### [ ] Task 2.6: Update impacted documentation

- [ ] Update `docs/technical-context.md` section 8.6 paragraph about the Codex parser: add a sentence stating that the parser detects each `user_message` event as a turn boundary, emitting the accumulated turn pair before resetting state, so multi-turn sessions produce distinct turn pairs in their original sequence.
- [ ] Mark all completed checkboxes in this workstream file.

#### [ ] Task 2.7: Run quality gate and commit

- [ ] Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. If any check fails, resolve the failure before committing.
- [ ] Commit `src/features/agentSessionsArchiving/markdown/parsers/codexParser.ts`, `test/unit/features/agentSessionsArchiving/markdown/parsers/codexParser.test.ts`, `docs/technical-context.md`, and this workstream file with commit message: `fix(archiving): correct codex parser multi-turn handling and reasoning extraction`.

## Divergences and notes

_No divergences recorded yet._

### Reflection

_To be compiled at workstream completion._
