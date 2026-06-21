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

- id: KZ-2026-06-22-001
  created: 2026-06-22
  gate: pre-implementation
  artifact_type: specification
  status: open
  classification: checklist-update
  pattern: >
    SPEC-003 introduces the first provider that reads from a SHARED store (one
    SQLite DB holding all workspaces' sessions) rather than one flat file per
    session. All four reviewers independently flagged failure modes that are unique
    to a shared store and that the single-file provider template never had to
    address: (1) the raw-copy fallback copies the WHOLE shared DB — a cross-workspace
    data leak plus a corrupt WAL-less copy; (2) the read-only-vs-consistency tension
    of a live WAL DB (the -wal/-shm sidecars are never named in the spec); (3)
    change-detection churn — keying on the shared DB/WAL mtime re-archives this
    workspace whenever ANY other workspace writes; (4) a workspace-matching bug now
    leaks foreign sessions into a git-tracked archive instead of merely picking a
    wrong local file. These are not OpenCode-specific — they recur for any future
    shared-store provider.
  proposed_change: >
    Add a "Shared-store provider" checklist to the specification review gate (and to
    spec authoring): when a provider reads from a store shared across workspaces,
    require the spec to (a) state whether the per-session raw-copy fallback applies
    and exclude it when no per-session boundary exists; (b) name any journal/sidecar
    files and the required read property (committed-state visibility, no exclusive
    lock, no checkpoint); (c) bound BOTH change-detection failure modes — missed
    updates AND cross-workspace churn — with a per-session/per-workspace fingerprint;
    (d) elevate workspace-matching to enumerate path-normalization edge cases and add
    a positive cross-workspace isolation acceptance criterion.
  target: skills/review-gate (checklist) and skills/authoring-standards
  owner: Human

- id: KZ-2026-06-22-002
  created: 2026-06-22
  gate: pre-implementation
  artifact_type: specification
  status: open
  classification: checklist-update
  pattern: >
    SPEC-003 has functional requirements with no matching acceptance criterion
    (compaction mapping, auto-discovery, per-session parse isolation) and an
    acceptance criterion set that tests only the positive path of change detection
    (an update re-archives) while leaving the negative property (unrelated activity
    does NOT re-archive) untested. Reviewers across White, Green, and Orange all
    surfaced unmatched FR-to-AC pairs. A test suite derived from the ACs would silently
    omit these behaviors.
  proposed_change: >
    Add a specification review-gate checklist item: every functional requirement must
    map to at least one acceptance criterion, and every "reliably detect / must not"
    style requirement must have BOTH a positive criterion (the wanted change is
    detected) and a negative criterion (the unwanted trigger does not fire). Flag any
    functional requirement with no corresponding acceptance criterion before approval.
  target: skills/review-gate (checklist) and skills/authoring-standards
  owner: Human

- id: KZ-2026-06-22-003
  created: 2026-06-22
  gate: pre-implementation
  artifact_type: specification
  status: open
  classification: checklist-update
  pattern: >
    SPEC-003 maps a new provider onto an existing normalized-model structure
    (SubagentSession, CompactionSummary, the enriched-turn fields) by reference only —
    "consistent with SPEC-002" — without a concrete source-to-field mapping table.
    The referenced structure (SubagentSession{agentId, agentType, description}) was
    designed for Claude Code's file-based .meta.json shape; OpenCode's child-session
    rows have a different shape (session.id, session.agent, session.title) and epoch
    timestamps with unspecified unit/timezone. The "consistent with X" reference left
    three required fields and the timestamp conversion without a defined source,
    flagged independently by White and Green.
  proposed_change: >
    Add a specification authoring/review checklist item: when a provider spec reuses
    an existing normalized-model structure, require an explicit source-to-field mapping
    table (source column/field -> normalized field, with the fallback value when the
    source is null and the unit/timezone for any time conversion). A bare "consistent
    with <prior spec>" reference is not a verifiable mapping rule when the source schema
    differs from the one the prior spec was written against.
  target: skills/review-gate (checklist) and skills/authoring-standards
  owner: Human

- id: KZ-2026-06-22-004
  created: 2026-06-22
  gate: pre-implementation
  artifact_type: specification
  status: open
  classification: checklist-update
  pattern: >
    On the SPEC-003 verification pass (after the prior 8 blocking conditions were
    resolved), Black and Orange independently surfaced the same residual gap class:
    when a provider supports an environment-variable store-location override
    (OPENCODE_DB) alongside a default-directory discovery rule that enumerates
    supplementary file patterns (per-channel opencode-<channel>.db variants), the
    spec said the override "takes precedence over the default location" but did not
    state (a) whether the supplementary patterns are also enumerated at the override
    path or suppressed, (b) the behavior when the override points to a non-existent
    path (silent no-op vs. error), or (c) the behavior when the override points to an
    out-of-scope store. The override edge cases were left to be inferred. This is the
    same class of ambiguity that any env-var-overridable discovery rule will reproduce,
    not OpenCode-specific, and it is exactly the kind of gap that survives a first
    review and only surfaces on the verification pass.
  proposed_change: >
    Add a discovery-section checklist item for the specification review gate (and spec
    authoring): when a provider exposes an environment-variable store-location override,
    the spec must explicitly state (a) exclusivity — whether supplementary file patterns
    are still enumerated at the override path or suppressed; (b) the non-existent-path
    behavior, routed to the same absent-store no-op the default path uses; and (c) the
    out-of-scope-store behavior, routed to the same detect-and-signal path the default
    path uses. "Takes precedence" without these three dispositions is an incomplete
    override specification.
  target: skills/review-gate (checklist) and skills/authoring-standards
  owner: Human

- id: KZ-2026-06-22-005
  created: 2026-06-22
  gate: pre-approval
  artifact_type: initiative
  status: open
  classification: checklist-update
  pattern: >
    When an INITIATIVE is authored AFTER its governing specification is already
    approved (INIT-005 written after SPEC-003 PASSed), the initiative tends to
    inherit the spec's mechanism vocabulary instead of staying at strategic
    altitude. INIT-005 carried specific implementation/data-model terms into its
    Scope and Success-criteria sections — "XDG data directory", "message/parts
    session structure", "parts-based structure", "journaled store", "reads one
    flat file as a string", "a DB reader" — each of which belongs in the spec, not
    the initiative. Green flagged these as altitude leaks; White and Orange
    independently noted the same sections paraphrase the spec's ACs. Spec-first,
    initiative-second authoring order is the structural cause: the easiest source
    text to compress is the approved spec, so spec terminology bleeds upward.
  proposed_change: >
    Add an initiative review-gate checklist item for the spec-already-approved
    case: scan every Scope and Success-criteria line for mechanism vocabulary
    (filesystem-standard names like XDG, storage-engine names like SQLite/WAL,
    internal data-model terms, exact env-var names, and "reads/writes X as Y"
    pipeline-internal phrasing). Any such term must be replaced with
    behavior/value framing and the mechanism detail left to the governing spec
    (cross-referenced, not restated). The trigger is structural — apply it
    whenever the initiative post-dates its governing spec.
  target: skills/review-gate (checklist) and skills/authoring-standards
  owner: Human

- id: KZ-2026-06-22-006
  created: 2026-06-22
  gate: pre-approval
  artifact_type: initiative
  status: open
  classification: checklist-update
  pattern: >
    On INIT-005 the reviewers split on the same Scope-Included and Success-criteria
    text: Green judged the sections to RESTATE the spec and wanted them reduced/
    abstracted; White wanted them EXPANDED (a missing failure-isolation criterion;
    an absent-store/out-of-scope scope-to-criterion asymmetry). The conflict is not
    a defect in either reviewer but a missing shared rule for what an initiative's
    Scope and Success-criteria sections are FOR relative to the governing spec:
    bounding-and-tracing (each scope item has >=1 success criterion and vice versa;
    each criterion is a strategic OUTCOME that traces to — but does not duplicate —
    a spec AC) versus mirroring-the-spec. Absent that rule, "reduce" and "expand"
    are both locally reasonable and the gate cannot converge without escalation.
  proposed_change: >
    Add an initiative authoring/review rule defining the Scope/Success-criteria
    contract: (a) every Scope-Included item maps to at least one success criterion
    and every success criterion traces to at least one Scope-Included item
    (catches asymmetries like absent-store-in-criteria-but-not-scope and
    isolation-in-scope-but-not-criteria); (b) each success criterion is phrased as
    a strategic OUTCOME that references — never paraphrases — a governing-spec
    acceptance criterion. This gives reviewers a single altitude standard so
    "reduce vs expand" disagreements resolve against the rule rather than escalating.
  target: skills/review-gate (checklist) and skills/authoring-standards
  owner: Human
```
