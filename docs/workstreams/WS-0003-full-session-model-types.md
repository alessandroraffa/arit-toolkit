---
title: 'Full session archiving — normalized model extension and companion data types'
plan: 202603181530-full-session-archiving-plan
workstream: WS-0003
status: completed
workspaces: []
dependencies: []
created: 2026-03-18
---

This workstream implements Increment 1 of the full session archiving plan. It establishes the data contracts required by all subsequent workstreams: extends `NormalizedSession` with optional subagent session and compaction summary fields, and introduces the `CompanionDataContext` type that the resolution layer (WS-0004) will produce and the parser (WS-0005) will consume. No production logic is added here — the goal is to make the new shapes importable and constructible before any component produces or consumes them.

## Execution instructions

Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the workstream status is `draft`, do NOT start execution — follow `agent-coding/skills/draft-review/SKILL.md` to validate the workstream. Verify that WS-0001 and WS-0002 have status `completed` before starting. Read the implementation plan at `docs/implementation-plans/202603181530-full-session-archiving-plan.md`, `docs/technical-context.md`, and the execution protocol. Run `nvm use 22.22` before running any pnpm scripts. If the workstream status is `idle`, set it to `in-progress`. If no branch exists for this plan yet, create `feat/full-session-archiving` from `main` and push it to remote.

**Before each activity** → read all tasks and subtasks in the activity to understand the full scope before writing any code.

**During execution** → always read a file before modifying it. Mark each subtask `[x]` immediately upon completion, then the task, then the activity — never batch. After completing each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" before moving to the next task.

**Before each commit** → run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. Document any undocumented divergence before committing.

**When completing the last activity of this workstream** → compile the Reflection sub-block in "Divergences and notes". Update the frontmatter status to `completed`. Verify that WS-0004 is ready to start.

## Activities, Tasks and Subtasks

### [x] Activity 1: Extend the normalized session model and introduce companion data types

#### [x] Task 1.1: Add `SubagentSession` and `CompactionSummary` types to `src/features/agentSessionsArchiving/markdown/types.ts`

Open `src/features/agentSessionsArchiving/markdown/types.ts`. After the `NormalizedTurn` interface and before the `NormalizedSession` interface, insert the following two interfaces in this order:

```typescript
export interface CompactionSummary {
  readonly summaryText: string;
  readonly timestamp: string;
}

export interface SubagentSession {
  readonly agentId: string;
  readonly agentType: string;
  readonly description?: string;
  readonly turns: readonly NormalizedTurn[];
  readonly compactionSummaries?: readonly CompactionSummary[];
}
```

Both interfaces use `readonly` on all fields. `description` and `compactionSummaries` are optional, following the omission-based pattern established in this project (`exactOptionalPropertyTypes: true` — do not assign `undefined` explicitly). Export both interfaces.

#### [x] Task 1.2: Extend `NormalizedSession` with two optional fields

In the same file (`src/features/agentSessionsArchiving/markdown/types.ts`), locate the `NormalizedSession` interface. After the existing `readonly turns: readonly NormalizedTurn[];` line, add:

```typescript
readonly subagentSessions?: readonly SubagentSession[];
readonly compactionSummaries?: readonly CompactionSummary[];
```

Both fields are optional. Existing code constructing `NormalizedSession` objects — in parser implementations, parser tests, and renderer tests — requires no modification because the new fields are absent by omission.

#### [x] Task 1.3: Create `src/features/agentSessionsArchiving/markdown/companionDataTypes.ts` with the `CompanionDataContext` type

Create a new file at `src/features/agentSessionsArchiving/markdown/companionDataTypes.ts`. The file must define and export the following interfaces:

```typescript
export interface SubagentEntry {
  readonly agentId: string;
  readonly content: string;
  readonly metaContent?: string;
}

export interface CompactionEntry {
  readonly content: string;
  readonly mtime: number;
}

export interface CompanionDataContext {
  readonly subagentEntries: readonly SubagentEntry[];
  readonly toolResultMap: ReadonlyMap<string, string>;
  readonly compactionEntries: readonly CompactionEntry[];
}
```

`SubagentEntry.content` is the raw JSONL string of a subagent transcript. `SubagentEntry.metaContent` is the raw string content of the `.meta.json` file when present; absent by omission otherwise. `CompactionEntry.mtime` is the file modification time in milliseconds (used for chronological ordering). `toolResultMap` keys are tool-result file identifiers (bare filename without extension); values are file content strings.

#### [x] Task 1.4: Run the quality gate to verify backward compatibility

Run `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must exit with code 0. If `check-types` reports errors in any existing parser, renderer, or test file, stop and record the error in "Divergences and notes" before taking any corrective action. The new fields are optional; no existing compilation unit should require changes.

#### [x] Task 1.5: Update impacted documentation

Update the workstream file checkboxes. No other documentation changes are required for this activity — the new interfaces are self-documenting.

#### [x] Task 1.6: Commit changes

Commit `src/features/agentSessionsArchiving/markdown/types.ts`, `src/features/agentSessionsArchiving/markdown/companionDataTypes.ts`, and this workstream file. Use commit message: `feat(agentSessionsArchiving): extend normalized session model and introduce companion data types`.

## Divergences and notes

- **Task 1.4 (quality gate)**: The markdownlint step failed because `.claude/compaction-state/` (a Claude Code system directory gitignored at project root) was not excluded from the markdownlint glob. Added `.claude/**` to both `.markdownlint-cli2.jsonc` ignores and `.markdownlintignore`. This is a pre-existing configuration gap — the `.claude/` directory is already in `.gitignore` but was never excluded from markdownlint. The fix is non-breaking (only adds an exclusion) and does not affect any source logic. **Classification: Codebase drift** — the markdownlint config did not account for Claude Code system artifacts that appear at project root.

### Reflection

**Divergences by category:**

- Codebase drift: 1 (markdownlint config did not exclude the `.claude/` system directory)

**Proposed improvement:** Add a pre-execution verification step to the workstream authoring checklist: verify that the quality gate passes clean on the current branch before beginning implementation tasks. This would surface config gaps (such as the missing `.claude/**` exclusion) as a separate concern rather than mixing them with implementation divergences.

**Assessment:** No systemic issues. The single divergence was an isolated configuration gap unrelated to the workstream's implementation scope. All type contracts were introduced exactly as specified. All existing unit tests (682) passed without modification, confirming backward compatibility.
