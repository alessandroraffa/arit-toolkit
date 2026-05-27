---
title: 'Refinement report — improvements to skills/workstream-authoring/SKILL.md'
report_type: 'refinement'
source: 'WS-0013 execution Reflection'
target_document: 'skills/workstream-authoring/SKILL.md'
created: 2026-05-27
status: 'proposed'
---

## 1 Context

WS-0013 (`Archive gitignore prompt and YYYY/MM directory layout`, tangyr-vscode) executed end-to-end through four activities, four commits, and 779 passing unit tests. During execution, the executor recorded **nine divergences from the workstream as prescribed**, every one of which classified into the same root-cause category — **Spec gap** (the workstream itself did not survive contact with the live codebase, tooling, or runtime semantics). The Reflection block at the close of WS-0013 identified five generalizable improvements to the workstream-authoring discipline. This report expands those proposals into an actionable refinement for the global skill `skills/workstream-authoring/SKILL.md`.

This report is self-contained: each proposal lists its problem, the WS-0013 evidence, the proposed prose to add to the skill (with target section), and a validation criterion. A reader who has not seen WS-0013 should be able to evaluate every proposal from this document alone.

## 2 Common Theme

The existing draft-review and cross-verification skills cover **static cross-verification** — paths exist, anchors match, references resolve, naming follows the template. They do not cover **dynamic cross-verification** — does the prescribed regex match the actual data format? Does the prescribed test pattern survive the production code's async side effects? Does the prescribed commit subject pass the project's commitlint? Does the prescribed file list cover everything the lint gate inspects?

All nine WS-0013 divergences are dynamic-execution defects invisible to artifact-level inspection. The multi-perspective review of WS-0013 (Phase 2, four reviewers) did not surface any of them. They became visible only during execution, when the prescribed artifact met its live environment.

The five proposals below address concrete repeatable instances of this same gap. Each is independently actionable; sequencing is suggested but not forced.

## 3 Proposals

### 3.1 Proposal 1 — Commit message validation against the project's commitlint

**Problem.** Workstream-prescribed commit subjects can fail commitlint at execution time, forcing the executor to deviate from the prescribed text. The pre-commit hook failure cannot be bypassed (hard rule). The deviation slows execution and produces a low-information divergence record.

**Evidence (WS-0013).**

- Task 2.5 prescribed `refactor(archiving): extend reconfigure to invoke gitignore prompt on archivePath change`. The camelCase identifier `archivePath` in the subject violates the project's `subject-case: lower-case` rule. Reformulated at execution time to `... archive path change`.
- Task 3.7 prescribed `feat(archiving): organize archive into year/month subdirectories with idempotent flat-layout migration sweep` (108 characters). Violates the default `header-max-length: 100`. Reformulated to a 86-character subject at execution time.

Both failures were self-detectable at authoring time: a one-line check against `commitlint.config.mjs` would have caught them.

**Proposed addition** (target section: a new "Commit Subject Validation" subsection under the existing "Commits and Activity Closure" or analogous section; if no commit-related section exists, add to a new "Project-Tooling Validation" parent section):

> When prescribing a commit subject in any task, the workstream author MUST validate the prescribed subject against the project's commitlint configuration (`commitlint.config.{js,mjs,cjs,ts}` or `.commitlintrc.*`). Validation MUST cover at minimum:
>
> 1. **Header length**: subject length ≤ the configured `header-max-length` (default 100 from `@commitlint/config-conventional`).
> 2. **Subject case**: subject MUST satisfy `subject-case` (typically `lower-case`). Identifiers in camelCase (e.g., `archivePath`, `runArchiveCycle`) MUST be rephrased to lowercase two-word forms (`archive path`, `run archive cycle`) when they appear in the subject. They MAY remain camelCase in the body.
> 3. **Type whitelist**: subject type MUST be one of the project's configured `type-enum` values.
> 4. **Scope conventions**: when the project documents commit scopes (feature names, package names), the workstream's prescribed scope MUST match the project's convention.
>
> If the prescribed subject fails any of these checks, the workstream author MUST revise the subject BEFORE the workstream is presented for PM review. A workstream presenting a non-validating subject is incomplete.

**Validation criterion.** The next workstream that prescribes a commit subject must pass commitlint on the first execution attempt with zero subject-related divergence.

### 3.2 Proposal 2 — Regex sanity check via worked example and digit budget

**Problem.** Workstream-prescribed regexes with explicit fixed quantifiers (`\d{N}`, `.{N}`, `[A-Z]{N}`) can carry internal arithmetic inconsistencies that pass static review but fail at runtime. The cost of detection scales with how late the regex meets real input.

**Evidence (WS-0013).** Task 3.2 prescribed `FLAT_PATTERN = /^(\d{4})(0[1-9]|1[0-2])\d{8}-.+\.\w+$/`. The regex requires `4 + 2 + 8 = 14` digits before the `-`. However, the same workstream's prose example string was `'202099310000-foo.md'`, which contains **twelve** digits (`YYYY` + `MM` + `DDHHmm`). With `\d{8}`, no flat-layout filename ever matched the regex, making `migrateFlatLayout` a permanent no-op. The bug shipped silently in Activity 3's commit and was only surfaced when Activity 4's tests failed because `copy` was never called. The internal contradiction between the regex digit budget (`4 + 2 + 8 = 14`) and the example string (`12` digits) was self-detectable at authoring time.

**Proposed addition** (target section: "Specifying Algorithms" or "Code-Level Prescriptions"; if absent, add a new "Regex and Pattern Prescriptions" subsection):

> When prescribing a regex containing fixed-count quantifiers (`\d{N}`, `.{N}`, `[A-Z]{N}`, or `\w{N}`), the workstream author MUST include in the same task:
>
> 1. **At least one positive example**: a literal string the regex MUST match. The example is presented as a code-spanned literal, not pseudo-code.
> 2. **At least one negative example**: a literal string the regex MUST reject, ideally illustrating a boundary condition the regex enforces (e.g., the month `1[0-2]` boundary).
> 3. **A digit budget computation**: a short arithmetic comment verifying that the sum of fixed quantifiers in the regex equals the actual count in the positive example. Example for the corrected `FLAT_PATTERN`:
>
>    > Total 12 digits before the `-`: `YYYY(4) + MM(2) + DDHHmm(6)`. Positive example `'202605251830-foo.md'` confirms the budget.
>
> An internal contradiction between the regex and the example MUST cause the regex to be revised BEFORE the workstream is presented for PM review.

**Validation criterion.** The next workstream that prescribes a digit-counting regex must include a digit budget. The absence of a digit budget on a regex with fixed quantifiers becomes a structural review finding.

### 3.3 Proposal 3 — Lint surface scoping for activity commit file lists

**Problem.** When a task's commit file list omits sibling artifacts that the project's lint command will inspect, the lint gate fails for reasons unrelated to the prescribed production code change. The executor must either fix an unrelated artifact (deviation) or expand the commit set (deviation), both producing divergence records.

**Evidence (WS-0013).** Task 1.7 prescribed a ten-file commit list. The list omitted `docs/reports/WS-0013-review-phase2.md`, an untracked sibling artifact produced during the workstream's multi-perspective review phase. The project's lint command runs `markdownlint-cli2 '**/*.md'` across all markdown files in scope. A pre-existing MD038 violation in the report blocked the Activity 1 quality gate, forcing the executor to fix the unrelated file and expand the Activity 1 commit set.

**Proposed addition** (target section: "Activity Commit Boundaries" or "Files-to-Commit Discipline"):

> The "files to commit" list for any activity that invokes the project's lint, build, or test gate MUST include every untracked or modified sibling artifact that the gate's globs will inspect. Specifically:
>
> 1. **Untracked siblings**: before finalizing the workstream, the author MUST run `git status` (or equivalent) and verify that every untracked file in the project's lint/build/test glob scope is either (a) included in some activity's commit list, OR (b) explicitly noted as out-of-scope with a justification.
> 2. **Multi-artifact authoring**: if the workstream's design phase produced sibling artifacts (review reports, draft notes, scratch documents), the workstream author MUST decide which activity ships those artifacts and document the decision in the activity's commit-list rationale.
> 3. **Gate-blocking pre-existing issues**: if the project's lint gate has known pre-existing issues that would block the first commit on the workstream's branch, the workstream author MUST surface them as either (a) a pre-execution fix-up task in the workstream, or (b) an explicit divergence allowance in the workstream introduction.
>
> A commit set that omits a sibling artifact whose presence causes a gate failure is a structural review finding.

**Validation criterion.** After applying, the workstream-authoring pre-PM-presentation checklist must include "verify no untracked sibling artifact in the lint scope was overlooked", and the first commit of the next workstream must pass the project's lint gate without commit-set expansion.

### 3.4 Proposal 4 — Forward-reference resolution across activities

**Problem.** A workstream can prescribe an insertion anchor (file path, line, identifier, function name) that is introduced by a _later_ task. If the activity order places the referring task before the introducing task, the executor encounters a phantom anchor and must improvise.

**Evidence (WS-0013).** Task 2.1 prescribed inserting the `_reconfiguring` field "immediately after `private readonly ensuredDirectories = new Set<string>();` (the JSDoc-annotated field introduced in Task 3.1)". Activity 2 commits before Activity 3, so `ensuredDirectories` did not exist in the file at Task 2.1's commit gate. The executor placed `_reconfiguring` after `_needsDedup` instead and recorded a divergence; Task 3.1 in Activity 3 later inserted `ensuredDirectories` between the two fields to recover the workstream's intended adjacency.

**Proposed addition** (target section: "Cross-Task Coherence" or "Activity Ordering"):

> When a task prescribes an insertion anchor introduced by another task, the workstream author MUST verify that the introducing task PRECEDES the referring task in commit order. Specifically:
>
> 1. **Anchor existence at commit time**: every anchor (file path, line, identifier, function name) referenced in a task MUST exist in the codebase at the moment that task's commit gate runs. Anchors introduced in a later commit of the same workstream are NOT valid anchors for earlier tasks.
> 2. **Cross-activity reordering**: if a task in Activity N references an anchor introduced in Activity M with M > N, the workstream author MUST either (a) reorder activities so M precedes N, (b) lift the anchor introduction into an earlier activity, or (c) choose a different anchor that already exists at Activity N's commit time.
> 3. **Forward-reference annotations as self-flag**: prose like "introduced in Task X.Y" or "added by a later activity" in a task description is a self-flag for the workstream author — verify the temporal coherence and revise BEFORE the workstream is presented.
>
> Forward references that survive into the presented workstream are a structural review finding.

**Validation criterion.** After applying, the draft-review skill's "Functional or Structural Coherence" check must include a temporal-coherence sub-check: for every anchor reference in a task, locate the anchor's introduction in the workstream and verify chronological order.

### 3.5 Proposal 5 — Async/concurrency design for test prescriptions

**Problem.** When the service-under-test has fire-and-forget side effects from its public API (e.g., `start()` doing `void this.someAsyncMethod()` internally), tests that assert exact call counts on mocks consumed by the side effect must account for the concurrency. The `mockResolvedValueOnce` chain pattern is unsound under concurrent consumers because chain entries are consumed in unpredictable interleaved order.

**Evidence (WS-0013).**

- Task 3.5 prescribed `mockResolvedValueOnce` chains for eight of the ten dedup tests. The production code's `start()` does `void this.runArchiveCycle()` (fire-and-forget Cycle A) before returning; the test's `await service.runArchiveCycle()` triggers Cycle B. Both cycles enter the multi-call `deduplicateAndHydrate` concurrently. The chain entries were consumed in interleaved order, producing `undefined` returns and `topEntries is not iterable` crashes.
- Tasks 3.4 and 4.1 prescribed similar patterns for the new YYYY/MM-layout and migration tests, with the same outcome.

The fix in all three cases was to either (a) replace the `mockResolvedValueOnce` chain with `mockImplementation` keyed on a discriminator (e.g., `uri.fsPath`), or (b) bypass the fire-and-forget by directly setting service state through a typed cast (`(service as unknown as { _currentConfig: T })._currentConfig = ...`).

**Proposed addition** (target section: "Test Prescriptions" or "Workstream Authoring for Tests"):

> When prescribing tests against a service-under-test, the workstream author MUST analyze the public-API side effects of any method called in the test's Arrange phase. Specifically:
>
> 1. **Fire-and-forget detection**: identify any public method that calls `void this.something()` or otherwise initiates async work that is not awaited by the caller. Document these in the workstream's introduction so the executor knows to expect concurrent consumers. Example self-flag: "`AgentSessionArchiveService.start()` fires `void this.runArchiveCycle()` before returning; tests that subsequently `await service.runArchiveCycle()` produce two concurrent cycles".
> 2. **Mock pattern selection**:
>    - When the test mocks a function consumed by a SINGLE consumer (no fire-and-forget concurrency), `mockResolvedValueOnce` chains are acceptable.
>    - When the test mocks a function consumed by MULTIPLE concurrent consumers, the workstream MUST prescribe either:
>      - **`mockImplementation` keyed on a discriminator** (e.g., `uri.fsPath`, `name`, a per-call counter): returns consistent values regardless of call order.
>      - **Bypassing the fire-and-forget**: prescribe direct state mutation through a typed cast (`(service as unknown as { _field: T })._field = value`) instead of calling the public API that fires the unwanted side effect. Document this as an intentional bypass in the test's prelude comment.
> 3. **Assertion robustness**: when the production code has a per-cycle invariant (e.g., a per-cycle cache) and the test setup triggers concurrent cycles, assertions of exact call counts WILL be unstable. The workstream MUST either bypass the fire-and-forget OR assert a range/relationship instead of exact count, AND document the choice in the test's prelude comment.
>
> Test prescriptions that ignore fire-and-forget concurrency are a structural review finding.

**Validation criterion.** After applying, the draft-review skill's "Functional or Structural Coherence" check must include an async-side-effect sub-check: for every test that calls a service's public API in Arrange, verify the workstream documents the API's side effects and selects an appropriate mock pattern.

## 4 Optional Framing — Dynamic Cross-Verification

If the five proposals are accepted, a short framing subsection at the top of `skills/workstream-authoring/SKILL.md` would tie them together as concrete instances of the same general discipline:

> ### Dynamic cross-verification
>
> The cross-verification protocol (`skills/cross-verification/SKILL.md`) covers **static** artifact integrity: paths exist, anchors match, references resolve. **Dynamic cross-verification** covers RUNTIME integrity — the artifact's contact with live tools and live execution:
>
> - Regex patterns match the actual data format (see "Regex and Pattern Prescriptions").
> - Async tests account for concurrent consumers (see "Async/Concurrency Design for Test Prescriptions").
> - Commit subjects satisfy commitlint constraints (see "Commit Subject Validation").
> - File lists include all gate-relevant artifacts (see "Files-to-Commit Discipline").
> - Cross-task anchors are temporally coherent (see "Cross-Task Coherence").
>
> A workstream that passes static cross-verification but fails dynamic cross-verification is a workstream that compiles but does not run. Both layers are mandatory.

## 5 Application Plan

If the PM approves, apply the proposals as a single coordinated edit to `skills/workstream-authoring/SKILL.md`. Recommended sequence inside the same commit:

1. Add the "Dynamic Cross-Verification" framing subsection.
2. Add Proposal 1 ("Commit Subject Validation").
3. Add Proposal 2 ("Regex and Pattern Prescriptions").
4. Add Proposal 3 ("Files-to-Commit Discipline" — extend, do not replace, any existing section).
5. Add Proposal 4 ("Cross-Task Coherence" — extend, do not replace).
6. Add Proposal 5 ("Async/Concurrency Design for Test Prescriptions").

Commit message: `chore(framework): apply reflection improvements from WS-0013`.

Per the established discipline, edits to operational skills are made in the source location (`agent-coding/operational-machinery/skills/workstream-authoring/SKILL.md`), not the deployed `~/.claude/skills/...` symlinks.

## 6 Rejected and Deferred Alternatives

- **Automated workstream linter** — an external tool that validates prescribed regexes, commit subjects, file lists, anchors, and mock patterns against the live project. Higher leverage than prose checklist additions, but requires non-trivial tooling work and falls outside the scope of the workstream-authoring skill. Deferred to a potential separate initiative.
- **Workstream dry-run** — have the workstream author execute the prescribed tests against a stubbed implementation before presentation. High authoring cost, low marginal return given the prose-checklist alternative. Rejected for this iteration.
- **Promote draft-review to a "stress test" mode** — have the draft reviewer attempt to find dynamic-execution defects beyond the current static checks. Possible future direction; not addressed in this report because the proposals here strengthen the authoring side, which is the upstream source of the defects.

## 7 Verdict

Pattern identified: 9/9 WS-0013 divergences in the **Spec gap** category, every one a dynamic-execution defect invisible to static review. The five proposals are independently actionable, mutually compatible, and each closes a concrete repeatable instance of the pattern. The framing subsection ("Dynamic Cross-Verification") makes the common theme legible and gives future workstream authors a single conceptual anchor.

PM authorization is required before any edit to `skills/workstream-authoring/SKILL.md` (operational document under framework protection).
