---
title: 'Review improvement log'
---

Append-only record of process improvement entries produced by review gates. Entries are governed by the `improvement-log` skill (`references/log-format.md`). Status transitions (`open` → `applied` | `rejected` | `deferred`) are PM-only.

## Entries

- id: "KZ-2026-05-27-001"
  gate: "pre-implementation"
  artifact_type: "workstream"
  pattern: "Prescribed test setup does not account for the upstream call chain that runs before the unit under test, causing the unit under test to be bypassed at runtime."
  occurrences: 1
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
