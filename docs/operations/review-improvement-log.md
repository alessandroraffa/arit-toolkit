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
