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

- id: KZ-2026-06-22-007
  created: 2026-06-22
  gate: pre-implementation
  artifact_type: implementation_plan
  status: open
  classification: checklist-update
  pattern: >
    PLAN-005 deferred resolvable architectural choices to workstream authoring by
    presenting them as open alternatives at plan altitude. Three distinct cases
    appeared: the per-session change-detection fingerprint stated as "time_updated +
    counts OR a content hash" (flagged independently by White, Black, and Orange);
    the materialized-unit serialization "a deterministic serialization" with no named
    format or schema; and the experimental-warning handling stated as "suppress or
    ignore." Each unresolved choice is a plan-altitude instance of the "ambiguity does
    not flow downstream" principle: the plan is the level that must resolve structural
    trade-offs, yet these were pushed into execution. An "OR" between two strategies
    with different cost/correctness profiles is the tell.
  proposed_change: >
    Add a plan review-gate (and plan-authoring) checklist item: scan every
    Architectural-decision line for an unresolved alternative — an "OR" / "either…or"
    between two mechanisms, a "deterministic serialization" / "some format" with no
    named schema, or a "decided at workstream authoring" deferral. Each must be
    resolved to a single stated choice with rationale before the plan exits draft.
    An unresolved structural alternative is a blocking finding at pre-implementation
    review, not a workstream-altitude detail.
  target: skills/review-gate (checklist) and skills/plan-authoring-protocol
  owner: Human

- id: KZ-2026-06-22-008
  created: 2026-06-22
  gate: pre-implementation
  artifact_type: implementation_plan
  status: open
  classification: checklist-update
  pattern: >
    PLAN-005 splits production across increments owned by potentially separate
    workstreams (foundation increments 1–2 produce the materialized session
    serialization; provider-completion increments 3–4 build the parser that
    re-parses it), yet the wire format that couples the two halves — the field
    names, JSON shape, ordering semantics, null handling — was left unspecified in
    the plan. Green and Orange independently identified this implicit provider->parser
    contract as the largest cross-increment coupling point and as a silent integration
    bug waiting to surface only when the parser first consumes the content. A plan
    that hands the two ends of one internal data contract to two different workstreams
    must fix that contract at plan altitude.
  proposed_change: >
    Add a plan review-gate (and plan-authoring) checklist item: whenever a plan's
    increments split the producer and the consumer of an internal data format across
    different increments/workstreams, the plan must specify that format's schema (named
    serialization, top-level envelope, field names, ordering guarantees) at plan
    altitude — not defer it to either workstream. An internal cross-workstream contract
    described only by a property ("deterministic", "self-contained") and not by a schema
    is incomplete.
  target: skills/review-gate (checklist) and skills/plan-authoring-protocol
  owner: Human

- id: KZ-2026-06-22-009
  created: 2026-06-22
  gate: pre-implementation
  artifact_type: implementation_plan
  status: open
  classification: checklist-update
  pattern: >
    PLAN-005 cited an empirical smoke-check (node:sqlite {readonly:true} returned
    WAL-correct counts 11/52 against the real store) as the evidence clearing the
    SPEC-003 §6 mechanism gate, but treated the single validated fact as if it
    validated the whole mechanism. Black and White independently surfaced claims that
    rode along as "verified" without being part of what the smoke-check actually
    tested: read-only WAL behavior with respect to the -shm/-wal sidecars and AC-7
    byte-unchanged guarantee; the tool-part JSON field path (state.input/state.output);
    and the Windows default store path. Counts matching is necessary but not sufficient
    evidence for "read-only, journal-correct, byte-unchanged, schema-faithful." A plan
    that leans on an empirical probe must enumerate the probe's scope so reviewers can
    separate verified facts from assumptions inheriting the probe's credibility.
  proposed_change: >
    Add a plan review-gate (and plan-authoring) checklist item: when a plan cites an
    empirical probe/smoke-check as evidence for a constraint or acceptance criterion,
    require an explicit "verified / not verified by this probe" enumeration — what the
    probe measured (e.g., row counts), and which adjacent claims it did NOT establish
    (e.g., sidecar mutation / byte-unchanged, inner JSON field paths, platform-specific
    paths). Adjacent schema-field-path and platform-path claims must each carry their
    own verification source or a to-be-verified-in-which-increment annotation rather
    than inheriting the probe's credibility.
  target: skills/review-gate (checklist) and skills/plan-authoring-protocol
  owner: Human

- id: KZ-2026-06-22-010
  created: 2026-06-22
  gate: pre-implementation
  artifact_type: implementation_plan
  status: open
  classification: checklist-update
  pattern: >
    On the PLAN-005 verification pass, the prior condition "name the internal
    producer/consumer contract" (C7, derived from KZ-2026-06-22-008) was satisfied
    at the envelope level — the plan named a schemaVersion'd JSON document — yet the
    contract was still incomplete: two sub-objects the consumer (§4 parser) reads by
    name were left as placeholders in the producer's schema (session.summary as
    {"...":0} with no named fields and no time_compacting; subagents[].session as
    {} while the parser reads child id/agent/title). A contract can pass "is it
    named?" and still fail "is every consumed field named on both ends?". Separately,
    the revision's new skip-when-readContent guard (C6 resolution) introduced an
    unspecified accessor-throw path: the plan defined the absent-resource and
    store-level failure scopes but not what happens when the per-session readContent()
    accessor itself throws — a silent-session-drop or whole-cycle-abort risk that the
    "named the mechanism" check does not surface. Both are the same meta-pattern: a
    remediation that names a structure or a happy/absent path without enumerating the
    structure's full field set or the mechanism's exception path.
  proposed_change: >
    Add a plan review-gate (and plan-authoring) checklist item with two parts:
    (a) contract field-level self-consistency — for every internal data contract, each
    field the consuming section references by name must appear by name in the producing
    section's schema, and vice versa; a placeholder ({}, "...", or "etc.") for any
    consumed sub-object fails the check; (b) accessor exception path — whenever a plan
    introduces a deferred content accessor or a skip/guard around a fallible call, the
    plan must specify the accessor's throw behaviour (isolation scope, log level, and
    whether it propagates), not only its absent-resource behaviour.
  target: skills/review-gate (checklist) and skills/plan-authoring-protocol
  owner: Human
```
