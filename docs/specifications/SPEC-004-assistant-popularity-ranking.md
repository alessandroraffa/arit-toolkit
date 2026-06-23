---
title: 'Assistant popularity ranking — single-source ordering for supported targets'
spec: SPEC-004
status: 'approved'
workspaces: []
created: 2026-06-22
references:
  - README.md (Supported assistants table; assistant enumerations)
  - docs/specifications/SPEC-003-opencode-session-provider.md
  - Existing agent sessions archiving feature (agentSessionsArchiving)
---

## Introduction

The agent sessions archiving feature supports eight AI coding assistants — Claude Code, Cline, GitHub Copilot Chat, OpenAI Codex, OpenCode, Aider, RooCode, and Continue. These are the targets instantiated in the runtime provider registry; the README currently documents only five of them, so closing that documentation gap is part of this specification's scope. Throughout the project these assistants are named, listed, and enumerated in many places: the README "Supported assistants" table, every prose sentence that lists them, the runtime provider enumeration, any user-facing list, and the order in which archive output and logs reference them. Today that order is fixed by hand and repeated independently in each location, with no governing rule for why one assistant precedes another and no single place that defines the order.

This specification defines a **popularity parameter** per supported assistant and makes that parameter the single governing input to the order in which the supported assistants are presented everywhere — in documentation and in the extension runtime alike. A supported assistant governed by this ordering is a **target**. A target is an assistant, not a surface: the command-line tool and the editor extension of the same assistant share one session store and one provider, so they count as one target whose popularity aggregates the signals of all its surfaces.

Popularity governs the order because it surfaces the assistants a reader is most likely to recognize and reach for first, reducing the time spent scanning the list; popularity is chosen as the ordering metric because it is objective and automatable, where a subjective ranking or a purely alphabetical ordering would be either unverifiable or unrelated to reader relevance. The resulting order reflects an objective, reproducible popularity metric computed from public signals — it is not an endorsement, a recommendation, or a quality judgment of any assistant, and the scoring method is documented and transparent.

This specification defines the observable behavior and the determinism, provenance, isolation, and zero-runtime-dependency constraints the popularity ordering must satisfy. It does not prescribe the score formula, the data-file format or location, the metric endpoints, or the fetch tooling — those are implementation-plan and StepLedger concerns (see Constraints). The actual numeric values are an execution output of the refresh step, not part of this specification (see Out of scope).

## Functional requirements

### Popularity parameter and target unit

1. Each supported target must carry a single comparable popularity score. The eight targets governed by this specification are the full set instantiated in the runtime provider registry: Claude Code, Cline, GitHub Copilot Chat, OpenAI Codex, OpenCode, Aider, RooCode, and Continue.

2. A target is an assistant, not a surface. Each target's popularity must aggregate the public signals of all that assistant's surfaces — command-line-tool download counts, editor-extension install counts, and source-repository stars — into one score for the assistant. Surfaces are inputs to the score, never separately ranked targets.

3. When a future assistant becomes a supported target, it must be ranked by the same parameter and the same aggregation, slotting into the order by its score with no special-case handling and no manual position assignment.

### Aggregation model

1. The popularity score for a target must be derived from a rank-based aggregation of that target's available signals. The signals are heterogeneous and not directly comparable: command-line download counts are a recurring per-period flow, while editor-extension install counts and repository stars are cumulative totals, and the three move on different scales. Rank-based aggregation reconciles these into a single comparable score without combining their raw magnitudes.

2. For each signal — for example command-line download counts, editor-extension install counts, and repository stars — the targets that possess that signal must be ranked against one another on that signal alone, with rank 1 assigned to the most popular target on that signal. A target that lacks a signal does not participate in the ranking of that signal (see Missing-surface tolerance).

3. **Within-signal tie rule (dense ranking).** Two or more targets with equal raw values on the same signal must receive the same rank on that signal, and the next distinct raw value must take the immediately following rank with no gap. Equal raw values therefore share one rank, and ranks advance by one across distinct values regardless of how many targets share a value. This rule fully determines every per-signal rank — including ties on raw values — from the recorded raw signals alone, independent of the order in which targets are processed.

4. **Pool-size-comparable normalization of per-signal position.** Before averaging, each target's per-signal rank must be normalized to a pool-size-comparable position: the target's relative standing within the set of targets that possess that signal, measured from the best end (most popular) to the worst end (least popular) of that pool. Because the number of targets possessing a signal can differ from one signal to another, a raw rank of 1 among two possessing targets and a raw rank of 1 among eight possessing targets are not equivalent standings; normalizing each rank to a relative position within its own pool makes positions drawn from signals with different pool sizes comparable when averaged. The normalized position must be deterministic and reproducible from the recorded raw signals alone, with the best end of every pool denoting the most popular standing. The normalization pool basis for a signal is the set of targets that possess that signal — its count — and never the global set of eight targets, so a target absent from a signal perturbs neither the ranks nor the normalized positions of the targets that do possess it (consistent with the unconditional missing-surface non-participation rule), and a target that is the sole possessor of a signal takes the best-end normalized position on that signal — the limit case of the §6 accepted trade-off that best-within-a-small-pool attains the top relative position, which also removes any undefined value for a pool of size one (reachable, for example, when the command-line signal is split by registry and one target is the only possessor of a given registry's signal). The exact normalization formula is deferred to the plan gate (see Constraints); this specification fixes only the property the formula must satisfy — a comparable relative position, best end most popular, reproducible across pools of differing size.

5. Each target's aggregate score must be the average of its normalized per-signal positions, computed only over the signals the target actually possesses. Averaging — rather than summing — makes the score neutral to the _count_ of signals a target possesses: a target with fewer available signals is neither penalized nor rewarded for how many signals it has. This neutrality is with respect to signal count only; it is not a claim that signals with different pool sizes contribute equivalently, which is the concern the pool-size-comparable normalization above resolves. The final order is ascending by average normalized position, best average first, with the tie-break in Deterministic total order resolving exact equalities.

6. **Accepted pool-size trade-off.** A target that is best within a thinly-possessed signal still attains the top relative position on that signal, so winning a signal that few targets possess can lift a target's average; this residual is an accepted, documented property of rank-based aggregation, which deliberately discards magnitude and distance for robustness and simplicity, and in practice the eight targets share most signals, so pool sizes across signals are similar. The data artifact must ship with an acknowledgment of this pool-size property of the scoring method (transparency), so a reader can see that the order reflects relative standing rather than raw magnitude. Under this documented disposition the resulting order is intended to remain consistent with the most-recognizable-first reader value that motivates popularity ordering (see Introduction); this reader-experience intent is the rationale for the method, not an independently testable acceptance criterion.

7. Rank-based aggregation is scale-invariant by construction: because each signal contributes only a normalized rank position, not a raw count, no high-scale signal can dominate the score by raw magnitude. Scale-invariance across the _magnitudes_ of signals is intrinsic to the method; comparability across the _pool sizes_ of signals is supplied by the pool-size-comparable normalization above.

8. The aggregation method must be documented alongside the data so that any reader can reproduce each score from the recorded raw signals. The aggregation must be deterministic and fully reproducible: the same recorded raw signals must always yield the same per-signal ranks — including the dense-ranking resolution of equal raw values — the same normalized positions, the same average-position scores, and the same resulting order, computed from the recorded raw signals alone without re-querying any external source and independent of input or iteration order.

### Missing-surface tolerance

1. A target that lacks a surface, or whose surface exposes no public metric, must still receive a well-defined score. Missing-surface exclusion is unconditional: a target simply does not participate in the per-signal ranking of any signal it lacks, so an absent signal is excluded from that target's average-position aggregation, never treated as zero, and never treated as a failure.

2. An absent or unavailable signal must never produce a gap, an error, an undefined score, or an interruption of the ordering. Because the score is the average of only the normalized positions a target actually has (see Aggregation model), a target with fewer available signals still ranks deterministically against targets with more, and the ordering remains well-defined for every target regardless of how many signals it possesses. The per-target surfaces believed available — and therefore the signals each target is expected to participate in — are inventoried in Surface assumptions, subject to plan-gate verification.

### Deterministic total order

1. The ordering derived from the popularity scores must be a total order over the supported targets: every target has a defined position, and no two targets share a position.

2. **Canonical target names.** The tie-break sorts on this exact set of canonical display names, one per target: Aider, Claude Code, Cline, Continue, GitHub Copilot Chat, OpenAI Codex, OpenCode, RooCode. These are the canonical display names used throughout documentation and presentation, and the runtime provider registry identifies the same eight targets by this same set.

3. The order must be stable across builds. When two targets have equal average normalized-position scores, the tie-break is alphabetical by canonical target name, ascending: the target whose canonical name sorts earlier takes the earlier position. The collation is case-insensitive ASCII lexicographic, ascending, applied to the canonical names enumerated above. This tie-break is fixed at the specification level, so that equal scores never reorder between builds and never depend on iteration order, map ordering, or input arrangement.

4. The resolved order must be the same in every consuming location — the order in the documentation and the order in the runtime must be identical, because both derive from the same source (see Single source of truth).

### Single source of truth

1. Exactly one versioned artifact must hold the popularity data and the order derived from it. Both the README enumerations and the runtime presentation order must derive from that one artifact. No consuming location may maintain a second hand-edited copy of the order.

2. The README "Supported assistants" table, every prose enumeration of the supported assistants, and every count claim about how many assistants are supported must reflect the order defined by the single source. The runtime presentation order — the order in which supported targets are enumerated to the user, the order in which they appear in archive-related output, and the order in which they are named in logs — must reflect the same order.

3. The README documentation must be expanded to document all eight supported targets. The "Supported assistants" table must list a row for each of the eight, and every prose enumeration and every count claim — including any statement of how many assistants are supported — must name all eight and report the count as eight, consistent with the single source-of-truth order. The currently undocumented targets — Aider, RooCode, and Continue — are confirmed supported providers, so the documentation must close the gap between what the README states and what the runtime registry instantiates.

4. When the popularity data changes the order, both the documentation enumerations and the runtime presentation order must change together, because both read the same source. A change applied to one location but not the other is a divergence, not an accepted state.

### Recorded provenance

1. The data artifact must record, per target, the raw signals used to compute the score, the source each signal was drawn from, and the timestamp or period the signals belong to. The recorded signals and the documented aggregation method together must be sufficient to recompute each score.

2. The recorded data must make the monthly delta visible in version control: each refresh that changes a signal or a score must produce a reviewable change to the versioned artifact, so the evolution of the ranking is auditable from history.

### Build-time refresh

1. The popularity signals must be refreshed on a monthly cadence by an automated build-time step that queries the public data sources and writes the updated versioned artifact. The cadence and the refresh procedure must be documented.

2. The refresh step must be repeatable: running it against the same external state must produce the same recorded signals and the same scores, and a refresh that finds no change must leave the resolved order unchanged.

3. The refresh step is the only step permitted to query external sources. It runs at build time, never as part of the running extension.

4. The monthly refresh must not push order changes or README changes directly to the published branch. It must propose its changes through a pull request, and the project's existing human merge authorization is the pre-publication control over any order change — consistent with the repository's established human-merge governance and its existing monthly automated-dependency pull-request pattern.

5. The perpetual monthly refresh obligation must have a designated maintenance owner and a documented acceptable-staleness window — the maximum period the recorded data may lag the cadence before the lag warrants the owner's attention. Both the specific owner and the specific length of that window are resolved at the plan gate; this specification fixes only that both must exist and be documented.

6. The auto-generated nature of the data artifact and the procedure for running the refresh must be discoverable from the repository surface — for example a documented command and a corresponding continuous-integration job — so a maintainer can find both how the artifact is produced and how to reproduce a refresh.

### Staleness behavior

1. When the recorded data is older than the monthly cadence, the ordering must remain fully usable: the order must still resolve deterministically from the recorded data, with no degradation and no error.

2. Staleness must be detectable by inspection of the recorded refresh timestamp or period: that recorded value must be sufficient to determine that the data is older than the cadence, without blocking the ordering. Staleness is surfaced through the monthly refresh pull request (see Build-time refresh), whose absence or delay is the observable signal that a refresh is overdue; no separate runtime alerting mechanism is required.

## Constraints

1. **Zero new runtime dependency.** The extension advertises zero runtime dependencies (VS Code API only). The popularity ordering must preserve that posture. The build-time refresh and the runtime ordering together must not introduce any new dependency into the shipped, running extension.

2. **No network at runtime.** The runtime ordering must read only the committed data artifact. It must never perform a network call, query a metric source, or fetch live counts while the extension runs. All fetching happens exclusively in the build-time refresh step.

3. **Read-only at runtime.** The runtime must treat the data artifact as read-only input. It must not recompute, refetch, or rewrite the artifact while the extension runs.

4. **Single source preserved.** No consuming location may reintroduce a hand-maintained ordering. Any list of the supported targets that a reader or the runtime sees must trace back to the one versioned artifact.

5. **Archiving correctness unchanged.** This specification changes only the presentation and enumeration order of the supported targets. It must not change which sessions are discovered, matched, parsed, or archived, nor the correctness of any provider's matching logic. The order in which providers are presented or named must not alter archive output content for any workspace.

6. **Mechanism feasibility is a plan gate.** This specification asserts that public, queryable metric sources exist for the relevant surfaces — public registries for command-line download counts, the editor marketplaces for extension install counts, and a public code host for repository stars. Command-line download signals span more than one public registry: depending on the target, a command-line tool is distributed and counted on a JavaScript package registry or on a Python package registry, and the feasibility check must cover both registry shapes rather than assuming a single command-line source. The specification deliberately defers verification of the exact endpoints, the per-target identifiers (registry package names, marketplace item names, alternate-registry namespaces, code-host owner and repository), the rate limits, and any authentication need to a plan-stage feasibility gate. The implementation plan must confirm, per target and per surface, that the asserted source is reachable and identify the concrete identifier before implementation begins; where a source cannot be confirmed, the plan must resolve the gap (treat the surface as absent under the missing-surface tolerance, or escalate) rather than guessing. The per-target surfaces believed available are inventoried in Surface assumptions, and each entry there is subject to this plan-gate verification.

7. **Per-source validity contract.** The plan gate must define, per data source, a validity contract: the expected field is present, its value is numeric and at least zero, and the response is within a maximum acceptable age or freshness bound. Any response that fails its validity contract must be treated as an absent signal — excluded under the missing-surface rule — and must never be recorded as authoritative. This covers reachable-but-wrong responses: a successful HTTP status carrying malformed or partial data, schema drift, throttled zeros, and stale cached values.

8. **Build-time credential handling.** Where a data source requires authentication — for example a repository-stars API token — the plan gate must specify build-time credential handling: a read-only token of minimal scope, stored as a continuous-integration secret, with a rotation policy. No credential may be embedded in the shipped extension or in the committed data artifact.

9. **Provider-registry order-sensitivity audit.** The plan gate must audit the provider registry for any order-sensitive matching, lookup, discovery, or archiving path, and the implementation must include a swap-invariance regression test proving that reordering the providers does not change which sessions are discovered, matched, or archived. This protects the archiving-isolation claim (Constraint 5) against a presentation-order change leaking into provider behavior.

10. **Artifact format and location are a plan concern.** This specification defines that exactly one versioned artifact exists and what it must record. The artifact's concrete format, schema, and path, the score formula and weights, the metric endpoints, and the refresh tooling are implementation-plan and StepLedger decisions, not part of this specification.

11. **Coupling rationale — documentation completeness and ordering ship together.** Expanding the README from five documented assistants to all eight, and introducing the ordering mechanism, are kept in this one specification because the ordered listing of all eight targets is a single coherent deliverable. The missing-surface graceful-degradation behavior means no single data-source feasibility failure can block delivery: a target with no obtainable signal still receives a deterministic position, so the documentation-completeness value is not held hostage to the success of any individual data source.

## Surface assumptions (to be verified at plan gate)

This inventory is illustrative. It records the per-target surfaces believed available as the starting assumption for the plan-stage feasibility gate (see Constraints, item 6). It is not normative: once the plan-gate verification completes, the versioned data artifact supersedes this list as the authoritative record of which signals each target actually has. The ordering must remain well-defined for every target regardless of how the verification resolves each entry, because missing-surface tolerance excludes any signal that is confirmed absent or that fails its validity contract.

- **Claude Code** — command-line tool (public registry download count); editor extension (marketplace install count); source repository (star count).
- **Cline** — editor extension (marketplace install count); source repository (star count); no command-line tool.
- **GitHub Copilot Chat** — editor extension (marketplace install count); command-line download count only if a public one exists; closed source, so no public repository star count.
- **OpenAI Codex** — command-line tool (public registry download count); editor extension (marketplace install count); source repository (star count).
- **OpenCode** — command-line tool (public registry download count); editor extension (marketplace install count) if one is published; source repository (star count).
- **Aider** — command-line tool distributed on the Python package registry rather than the JavaScript package registry, so its command-line download count comes from the Python registry, not the JavaScript one; source repository (star count); no first-party editor extension, only third-party, so no first-party extension install count.
- **RooCode** — editor extension (marketplace install count); source repository (star count); no command-line tool.
- **Continue** — editor extension (marketplace install count); source repository (star count); command-line download count only if a public command-line tool exists.

## Error handling

1. When a signal source is unreachable, returns no value, or returns a response that fails its validity contract (see Constraints, item 7) during a refresh, the refresh step must record the signal as absent for that target and continue. Such a source must not abort the refresh, must not corrupt the artifact, must not be recorded as authoritative, and must not leave a target without a score (the missing-surface tolerance applies).

2. When the data artifact is older than the monthly cadence, the runtime must continue to resolve the order from the recorded data; staleness is a detectable, non-blocking condition surfaced through the monthly refresh pull request (see Staleness behavior). Stale data is a usable state, not an error.

3. The runtime ordering must never fail because of a missing or absent signal. A target with one or more absent signals must always resolve to a defined position via the documented aggregation and tie-break.

4. A committed refresh later found to contain wrong data is recoverable by reverting to the prior known-good versioned artifact through version control. Because the runtime always reads whatever committed artifact is present and never recomputes it, reverting restores the prior order with no effect on the runtime's deterministic ordering behavior. The plan gate may additionally adopt a sanity bound — for example a cap on the month-over-month order change — that, when exceeded, holds the refresh pull request for human attention rather than proposing it automatically.

## Acceptance criteria

1. Exactly one versioned artifact holds the popularity data and the derived order; the README enumerations and the runtime presentation order both derive from that single artifact, with no second hand-maintained ordering in any consuming location.

2. The resolved order is a stable total order over the eight supported targets — the full set instantiated in the runtime provider registry — produced by ascending average normalized position, with an alphabetical tie-break by canonical target name for exact equalities, collated case-insensitive ASCII lexicographic ascending over the enumerated canonical names (Aider, Claude Code, Cline, Continue, GitHub Copilot Chat, OpenAI Codex, OpenCode, RooCode). The documented method fully determines every per-signal rank, including targets with equal raw values on a signal (resolved by dense ranking), the normalized positions, and the resulting order; it produces an identical order across repeated builds from the same data, independent of input or iteration arrangement.

3. Each target's score is the average of its normalized per-signal positions, computed only over the signals it possesses; for each signal the possessing targets are ranked with rank 1 most popular, equal raw values share a rank under dense ranking, and each rank is normalized to a pool-size-comparable position (best end most popular) before averaging; averaging makes the score neutral to the _count_ of signals a target possesses (not a claim of neutrality with respect to pool size); the method admits no raw-magnitude dominance, and the documented method recomputes every per-signal rank, normalized position, score, and the resulting order from the recorded raw signals alone, independent of input order.

4. The data artifact ships with the documented acknowledgment of the scoring method's pool-size property — that a target best within a thinly-possessed signal attains the top relative position on that signal, an accepted residual of rank-based aggregation that discards magnitude for robustness.

5. A target with a missing or unavailable signal — an assistant with no command-line tool, a closed-source assistant with no public repository, an assistant with no first-party editor extension, or an assistant whose command-line surface is uncertain — receives a well-defined score and a deterministic position; the absent signal is unconditionally excluded by not participating in that signal's ranking, with no error, gap, or undefined value produced anywhere in the ordering.

6. The data artifact records, per target, the raw signals used, the source of each signal, and the refresh timestamp or period; the recorded data plus the documented method are sufficient to recompute every per-signal rank, normalized position, and score, with every per-signal rank fully determined — including ties on equal raw values — independent of input order.

7. An archive cycle and any runtime ordering operation perform no network call and query no metric source; the runtime reads only the committed data artifact.

8. The build-time refresh step is repeatable: run against the same external state it produces the same recorded signals and scores; a refresh that finds no change leaves the resolved order unchanged and the artifact records the refresh period.

9. The README "Supported assistants" table documents all eight supported targets — one row per target — and every prose enumeration and every count claim names all eight and reports the count as eight; the table, the enumerations, and the count claims list the targets in the same order the runtime presents them, and that order matches the single source. No README enumeration or count claim states a smaller set or a smaller number than the eight targets the runtime registry instantiates.

10. The monthly refresh cadence and the aggregation method are documented alongside the data, and staleness (data older than the cadence) is detectable from the recorded refresh timestamp or period while the order still resolves deterministically.

11. The change introduces no new runtime dependency: the shipped, running extension continues to depend only on the VS Code API, and the refresh tooling lives entirely at build time.

12. A new supported target added later is ranked by the same parameter and aggregation and slots into the order by its score, with no manual position assignment and no special-casing.

13. Archiving correctness is unaffected: which sessions are discovered, matched, parsed, and archived for any workspace is unchanged; only the presentation and enumeration order of the supported targets changes.

14. The monthly refresh proposes its order and README changes through a pull request rather than pushing them to the published branch directly; the order change reaches the published branch only after the project's existing human merge authorization.

15. A response that is reachable but fails its validity contract — a successful status carrying malformed or partial data, schema drift, a throttled zero, or a stale cached value — is recorded as an absent signal under the missing-surface rule and never as an authoritative value.

16. The month-over-month change to the data artifact produced by a refresh is auditable as a version-control diff that names every changed signal and score, consistent with the recorded-provenance requirement.

17. A committed refresh found to contain wrong data is recoverable by reverting to the prior known-good versioned artifact through version control, after which the runtime resolves the prior order with no change to its deterministic ordering behavior.

18. The provider registry has no order-sensitive matching, lookup, discovery, or archiving path: a swap-invariance regression test demonstrates that reordering the providers does not change which sessions are discovered, matched, or archived for any workspace.

19. Adding a ninth supported target touches only the data artifact and the build-time refresh step — the new target is ranked by the same parameter and aggregation — with no special-casing anywhere else.

20. The auto-generated nature of the data artifact and the procedure for running the refresh are discoverable from the repository surface, for example a documented command and a corresponding continuous-integration job.

21. The maintenance owner for the monthly refresh and the acceptable-staleness window are resolved at the plan gate; the specification requires only that both exist and be documented.

## Out of scope

1. The actual current numeric popularity values and the resulting concrete order. These are an execution output of the build-time refresh, produced and updated by the monthly fetch, not fixed by this specification.

2. Any change to the session-archiving logic, the workspace-matching logic, or the normalized-model mapping. This specification changes presentation and enumeration order only; archiving correctness is unchanged.

3. Any change to which assistants the runtime supports. The set of supported targets — the eight providers the registry instantiates — is unchanged by this specification; this specification governs the order in which those eight targets are presented and ensures the documentation describes all eight, but it does not add or remove any provider. Expanding the README to document Aider, RooCode, and Continue records providers that are already supported in the runtime; it is a documentation-completeness change, not a membership change.

## Open questions

None. The aggregation method is fully fixed at the specification level: rank-based, with dense ranking for equal raw values, each per-signal rank normalized to a pool-size-comparable relative position whose pool basis is the set of targets that possess the signal (best end most popular, sole possessor at the best end), average-of-normalized-positions scoring computed only over the signals a target possesses, ascending order, and an alphabetical canonical-name tie-break collated case-insensitive ASCII lexicographic ascending. Every behavioral property of the method — the pool basis, the dense-ranking resolution, the degenerate single-possessor value, the averaging, the ordering direction, and the tie-break — is pinned here, so neither the aggregation method nor the tie-break is open. What remains deferred to the implementation plan as mechanism is only the exact normalization arithmetic — the formula, the denominator, and the numeric representation that realize the fixed property — and deferring that mechanism does not reopen the method: a fixed method and a plan-gated formula are consistent, because the formula is one of several arithmetic realizations of the single behavioral contract the specification fixes. The artifact format and path, the metric endpoints, the per-target identifiers, the per-source validity contracts, the credential handling, the refresh tooling, and the specific maintenance owner and acceptable-staleness window are likewise not open questions at the specification level — they are deferred to the implementation plan (see Constraints), and the specification fixes the required properties those plan decisions must satisfy. The per-target surface availability is recorded in Surface assumptions as illustrative, with each entry marked for confirmation at the plan-stage feasibility gate (see Constraints, item 6).

## Revision history

2026-06-22 — Initial draft. Defines a per-target popularity parameter as the single governing input to the order in which the supported assistants are named, listed, and enumerated across documentation and runtime. Specifies the aggregation model (magnitude-normalized at this stage — superseded by the rank-based model, see the later entries — no raw-magnitude dominance, documented and reproducible, deterministic), missing-surface tolerance, deterministic total order with documented tie-break, a single versioned source of truth consumed by both docs and runtime, recorded provenance, monthly build-time refresh, staleness behavior, and the zero-runtime-dependency and no-network-at-runtime constraints. Defers score formula, artifact format/path, metric endpoints, and per-target identifiers to a plan-stage feasibility gate.

2026-06-22 — Scope widened by Human decision from the five documented assistants to all eight targets instantiated in the runtime provider registry: Claude Code, Cline, GitHub Copilot Chat, OpenAI Codex, OpenCode, Aider, RooCode, and Continue. The popularity ordering is now a stable total order over all eight. Adds the requirement that the README document all eight — table, prose enumerations, and count claims — closing the documentation-versus-runtime gap for the previously undocumented Aider, RooCode, and Continue. Extends the plan-gate surface inventory with the three new targets (Aider's command-line tool counted on the Python package registry rather than the JavaScript one, no first-party editor extension; RooCode editor extension only, no command-line tool; Continue editor extension with an uncertain command-line surface) and records that command-line download signals now span more than one public registry. Confirms the missing-surface tolerance covers the new shapes — absent or uncertain signals excluded, well-defined score, no error.

2026-06-22 — Revised after a multi-perspective review gate. Dispositioned decisions: fixed the tie-break at the specification level as alphabetical by canonical target name, ascending, and closed the corresponding open question (A1); replaced the magnitude-normalization framing with a rank-based aggregation model — per-signal ranks, average-rank scoring computed only over signals a target possesses, ascending order, scale-invariant by construction, retiring the now-intrinsic normalization and no-dominance properties (A2); added a per-source validity contract obligating the plan gate to define presence, numeric/non-negative, and freshness checks, with any failing response treated as an absent signal rather than authoritative (A3); required the monthly refresh to propose order and README changes via a pull request gated by the existing human merge authorization rather than pushing to the published branch (A4); added a bad-data recovery clause — revert to the prior known-good versioned artifact, with an optional plan-gate month-over-month order-change sanity bound (A5); added the reader-outcome rationale for popularity ordering (A6); kept documentation completeness and the ordering mechanism bundled with an explicit coupling rationale (A7); and added the public-ranking transparency acknowledgment (A8). Automatic corrections: build-time credential handling for authenticated sources (BK-006); a provider-registry order-sensitivity audit plus a swap-invariance regression test (BK-007); an auditable-version-control-diff criterion for the monthly delta (WT-004); consistent staleness behavior surfaced through the refresh pull request, removing unbacked human-attention actor language (WT-005); relocation of the per-target surface inventory into a dedicated illustrative "Surface assumptions" section superseded by the versioned artifact (WT-006/GR-007); consolidation of duplicated determinism, single-source, missing-surface, and staleness statements into one canonical statement each with cross-references (GR-002 through GR-006); a designated maintenance owner and acceptable-staleness window for the monthly refresh (OR-003); an extensibility criterion for adding a ninth target (OR-005); and a discoverability requirement for the data artifact and refresh procedure (OR-007). Made missing-surface exclusion unconditional and aligned it with the functional requirement and acceptance criteria.

2026-06-22 — Third revision after focused re-verification confirmed the prior seven blockers closed and flagged two new determinism issues from the rank-based switch plus minor items. Added a within-signal tie rule (dense ranking: targets with equal raw values on a signal share a rank, the next distinct value takes the immediately following rank with no gap), so every per-signal rank is fully determined independent of input order. Corrected the cardinality-neutrality claim: averaging is now stated as neutral to the count of signals a target possesses only, with the unqualified pool-size neutrality claim removed; added a requirement that each per-signal rank be normalized to a pool-size-comparable relative position (best end most popular, comparable across pools of differing size, deterministic and reproducible) before averaging, with the exact normalization formula, denominator, and arithmetic deferred to the plan gate as mechanism. Added an accepted-trade-off acknowledgment that a target best within a thinly-possessed signal still attains the top relative position — an accepted, documented property of rank-based aggregation — and a matching acceptance criterion that the data artifact ships with this acknowledgment. Enumerated the eight canonical target names (Aider, Claude Code, Cline, Continue, GitHub Copilot Chat, OpenAI Codex, OpenCode, RooCode) and fixed the tie-break collation as case-insensitive ASCII lexicographic ascending, referenced from the deterministic-total-order requirement and the acceptance criteria. Named the plan gate as the resolution point for the maintenance owner and the acceptable-staleness window. Annotated the initial-draft revision entry to note its magnitude-normalized model is superseded by the rank-based model. Updated AC2, AC3, AC5 (now AC6) and the open-questions disposition for full internal consistency; total acceptance criteria now twenty-one.

2026-06-22 — Fourth revision after a focused re-review. Pinned two behavioral-contract properties of the normalization step in the Aggregation model (CORE-1): the normalization pool basis is the set of targets that possess the signal — its count — never the global set of eight, so an absent target perturbs neither the ranks nor the normalized positions of the participating targets; and a target that is the sole possessor of a signal takes the best-end normalized position on that signal, the limit case of the §6 accepted trade-off, which also removes any undefined value for a pool of size one. The exact normalization formula remains deferred to the plan gate. Made AC4 testable (BK-004) by keeping only the inspectable clause — the data artifact ships the documented pool-size acknowledgment — and relocating the untestable most-recognizable-first reader-experience aspiration into the non-normative §6 rationale where it conceptually lives. Reconciled the Open questions section (BK-005) to state that the aggregation method is fully fixed at the specification level — including the now-pinned pool basis and degenerate single-possessor value — with only the exact normalization arithmetic and numeric representation deferred to the plan gate as mechanism, and clarified that a fixed method and a plan-gated formula are consistent. No acceptance criterion added or removed; total remains twenty-one.
