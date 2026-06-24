---
title: 'Review Gate Improvement Log'
description: 'Kaizen process-improvement entries produced by review gates. Append-only. Status transitions are Human-curated.'
---

# Review Gate Improvement Log

This log captures process-level improvements proposed during multi-perspective review gates. Immediate (artifact-level) fixes are reported in the verdict, not here. Entries are append-only; only the `status` field transitions, and only by Human decision.

## Entries

````yaml
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

- id: KZ-2026-06-22-011
  created: 2026-06-22
  gate: pre-implementation
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    WS-0022 (the OpenCode workstream) carried unresolved either/or choices into
    executable task text that a coder must settle before writing code: a literal
    "call getSessionRows(db, ???)" placeholder immediately superseded by a
    full-table-scan instruction (Task 1.4); "readContent opens the DB fresh (or uses
    a stored reference)" (Task 2.3); the reasoning-part field path "$.content or
    $.text as confirmed by … inspection" (Task 3.1); and two "add to file X (or a
    sibling file if it would exceed 400 lines)" conditional-placement clauses. All
    four reviewers independently flagged the same cluster. The structural cause is
    named in the artifact metadata: the author's final self-report (the draft-review
    self-check that surfaces assumptions) was lost to a connection error, so the
    either/or markers were never resolved before the workstream was presented at the
    gate. A "???" placeholder or an unbracketed "(or X)" in an executable task is the
    machine-detectable tell of an unresolved coder decision — exactly the ambiguity
    that "ambiguity does not flow downstream" forbids at StepLedger altitude.
  proposed_change: >
    Add a stepledger-authoring and review-gate lint rule: an executable task
    description must contain no unresolved placeholder tokens ("???", "TBD", "TODO"
    inside an instruction) and no unresolved choice fork ("X or Y", "either … or",
    "fresh OR stored", conditional file placement) in its implementation steps. Each
    such fork must be resolved to a single stated choice before status transitions
    from draft to idle. When a value genuinely requires runtime discovery (e.g. a
    JSON field name only confirmable against a live fixture), it must be encoded as a
    named discovery subtask whose recorded finding a later task references by name —
    not as an inline either/or the downstream coder is left to pick.
  target: skills/stepledger-authoring and skills/review-gate (checklist)
  owner: Human

- id: KZ-2026-06-22-012
  created: 2026-06-22
  gate: pre-implementation
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    WS-0022 Task 4.5's AC-1..13 self-audit attributed several acceptance criteria to
    a test that verifies a DIFFERENT property than the AC requires. AC-7 ("store files
    byte-unchanged after a cycle") was mapped to "the smoke-check in Task 1.1 asserting
    the DB handle is read-only," but the Task 1.1 smoke-check asserts SNAPSHOT
    ISOLATION (a concurrent insert is not visible mid-transaction), not write-absence
    or byte-unchanged files; no task asserts byte-unchanged or that a write on the
    read-only handle throws. AC-11 was mapped to "renderer.test.ts" when the actual
    compaction-rendering tests live in renderer.companion.test.ts. This is the
    KZ-2026-06-21-003 pattern (marked-complete checkbox with no matching test) in its
    attribution variant: a real, passing test is cited as evidence for an AC whose
    property it does not establish, and the AC-to-test mapping names a property
    ("read-only") or a file ("renderer.test.ts") that does not match what was actually
    written. The governing plan (PLAN-005 §1) even named the byte-unchanged assertion
    that the workstream's task then omitted — an assertion-drift from plan to ledger.
  proposed_change: >
    Add a stepledger-authoring and review-gate checklist item: in the final AC-coverage
    self-audit, each acceptance criterion must cite a specific named test (or named
    test description) AND the cited test's asserted property must be the AC's property,
    not an adjacent one. "Read-only open" does not establish "byte-unchanged";
    "snapshot isolation" does not establish "WAL-committed-data-visible" without a
    fixture that commits before the read. Separately, when the governing plan names a
    concrete assertion (e.g. "the smoke-check asserts the triplet is byte-unchanged"),
    the workstream must carry that exact assertion into a task, not paraphrase it into
    a weaker construction guarantee.
  target: skills/stepledger-authoring and skills/tdd-workflow
  owner: Human

- id: KZ-2026-06-22-013
  created: 2026-06-22
  gate: pre-implementation
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    WS-0022 depends on a build/test-runtime fact that is asserted in prose but encoded
    nowhere: line 43 states "node:sqlite is available on Node 22.22 without an explicit
    --experimental-sqlite flag," yet vitest.config.ts and test/unit/setup.ts contain
    no execArgv, no NODE_OPTIONS, and no flag, and the governing plan (PLAN-005) marks
    extension-host node:sqlite availability as TBV. The workstream promotes a
    plan-level TBV item to a settled prose fact and makes the entire test suite
    (fixture DBs built via real node:sqlite, provider tests forbidden from mocking it)
    depend on that unverified assumption. node:sqlite was flag-gated on Node 22.x
    before a later 22.x minor; if the nvm-resolved binary precedes that minor, every
    adapter/provider/parser test file fails to import. This is the
    KZ-2026-06-22-009 empirical-probe-scope pattern at the runtime-prerequisite level:
    a load-bearing environmental precondition stated as fact without a mechanical
    safeguard (a flag in pool execArgv, a .nvmrc floor, or a version assertion that
    fails fast with a clear message).
  proposed_change: >
    Add a stepledger-authoring and review-gate checklist item: any executable workstream
    whose tests depend on an experimental or version-gated runtime capability must
    ENCODE the precondition mechanically (a test-runner flag in config, a pinned
    runtime floor, or a fail-fast version assertion with a remediation message) rather
    than asserting it in prose — and the encoding must be idempotent across the
    supported runtime range. A claim that a capability "is available without a flag" is
    insufficient unless either the flag is set anyway (a harmless no-op when unneeded)
    or a version floor is pinned and checked.
  target: skills/stepledger-authoring and skills/review-gate (checklist)
  owner: Human

- id: KZ-2026-06-22-014
  created: 2026-06-22
  gate: pre-release
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    On the WS-0022 implementation gate, a shipped source-code header comment in two
    files (openCodeAdapter.ts and openCodeProvider.ts) asserted the OPPOSITE of what
    the committed test proves and what the divergence log records: the comment said
    "readOnly: true does NOT enforce SQL-level read-only on exec — writes go to an
    in-memory overlay," while the committed adapter test asserts exec INSERT throws
    AND the DB file is byte-unchanged, and DIV-001 records the same throw behavior.
    The comment was the stale PLAN-005 hypothesis (later corrected by DIV-001) carried
    forward into the data-safety rationale for AC-7. Both White and Black independently
    flagged the same two lines. A code comment that makes a load-bearing data-safety
    claim ("DB file byte-unchanged", "writes go to an overlay") is not covered by the
    test suite — only the behavior is — so a stale or wrong safety comment ships
    silently and misleads the next maintainer/auditor about the actual guarantee.
  proposed_change: >
    Add a review-gate and coding-standards checklist item: when a code comment states
    a data-safety or correctness GUARANTEE (read-only enforcement, byte-unchanged,
    no-write, idempotence), the cited mechanism in the comment must match what a named
    test actually asserts. During review, diff every safety-claim comment against the
    test that proves the claim and against the divergence log; a comment that names a
    mechanism the test contradicts (e.g. "in-memory overlay" vs a test asserting the
    write throws) is a blocking factual-accuracy defect even when the runtime behavior
    is correct, because the shipped artifact lies about WHY it is safe.
  target: skills/review-gate (checklist) and skills/coding-standards
  owner: Human

- id: KZ-2026-06-22-015
  created: 2026-06-22
  gate: pre-release
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    WS-0022 silently dropped a spec-required normalized-model field in the new
    provider's parser. SPEC-003 §NMM item 7 (and SPEC-001) require populating the
    optional enriched agentName field where the source supplies it; the OpenCode
    session row carries an agent value that materializes into the §3 document's
    session.agent, the normalized turn model declares agentName, the renderer USES
    it ("Agent(<name>)"), and the Claude Code parser populates it — yet the
    OpenCodeParser never sets agentName on any turn, and no test checks it. WS-0022
    Task 3.2 even listed "agentName: parsed.session.agent ?? undefined" as a turn
    field; it was specified and then not implemented, with no test to catch the
    omission. This is the AC/test-attribution-drift family (KZ-2026-06-21-003,
    KZ-2026-06-22-012) at the field level: an optional-but-required field is dropped
    and the suite stays green because no AC was written for the field and no test
    asserts it on the new provider's output.
  proposed_change: >
    Add a stepledger-authoring and review-gate checklist item for any new provider/
    parser that maps onto a shared normalized model: enumerate every field the shared
    model and renderer CONSUME (including optional enriched fields like agentName,
    timestamp, thinking) and require a per-field assertion in the new parser's tests
    that the field is populated when the source supplies it. A field that the renderer
    reads but the new parser never writes is a silent value-degradation that test-count
    growth and positive-path AC tests will not surface; cross-check the new parser
    against a reference parser (e.g. the Claude Code parser) for field-population parity.
  target: skills/review-gate (checklist) and skills/stepledger-authoring
  owner: Human

- id: KZ-2026-06-22-016
  created: 2026-06-22
  gate: pre-release
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    On WS-0022 all four reviewers (Green, Black, Orange) independently flagged that the
    provider's change-detection watch set is NARROWER than its discovery set: resolveStores
    enumerates every store file matching /^opencode(-[a-z0-9]+)?\.db$/i (the default plus
    per-channel opencode-<channel>.db variants) and OPENCODE_DB may name an arbitrary file,
    but getWatchPatterns hardcodes the globs "opencode.db"/"opencode.db-wal". A user on a
    non-default channel, or with a custom OPENCODE_DB filename, has their sessions DISCOVERED
    and archived on interval but never gets a watch-triggered re-archive on change — silently
    violating the change-detection acceptance criterion only for the non-default subset, which
    the default-path tests never exercise. The structural tell is a provider that exposes a
    discovery pattern/override for inputs and a separate, hardcoded watch pattern for the same
    inputs, with the two sets allowed to diverge.
  proposed_change: >
    Add a provider-authoring and review-gate checklist item: whenever a provider both
    DISCOVERS source files via a pattern/override and WATCHES source files for change
    detection, the watch pattern set must cover every file the discovery set can return
    (derive the watch globs from the same pattern/override, not a hardcoded subset). Require
    a test that a non-default discovered input (a channel variant, an env-override filename)
    produces a matching watch pattern. A watch set narrower than the discovery set is a
    change-detection gap for exactly the inputs the happy-path test does not cover.
  target: skills/review-gate (checklist) and skills/coding-standards
  owner: Human

- id: KZ-2026-06-22-017
  created: 2026-06-22
  gate: pre-release
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    The discovery-set / watch-set alignment defect recurs in BOTH directions across
    two consecutive gates on the same provider. The prior gate (KZ-2026-06-22-016)
    caught a watch set NARROWER than discovery — a missed-change bug. The fix
    over-corrected to a wildcard watch glob ('opencode*.db') that is now BROADER than
    the discovery regex (/^opencode(-[a-z0-9]+)?\.db$/i): a file like
    opencode-backup.db.bak matches the glob but not the discovery filter, firing a
    spurious findSessions() rescan that resolves to nothing. Neither direction is
    catastrophic, but the pair shows that "watch covers discovery" and "watch equals
    discovery" are different properties — a one-directional checklist item ("watch must
    cover discovery") permits the broader-than-discovery drift the remediation then
    introduced, and no test asserts the negative (a near-miss filename does NOT match
    the watch glob).
  proposed_change: >
    Strengthen the discovery/watch alignment checklist item (KZ-2026-06-22-016) to be
    bidirectional: the watch pattern set must be EQUIVALENT to the discovery set, not
    merely a superset — every file the watch glob matches must also be a file the
    discovery filter would accept, and vice versa. When a watch mechanism can only
    express a wildcard while discovery uses a stricter regex, require either (a) the
    watch globs decomposed to mirror the regex alternation (e.g. 'name.db' +
    'name-*.db' rather than 'name*.db'), or (b) an explicit comment documenting the
    intentional over-broadness plus a re-validation of the matched candidate inside the
    triggered scan. Require a negative test: a near-miss filename (name.db.bak,
    name.tmp) must NOT match the watch glob.
  target: skills/review-gate (checklist) and skills/coding-standards
  owner: Human

- id: KZ-2026-06-22-018
  created: 2026-06-22
  gate: pre-release
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    The provider routes a thrown store-open error to either a SILENT no-op (absent
    store) or a USER-VISIBLE Tier-2 warning (present-but-unopenable) by substring-
    matching the stringified error message (isAbsentStoreError: String(err).includes
    ('enoent') || includes('no such file or directory')). The visibility of a real
    failure to the user therefore hinges on the exact wording an underlying binding
    (node:sqlite / libsqlite SQLITE_CANTOPEN) chooses on each platform. A
    permission-denied store whose message happens to contain 'no such file or
    directory' would be wrongly silenced (a present-but-inaccessible store rendered
    invisible); a genuinely-absent store whose message matches neither token would
    raise a spurious warning. The committed tests assert only the two nominal wordings
    (an 'ENOENT' throw and a 'SQLITE_CANTOPEN: unable to open database file' throw) and
    never exercise the EACCES/EPERM ambiguity. String-matching an error to decide
    user-facing visibility is fragile precisely where it matters — the boundary
    between a silenced absence and a surfaced failure.
  proposed_change: >
    Add a review-gate and coding-standards checklist item: when an error is classified
    to decide user-facing visibility (silent vs notify) or control flow, branch on the
    structured error CODE first (Node ErrnoException .code === 'ENOENT' / 'EACCES' /
    'EPERM', or the binding's typed error/errno) and treat raw message substring-
    matching only as a last-resort fallback. The classifier must be tested for each
    decision branch with the platform-representative error shape, including the
    adversarial near-miss (a non-absent failure whose message contains the absent-store
    token, and an absent store whose message contains neither), not only the two happy
    wordings.
  target: skills/review-gate (checklist) and skills/coding-standards
  owner: Human

- id: KZ-2026-06-22-019
  created: 2026-06-22
  gate: pre-approval
  artifact_type: specification
  status: open
  classification: checklist-update
  pattern: >
    SPEC-004 specifies a rank-based ordering with two distinct tie/equality layers
    that need separate resolution rules, and the first review pass + remediation only
    closed ONE of them. The author correctly fixed the aggregate-score tie-break
    (equal average-rank scores -> alphabetical by canonical name, ascending; WT-001
    from the prior gate) and explicitly claimed the order is "fixed at the
    specification level" and "independent of input or iteration arrangement" (AC2).
    But the WITHIN-SIGNAL raw-value tie — what rank two targets receive when they have
    EQUAL raw values on a single signal, BEFORE the per-signal ranks are averaged — was
    left unspecified (FR Aggregation model item 2). Standard/dense/ordinal ranking
    conventions assign different per-signal ranks for tied raw values, producing
    different average-rank scores and a different final order, which falsifies the
    reproducibility guarantees in FR Aggregation model item 5, AC3, and AC5 and the
    input-order-independence claim in AC2. This is the KZ-2026-06-22-004 family
    (override/edge dispositions survive the first review and surface on the
    verification pass) applied to ranking: the SALIENT tie-break (post-aggregation)
    was specified while the LESS-salient tie (within-signal, pre-aggregation) was
    missed, even though both must be fixed for the order to be deterministic.
  occurrences: 1
  proposed_change: >
    Add a review-gate (and authoring-standards) checklist item for any ranking- or
    ordering-based specification: enumerate EVERY layer at which a tie or equality can
    arise and require a stated resolution rule for each. For a rank-then-aggregate
    model that means (a) within-signal raw-value ties (which named ranking convention —
    dense, standard-competition, ordinal — and therefore whether input order can leak
    in), AND (b) post-aggregation score ties (the final tie-break). A spec that fixes
    only the final tie-break while leaving the within-signal tie unspecified has an
    under-determined order and a false reproducibility claim, even though it reads as
    complete. Cross-check every "same data always yields the same order / independent
    of input arrangement" claim against the fully-specified tie ladder.
  target: skills/review-gate (checklist) and skills/authoring-standards
  owner: Human

- id: KZ-2026-06-22-020
  created: 2026-06-22
  gate: pre-approval
  artifact_type: specification
  status: open
  classification: checklist-update
  pattern: >
    SPEC-004's rank-based aggregation asserts a property about its own scoring method
    that is true on one axis and false on another, and presents it as fully solved:
    "Averaging the ranks ... makes the score cardinality-neutral: a target with fewer
    available signals is neither penalized nor rewarded" (FR Aggregation model item 3)
    and "no per-signal normalization step is required" (item 4). Averaging IS neutral
    with respect to signal COUNT (how many signals a target possesses), but it is NOT
    neutral with respect to signal POOL SIZE (how many targets compete in each signal's
    ranking): rank 1-of-2 and rank 1-of-8 are both recorded as "1" and contribute
    identically to the average, so a narrow target that wins a thinly-possessed signal
    can outrank a broadly-strong target — undermining the spec's own stated reader value
    ("most-recognizable/most-used first"). Three reviewers (Black, Green, Orange)
    independently flagged the same evidence location while splitting on severity (false
    correctness claim vs. imprecise wording vs. value-integrity trade-off). The model
    itself is the simplest construction satisfying scale-invariance + missing-surface
    tolerance (no concretely simpler alternative survives Green's check), so the defect
    is the OVERSTATED neutrality CLAIM, not the model. A specification that states a
    false/overbroad property about its own algorithm is a factual defect even when the
    algorithm is the right choice.
  occurrences: 1
  proposed_change: >
    Add a review-gate (and authoring-standards) checklist item: any specification that
    claims a normalization, neutrality, invariance, or fairness PROPERTY of its own
    scoring/aggregation method must state precisely which dimension the property holds
    on and which dimension(s) it does NOT, and must explicitly disposition the
    non-neutral dimension (accepted trade-off with rationale, or deferred to the plan
    gate for evaluation). For rank-based aggregation specifically, distinguish
    signal-COUNT neutrality (averaging delivers it) from signal-POOL-SIZE comparability
    (averaging does NOT deliver it — rank 1-of-2 != rank 1-of-8) and require the spec to
    confirm the produced order is consistent with the stated user-value promise under
    the non-neutral dimension.
  target: skills/review-gate (checklist) and skills/authoring-standards
  owner: Human

- id: KZ-2026-06-23-001
  created: 2026-06-23
  gate: pre-implementation
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    WS-0023 specifies a build-time tool that writes into a delimited README region
    (replace-between `<!-- POPULARITY-ORDER:START/END -->`) and a consistency test
    that parses inside those delimiters, but no task creates the delimiters or performs
    the one-time prose restructuring the governing plan (PLAN-006 Decision 5) explicitly
    accepted ("consolidating the currently-scattered order-bearing prose into one
    contiguous region"). The real README.md has no such markers (verified by grep) and
    its order-bearing prose is scattered across at least three locations (intro
    enumeration, a "from 5 assistants" count claim, the table) plus a second
    "Why Tangyr Workbench" enumeration that names only five. Two consequences both
    survive a green test suite: (1) the first tool run has no anchor to target, so the
    generated region is never produced; (2) every enumeration/count claim OUTSIDE the
    single generated region is neither regenerated nor checked by the in-region
    consistency test, so an acceptance criterion requiring "every prose enumeration and
    every count claim names all eight and reports eight" (AC9) is unmet for the
    out-of-region copies and undetected. The structural tell is a generator/consistency
    pair that assumes a single contiguous region the StepLedger never establishes, while
    equivalent content lives in additional un-anchored locations.
  proposed_change: >
    Add a stepledger-authoring and review-gate checklist item for any "regenerate a
    delimited region + assert consistency inside it" mechanism: (a) require an explicit
    one-time bootstrap task that inserts the delimiters and performs the prose
    consolidation BEFORE the first generator run, committed ahead of the generate step;
    and (b) require an inventory pass over the real target document for EVERY semantically
    equivalent occurrence (enumerations, count claims) and a disposition for each — moved
    inside the region, converted to a checked static value, or covered by an
    out-of-region assertion. A generated-region design is incomplete until both the
    region's creation and every out-of-region duplicate are assigned to a task.
  target: skills/review-gate (checklist) and skills/stepledger-authoring
  owner: Human

- id: KZ-2026-06-23-002
  created: 2026-06-23
  gate: pre-implementation
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    WS-0023's order-sensitivity audit (SPEC-004 Constraint 9 / AC18) is bounded to a
    static search of "archiveService.ts lines 1–150" and a swap-invariance test whose
    stub providers return sessions with disjoint archiveName namespaces
    ('cline-task-001' vs 'roo-code-task-001'). Both miss the only genuinely
    order-sensitive path, which sits OUTSIDE the searched range: archiveSession()
    (lines 221–280) reads lastArchivedMap.get(session.archiveName) and, at lines
    245–248, deletes a prior provider's archive when entry.archiveFileName differs for a
    SHARED archiveName key — a collision whose outcome depends on provider iteration
    order. Because the test's stub archiveNames never collide, the assertion
    expect(setA).toEqual(setB) is vacuously true under any implementation; the audit's
    line-range stops before archiveFromProviders() (line 187) and archiveSession() (line
    221). This is the KZ-2026-06-22-012 attribution-drift family at the audit-scope
    level: a real test and a real static search are cited as proving AC18, but their
    scope excludes the exact path the AC exists to protect, so the gate can pass while
    the order-sensitive branch is unexamined.
  proposed_change: >
    Add a review-gate and stepledger-authoring checklist item: an order-sensitivity /
    invariance audit must (a) state its static-search scope as whole-file-or-named-method
    coverage and explicitly include the methods that mutate the shared dedup/replacement
    state (here lastArchivedMap and deleteOldArchive), never a line-range that stops
    before them; and (b) construct the invariance test so its inputs ACTUALLY exercise the
    collision/contention branch the audit identifies as the hazard — for a dedup keyed by
    a shared identifier, at least one scenario must feed two providers the SAME key under
    both orderings, so the assertion is not vacuously satisfied by disjoint inputs. A
    swap-invariance test over disjoint keys proves a property of the stubs, not of the
    archiving path.
  target: skills/review-gate (checklist) and skills/stepledger-authoring
  owner: Human

- id: KZ-2026-06-23-003
  created: 2026-06-23
  gate: pre-implementation
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    WS-0023 reproduces the same scoring logic (computeDenseRanks, scoreTargets,
    resolveOrder, normalization) in two places — the pure TypeScript module
    popularityScoring.ts and, inlined as plain JavaScript, in scripts/refresh-popularity.mjs
    (Task 3.2 explicitly forbids importing from the TS tree) — while the StepLedger's own
    Architectural Decision 8 and the governing PLAN-006 Decision 1 both state the component
    is "reused identically by the build-time tool via a direct import." The instruction
    contradicts the recorded decision with no notation of the divergence, and no task in
    the workstream asserts the two implementations produce identical output for the same
    input. The .ts module's 21-AC unit coverage therefore does not protect the .mjs copy
    that actually computes the shipped artifact; a future formula or tie-break change to
    the TS source leaves the JS copy silently stale, falsifying the single-source-of-truth
    and recompute-from-raw guarantees the feature exists to provide. The tell is a Task
    instruction that overrides an Architectural Decision without a stated rationale, plus
    a duplicated algorithm with no cross-implementation parity test.
  proposed_change: >
    Add two coupled checklist items. (1) Stepledger-authoring: whenever a Task instruction
    contradicts a recorded Architectural Decision (or a governing plan decision), the task
    must carry an explicit "diverges from Decision N because: <reason>" notation;
    an unannotated contradiction between the decision layer and the task layer is a
    blocking authoring defect. (2) Review-gate and tdd-workflow: whenever the same
    load-bearing algorithm is implemented in two runtimes/languages that cannot share a
    single source (e.g. a .ts module and a Node .mjs that may not import it), require a
    parity test that runs both implementations on a shared committed fixture and asserts
    identical output — a duplicated algorithm with no equivalence test is an unguarded
    drift surface even when each copy is individually unit-tested.
  target: skills/review-gate (checklist) and skills/stepledger-authoring
  owner: Human

- id: KZ-2026-06-24-001
  created: 2026-06-24
  gate: pre-release
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    WS-0024 implements a CommonMark column-based indentation rule (0–3 columns
    after tab expansion) but the production predicates do not enforce it for
    fenced-code-block boundaries. FENCE_RE = /^(\s*)(```+|~~~+)/ uses an
    UNBOUNDED \s* leading group, so a 4-or-more-column-indented fence opener is
    accepted as a fence; isClosingFence uses line.trimStart() with no column
    limit, so an over-indented line closes an open block. Both reproduce exactly
    the "over-indented fence lines accepted" defect SPEC-005 Error handling §3
    was written to eliminate, silently corrupting in-code # lines (the closer
    prematurely ends the block; following in-code headings get transformed) or
    falsely protecting a real heading (the over-indented opener starts a phantom
    block). Critically, NO test can surface either bug: SPEC-005 Behavioral
    delta §2 explicitly mandates a NEW 4-or-more-column fixture for both opener
    and closer, and that fixture is absent — the only fence-indentation test
    uses a 3-space (valid under both rules) fence whose assertion does not change.
    The WS Activity 1 "ACs closed" list claims AC17/AC18/AC19 closed while the
    code violates all three and no test exercises them. The structural tell:
    a spec rule stated in COLUMNS (tab-expanded) implemented by a regex/trim that
    measures CHARACTERS or strips unboundedly, with the over-limit fixture the
    spec named as required left unwritten — the correctness gap and the test gap
    coincide so a green quality gate certifies a defect.
  proposed_change: >
    Add a review-gate and coding-standards checklist item for any CommonMark/
    column-based indentation rule: every predicate that admits or rejects a line
    by leading indentation (heading recognition, fence opener, fence closer,
    indented-code classification) must measure indentation in COLUMNS after tab
    expansion via one shared, unit-tested helper — never an unbounded \s* group,
    a character-count bound, or an unbounded trimStart(). When a governing spec
    names a specific over-limit fixture as required (here SPEC-005 Behavioral
    delta §2's 4-or-more-column opener AND closer cases), the review must confirm
    that exact fixture exists and fails against the unfixed code before accepting
    the AC as closed. A 0–3-column rule with no committed 4-column negative test
    is an unverified rule.
  target: skills/review-gate (checklist) and skills/coding-standards
  owner: Human

- id: KZ-2026-06-24-002
  created: 2026-06-24
  gate: pre-release
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    WS-0024's ATX recognition predicate HEADING_RE = /^ {0,3}(#{1,6})\s/ requires
    a mandatory whitespace character after the # run, but SPEC-005 Terminology and
    Bare ATX recognition §1 define an ATX heading as a # run "followed by a space,
    a tab, OR THE END OF THE LINE." A bare heading at end-of-line (input '##' with
    no trailing character) does not match \s and is silently left untransformed,
    violating CommonMark §4.2 and the spec's bare-ATX clause. The defect survived
    because the AC14 test fixture happens to use '##' + two trailing SPACES (which
    DO satisfy \s), so the literal acceptance criterion passes while the normative
    end-of-line terminator clause it is meant to exercise is never tested. This is
    the terminator/boundary-clause variant of test-attribution drift: a recognition
    rule with an inclusive terminator set (space | tab | EOL) is verified by a
    fixture covering only the easy terminator, leaving the EOL boundary — the one a
    naive \s-only regex gets wrong — unguarded.
  proposed_change: >
    Add a review-gate and tdd-workflow checklist item for any tokenizer/recognition
    predicate whose governing definition lists an inclusive terminator set
    (e.g. "followed by space, tab, OR end of line"): require one committed test per
    distinct terminator in the set, including the zero-width end-of-line terminator,
    constructed so it FAILS against a predicate that omits that terminator. A regex
    ending in a mandatory \s (or a single required delimiter class) is a tell that
    the end-of-input / end-of-line terminator was dropped; cross-check it against the
    spec's terminator enumeration before accepting the recognition AC as closed.
  target: skills/review-gate (checklist) and skills/tdd-workflow
  owner: Human

- id: KZ-2026-06-24-003
  created: 2026-06-24
  gate: pre-release
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    SPEC-005 Known limitations §1 names the mixed-ATX+setext DESYNC as the harm to
    communicate ("a document mixing ATX and setext has its ATX levels shifted while
    its setext levels stay fixed, leaving the heading hierarchy internally
    inconsistent") and requires it on a user-facing surface. The shipped README note
    documents only the BENIGN exclusively-setext case (which produces a visible
    "No Markdown heading to change." no-op) and omits the dangerous mixed case (a
    silent, noticeless desync). WS-0024 Task 7.2 prescribed note text that itself
    carried only the exclusive-setext framing, so the implementer faithfully shipped
    a documentation surface that inverts the spec's emphasis: the harmless case is
    documented, the harmful one the spec exists to warn about is not. Separately, the
    CHANGELOG carries a manual [Unreleased] block (Keep-a-Changelog "### Fixed"
    style) while PLAN-007 Decision 8 routes the release note through the semantic-
    release commit body (conventionalcommits, @semantic-release/changelog prepends a
    generated section) — two conflicting governance signals (WS Task 7.1 manual edit
    vs plan commit-body route) that will leave an orphaned, format-divergent
    [Unreleased] block above the generated release section after merge. Both are the
    same meta-pattern: a "communicate the limitation on a user surface" task whose
    StepLedger paraphrase silently weakens or duplicates the spec's normative content.
  proposed_change: >
    Add a stepledger-authoring and review-gate checklist item: when a spec requires a
    known-limitation/risk to be "communicated on a user-facing surface," (a) the
    StepLedger's prescribed note text must quote the spec's normative HARM statement
    verbatim (here the mixed-document desync), not summarize it into the benign case;
    the reviewer diffs the shipped surface against the spec clause it satisfies and
    flags any omission of the dangerous case. (b) When the project uses semantic-
    release commit-body changelog generation, the changelog task must explicitly
    forbid a parallel manual [Unreleased] block (single canonical route), and the
    review must confirm exactly one user-facing changelog surface carries the note in
    the project's release-notes format.
  target: skills/review-gate (checklist) and skills/stepledger-authoring
  owner: Human

- id: KZ-2026-06-24-004
  created: 2026-06-24
  gate: pre-release
  artifact_type: stepledger
  status: open
  classification: checklist-update
  pattern: >
    On the WS-0024 fix-forward verification, the F5 refactor replaced a
    lineCount-derived whole-document replace range with one derived from the
    feature's OWN line model (splitLines), but splitLines and the host VS Code
    text model disagree on the trailing terminator: splitLines('# h\n') yields ONE
    Line whose terminator is '\n', so lastLineIdx/lastLineContentLen point to the
    end of the last CONTENT line — before the trailing '\n'. The replace text from
    joinLines INCLUDES that '\n'. editBuilder.replace(range, text) therefore inserts
    a '\n' while leaving the document's original trailing '\n' in place, doubling the
    trailing newline on every editor-path increment/decrement of a well-formed
    (trailing-newline) Markdown file — a silent SPEC-005 line-ending-integrity
    violation (AC15 / Constraint 2). The defect was invisible because the ONLY
    trailing-newline test (command.test.ts:288) routes through the explorer path
    (writeFile of the full result.text — no Range), while every editor-path test
    used inputs with no trailing newline, so the Range/text terminator mismatch was
    never exercised. The structural tell: a host-editor Range computed from a
    secondary, independently-defined line model whose end-of-document semantics
    differ from the host's, combined with replacement text that carries a terminator
    the Range end excludes — and a trailing-terminator fixture exercised only on the
    path that does not use the Range.
  proposed_change: >
    Add a review-gate and coding-standards checklist item: when a host-editor
    whole-document (or any positional) replace Range is computed from a secondary
    line model rather than the host's own document API, the reviewer must verify the
    two models agree on the trailing-terminator / final-empty-line boundary, and that
    the replacement string's terminator handling matches what the Range end includes
    or excludes — prefer the host's canonical whole-document idiom
    (document.positionAt(text.length), or a documented full-range helper) over an
    ad-hoc end position. Require a host-path (not just file-IO-path) test for a
    trailing-terminator document asserting the produced buffer gains no extra
    terminator. A trailing-newline fixture exercised only on a non-Range code path
    does not cover a Range-based path.
  target: skills/review-gate (checklist) and skills/coding-standards
  owner: Human
````
