---
title: 'Review Gate Improvement Log'
description: 'Kaizen process-improvement entries produced by review gates. Append-only. Status transitions are Human-curated.'
---

# Review Gate Improvement Log

This log captures process-level improvements proposed during multi-perspective review gates. Immediate (artifact-level) fixes are reported in the verdict, not here. Entries are append-only; only the `status` field transitions, and only by Human decision.

## Entries

```yaml
- id: KZ-2026-06-21-001
  created: 2026-06-21
  gate: pre-release
  artifact_type: implementation_plan
  status: open
  classification: checklist-update
  pattern: >
    A boolean-returning file-removal helper returned the success sentinel (true)
    from its catch block on delete failure, masking a failed deletion as success
    and producing a false "deleted" user message. All four reviewer perspectives
    independently flagged the same line (extensionStateManager.ts:510). This is a
    recurring "catch block returns the happy-path value" anti-pattern.
  proposed_change: >
    Add a review-gate and StepLedger-authoring checklist item: for any function
    that returns a boolean (or enum) success indicator, audit every catch block to
    confirm it does not return the success sentinel. Removal/move helpers must
    distinguish attempted-but-failed from succeeded (return false or a distinct
    'failed' state), and the caller must derive user-facing messaging from the
    actual result.
  target: skills/review-gate (checklist) and skills/stepledger-authoring
  owner: Human

- id: KZ-2026-06-21-002
  created: 2026-06-21
  gate: pre-release
  artifact_type: implementation_plan
  status: open
  classification: checklist-update
  pattern: >
    In a copy-then-delete relocation, the per-entry mover returned true (success)
    for entries it did NOT copy (non-File, non-YYYY-named directories, symlinks),
    so the aggregate "all copies succeeded" flag stayed true and the source tree
    was deleted recursively — silently destroying any unrecognized entry. The
    "silently succeed without copying" outcome is never valid for an entry a
    move/copy implementation does not handle.
  proposed_change: >
    Add a checklist item for any move/copy-then-delete operation: every possible
    directory-entry type at the source root must be either copied or cause the
    aggregate success flag to become false. Skipping an unrecognized entry while
    reporting success is prohibited when the source is subsequently deleted.
  target: skills/review-gate (checklist) and skills/coding-standards
  owner: Human

- id: KZ-2026-06-21-003
  created: 2026-06-21
  gate: pre-release
  artifact_type: implementation_plan
  status: open
  classification: checklist-update
  pattern: >
    WS-0021 Task 3.1 explicitly listed a required test ("a newly added archiving
    section / new config receives archivePath '.tangyr/agent-sessions'", AC-5),
    the task checkbox was marked complete, yet no such test exists in the committed
    suite. The Reflection self-assessment did not catch the gap because total test
    count increased (1005 to 1029); count growth is not per-scenario traceability.
  proposed_change: >
    Add a StepLedger-authoring checklist item: before closing a Task N.1 test
    checkbox, confirm each enumerated test scenario bullet maps to a matching test
    case in the committed test files. Test-count growth does not substitute for
    per-scenario traceability.
  target: skills/stepledger-authoring and skills/tdd-workflow
  owner: Human

- id: KZ-2026-06-21-004
  created: 2026-06-21
  gate: pre-release
  artifact_type: implementation_plan
  status: open
  classification: checklist-update
  pattern: >
    A spec-mandated SILENT data-move (no confirmation prompt) was implemented with
    log-only signaling on partial failure, leaving stranded files invisible to the
    maintainer across a ~25-install blast radius. "Silent" (no prompt) was conflated
    with "invisible" (no completion/failure notification).
  proposed_change: >
    Add a WS/spec-authoring checklist item: for any irreversible file operation,
    specify how a partial failure is communicated to the user. Log-only is not an
    acceptable failure channel for irreversible file operations across a
    multi-install population; a non-prompt completion/failure notification satisfies
    a "silent move" constraint without hiding failures.
  target: skills/review-gate (checklist) and skills/stepledger-authoring
  owner: Human
```
