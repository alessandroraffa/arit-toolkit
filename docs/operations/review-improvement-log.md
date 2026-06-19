---
title: 'Review improvement log'
---

Append-only record of process improvement entries produced by review gates. Entries are governed by the `improvement-log` skill (`references/log-format.md`). Status transitions (`open` → `applied` | `rejected` | `deferred`) are PM-only.

## Entries

- id: "KZ-2026-05-27-001"
  gate: "pre-implementation"
  artifact_type: "workstream"
  pattern: "Prescribed test setup does not account for the upstream call chain that runs before the unit under test, causing the unit under test to be bypassed at runtime."
  occurrences: 2
  proposed_change: "Workstream authoring must trace the full call chain that precedes each unit-under-test invocation and enumerate every collaborator call (readFile, stat, writeFile, migrate) the upstream chain will consume. The prescribed mock sequence must cover all consumed calls in order before the unit-under-test's own calls."
  target: "skills/workstream-authoring/SKILL.md (instruction-update)"
  owner: "agent-role:artemisia-planner"
  status: "open"
  created: "2026-05-27"

- id: "KZ-2026-05-27-002"
  gate: "pre-implementation"
  artifact_type: "workstream"
  pattern: "Documentation-insertion task prescribes an insertion point and an expected resulting fragment that are mutually inconsistent (insertion-point instruction and post-insertion example place the new line in different positions)."
  occurrences: 1
  proposed_change: "Workstream authoring for documentation-insertion tasks must self-verify by mentally applying the prescribed insertion to the prescribed before-state and comparing the result against the prescribed after-state. If they disagree, fix the prescription before presenting."
  target: "skills/workstream-authoring/SKILL.md (checklist-update)"
  owner: "agent-role:artemisia-planner"
  status: "open"
  created: "2026-05-27"

- id: "KZ-2026-05-27-003"
  gate: "pre-implementation"
  artifact_type: "workstream"
  pattern: "Filesystem-mutating prescribed code uses `vi.fn()` defaults that resolve with `undefined`, which can silently mask cases where a fresh stat probe is expected to indicate file absence but instead reports existence."
  occurrences: 1
  proposed_change: "When prescribing tests against a default mock, the workstream must explicitly state the default resolution behaviour of unmocked calls and identify which calls in the unit-under-test's chain rely on the mock returning a rejection vs a resolution. Defaults must be reset per-test via `vi.clearAllMocks()` in `beforeEach`, and any stat/readFile/writeFile call whose outcome materially affects branching must be explicitly mocked even when the desired behaviour matches the default."
  target: "skills/workstream-authoring/SKILL.md (checklist-update)"
  owner: "agent-role:artemisia-planner"
  status: "open"
  created: "2026-05-27"

- id: "KZ-2026-05-27-004"
  gate: "pre-implementation"
  artifact_type: "workstream"
  pattern: "Prescribed smoke-test sequence relies on `git reset --soft HEAD~1` to undo a trial commit. `git reset` is in the project's prohibited destructive-git-operations list (CLAUDE.md hard rules) regardless of mode; the workstream attempts to justify the call inline rather than escalating to the PM or choosing a non-destructive teardown path."
  occurrences: 1
  proposed_change: "Workstream authoring for hook/migration validation must not prescribe `git reset` (in any mode) without explicit PM authorization gate. Prefer non-destructive teardown: perform the smoke-test on a throwaway branch (`git switch -c smoke/<name>`, commit, `git switch -` and delete the branch with `git branch -D`), or amend the trial commit out of history via PM-authorized procedure recorded as a divergence. The authoring template should list approved hook-validation patterns and forbid the others."
  target: "skills/workstream-authoring/SKILL.md (policy-update)"
  owner: "agent-role:artemisia-planner"
  status: "open"
  created: "2026-05-27"

- id: "KZ-2026-05-27-005"
  gate: "pre-implementation"
  artifact_type: "workstream"
  pattern: "Workstream cites a baseline metric (lint warning count) lifted from an earlier workstream's reflection without re-measuring against the live codebase at authoring time. Subsequent workstreams that altered the metric (here: WS-0015 raising count from 24 to 26) invalidate the cited baseline silently."
  occurrences: 1
  proposed_change: "When a workstream uses a quantitative baseline (warning count, test count, coverage %, audit count) as a pass/fail threshold, the workstream-authoring step must capture the value by running the measurement command at authoring time and cite the command output. Citations of prior-workstream values are not acceptable substitutes."
  target: "skills/workstream-authoring/SKILL.md (checklist-update)"
  owner: "agent-role:artemisia-planner"
  status: "open"
  created: "2026-05-27"

- id: "KZ-2026-05-27-006"
  gate: "pre-implementation"
  artifact_type: "workstream"
  pattern: "Smoke-test files placed under `src/**/*.ts` will be picked up by the project's strict-type-checked ESLint config and by the TypeScript project service. A near-empty placeholder file may fail lint (max-lines, explicit-function-return-type) or trigger projectService 'file not in tsconfig include' errors, causing the smoke test to fail for reasons unrelated to the migration being validated."
  occurrences: 1
  proposed_change: "Hook-validation smoke tests in projects with strict source-tree linting must use a placement that the lint config explicitly ignores (e.g., a path matching the `ignores` glob of `eslint.config.mjs`), or use a minimum content that satisfies the strictest active rules. The authoring step must list and justify the chosen placement."
  target: "skills/workstream-authoring/SKILL.md (checklist-update)"
  owner: "agent-role:artemisia-planner"
  status: "open"
  created: "2026-05-27"

- id: "KZ-2026-06-10-001"
  gate: "pre-implementation"
  artifact_type: "workstream"
  pattern: "A documentation-update task edits one sentence of a multi-sentence passage to reflect a behaviour change, but leaves the surrounding sentences in the same passage (and adjacent passages describing the same mechanism) asserting the old behaviour, producing an internally contradictory doc section. Observed in WS-0020 Task 3.4: only the final sentence of the 'One-shot re-archive on startup' block is rewritten while the preceding mtime:0 sentences and the 'Replacement semantics' lead ordering remain, contradicting the new write-before-delete / real-mtime behaviour."
  occurrences: 1
  proposed_change: "Documentation-update tasks that change a described behaviour must identify the full span of text describing that behaviour (the whole passage plus any adjacent passage that restates the mechanism) and prescribe edits to every affected sentence, not only the single most-obvious one. The authoring step self-verifies by re-reading the entire target sub-section after the prescribed edit and confirming no remaining sentence contradicts the new behaviour."
  target: "skills/workstream-authoring/SKILL.md (checklist-update)"
  owner: "agent-role:artemisia-planner"
  status: "open"
  created: "2026-06-10"

- id: "KZ-2026-06-10-002"
  gate: "pre-implementation"
  artifact_type: "workstream"
  pattern: "A task prescribes new code that consumes a parameter (e.g., `opts`) inside a method whose signature the task does not modify to declare that parameter, and does not prescribe the call-site plumbing that supplies it. The prescribed code would not compile as written. Observed in WS-0020 Task 5.3: the Logger constructor body is told to read `opts?.workspaceFolderName` but no subtask changes the `private constructor()` signature to accept `opts` or forwards `opts` from `getInstance` into `new Logger(opts)`."
  occurrences: 1
  proposed_change: "When a task introduces a parameter consumed by a method body, the task must include explicit subtasks that (a) modify that method's signature to declare the parameter and (b) prescribe every call site that must now pass it. Authoring self-check: trace each newly-referenced identifier to a declaration in scope; if none exists in the prescribed edits, the prescription is incomplete."
  target: "skills/workstream-authoring/SKILL.md (checklist-update)"
  owner: "agent-role:artemisia-planner"
  status: "open"
  created: "2026-06-10"

<!-- Relocated 2026-06-10: gate 2 (rev 2) originally appended KZ-2026-06-10-001/002 to the monorepo-root review-improvement-log.md in error (wrong project ledger). Relocated here and renumbered to -003/-004 (001/002 are taken by gate 1's distinct entries above). Pattern/proposed_change text unchanged. -->

- id: "KZ-2026-06-10-003"
  gate: "pre-implementation"
  artifact_type: "workstream"
  pattern: "When a PASS_WITH_CONDITIONS remediation replaces a previously-reviewed mechanism with a NEW design (e.g., GR-001: full-content self-write comparison replaced by a \_selfWriteCount integer counter) rather than refining the reviewed one, the new design surface is introduced after the only gate that examined the area, so it ships with strictly less review than the mechanism it replaced. The remediation framing ('applied finding GR-001') masks that a genuinely new and unreviewed concurrency primitive was created."
  occurrences: 1
  proposed_change: "Add a review-gate checklist item: 'During a re-review of a remediated artifact, classify each remediation as REFINEMENT (modifies the reviewed mechanism) or NEW-DESIGN (replaces it with a previously-unseen mechanism). NEW-DESIGN remediations receive the same depth of perspective review as a first-gate artifact of equivalent risk — the orchestrator must not treat them as verification-only items. The brief must list NEW-DESIGN remediations separately from REFINEMENT remediations.'"
  target: "skills/review-gate/SKILL.md (checklist-update)"
  owner: "PM"
  status: "open"
  created: "2026-06-10"

- id: "KZ-2026-06-10-004"
  gate: "pre-implementation"
  artifact_type: "workstream"
  pattern: "Counter-based suppression tokens (a self-write counter incremented before a write and decremented by a consuming watcher event) silently assume a 1:1 write-to-event correspondence. They are not robust to event coalescing (VS Code FileSystemWatcher may collapse two rapid writes into a single onDidChange) or to events the watcher never fires (a write that produces an identical-bytes file may not fire onDidChange on some platforms/filesystems). A coalesced or dropped event leaves the counter permanently > 0, which then swallows the NEXT genuine external edit — converting a transient churn bug into a silent missed-reload bug. The workstream prescribes the counter without specifying a reconciliation/decay path or a bound."
  occurrences: 1
  proposed_change: "Add a coding-standards note for VS Code extension features: 'Self-write suppression that pairs a pre-write increment with a post-event decrement must not assume 1:1 write-to-event correspondence. The watcher may coalesce multiple writes into one event or fire zero events for an identical-bytes write. Either (a) reconcile by comparing the just-written content/hash against the reloaded content (content-equality suppression, robust to coalescing) or (b) bound the token with a short time window after which it self-clears, so a dropped event cannot permanently suppress a later genuine external edit. A bare monotonic counter is a defect.'"
  target: "skills/coding-standards/SKILL.md (instruction-update)"
  owner: "agent-role (workstream author)"
  status: "open"
  created: "2026-06-10"

- id: "KZ-2026-06-10-005"
  gate: "pre-implementation"
  artifact_type: "workstream"
  pattern: "When a suppression mechanism uses single-consume (clear-on-match) semantics AND the triggering watcher binds one handler to two or more event channels, prose argument of downstream absorption is insufficient — the workstream must prescribe a regression test firing BOTH events for a single self-write and asserting the downstream idempotency/backstop guard absorbs the second event without re-triggering the suppressed action."
  occurrences: 1
  proposed_change: "Add a review-gate checklist item: 'When a reviewed artifact prescribes a single-consume suppression token (clear-on-match) and the triggering watcher binds one handler to two or more event channels (e.g., onDidChange and onDidCreate), require a regression test that fires BOTH events for a single self-write and asserts the downstream idempotency/backstop guard absorbs the second (now-unsuppressed) event without re-triggering the suppressed action. Prose argument that the downstream guard absorbs the fallthrough is insufficient — the absorption must be exercised by an executable test specifying its full upstream mock chain.'"
  target: "skills/review-gate/SKILL.md (checklist-update)"
  owner: "PM"
  status: "open"
  created: "2026-06-10"

- id: "KZ-2026-06-19-001"
  gate: "pre-release"
  artifact_type: "all"
  pattern: "A change-detection guard compares a value sourced from one file against a value persisted from a different file. In the archiving core, deduplicateAndHydrate seeds lastArchivedMap with the archive OUTPUT file's stat.mtime (archiveService.ts:595-607), while the skip-guard compares it against effectiveMtime = compositeMtime ?? source-mtime (archiveService.ts:203-205) — a source-side value. The two mtimes belong to different files and are only equal by coincidence, so every session re-archives once on each extension restart. The defect predates v2.5.0 (the hydration vs source-mtime mismatch already existed) but v2.5.0 widened the gap by substituting compositeMtime for source-mtime. A cross-file mtime comparison is the root anti-pattern; it survived multiple gates because each gate examined the companion hunks in isolation rather than the end-to-end hydrate→compare→record contract."
  occurrences: 1
  proposed_change: "Add a review-gate checklist item for any change touching a change-detection / cache-invalidation guard: 'Trace the guard end-to-end — the value WRITTEN into the cache (hydration/record path) and the value COMPARED against it (skip path) must be derived from the same source by the same function. A reviewer must confirm both sides reference the same clock/file. When the two values are mtimes, confirm they are mtimes of the same file. A cross-file or cross-clock comparison is a defect even when functionally self-correcting.'"
  target: "skills/review-gate/SKILL.md (checklist-update)"
  owner: "PM"
  status: "open"
  created: "2026-06-19"

- id: "KZ-2026-06-19-002"
  gate: "pre-release"
  artifact*type: "all"
  pattern: "A feature expands a multi-channel FileSystemWatcher (here from 1 glob to 3:*.jsonl, _/subagents/_.jsonl, \_/tool-results/\*) and wires only the onDidChange/onDidCreate channels (sessionFileWatcher.ts:39-44), omitting onDidDelete. Companion artifacts that are DELETED (e.g., subagent JSONL removed by compaction) fire no watched event and do not advance source mtime, so the archived output retains stale companion sections indefinitely with no detection path. This is the deletion-channel analogue of the previously-logged event-coalescing gap (KZ-2026-06-10-004/005): the watcher's event model is assumed complete but a real-world event class is unhandled."
  occurrences: 1
  proposed_change: "Add a coding-standards note for VS Code extension watchers: 'When a feature derives content from a set of files and re-renders on change, the watcher must subscribe to onDidDelete in addition to onDidChange/onDidCreate for every glob whose files can be removed by the upstream tool. Omitting onDidDelete produces stale derived output with no detection path. A multi-channel watcher review must enumerate all three channels per glob and justify any omission.'"
  target: "skills/coding-standards/SKILL.md (instruction-update)"
  owner: "agent-role:efesto-coder"
  status: "open"
  created: "2026-06-19"

- id: "KZ-2026-06-19-003"
  gate: "pre-release"
  artifact_type: "all"
  pattern: "A multi-branch fallback chain (here agentType resolution: meta.agentType → first-event agentId → first-event subagentType → 'unknown') ships with test coverage for only the head and default branches; the intermediate subagentType branch (claudeCodeParserCompanion.ts:75) has no dedicated test. Untested intermediate fallback branches are the most fragile under refactor because they only fire on specific real-world inputs not present in the happy-path fixtures, and a regression that collapses the chain passes every existing test."
  occurrences: 1
  proposed_change: "Add a TDD-workflow checklist item: 'When a function implements a priority/fallback chain of three or more branches (A → B → … → default), every intermediate branch requires a dedicated test asserting it fires for an input that exercises only that branch. Coverage of head + default is insufficient — the StepLedger is not complete until each intermediate branch has a test.'"
  target: "skills/tdd-workflow/SKILL.md (checklist-update)"
  owner: "agent-role:efesto-coder"
  status: "open"
  created: "2026-06-19"
