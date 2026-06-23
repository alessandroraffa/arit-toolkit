---
title: 'One governing order for the supported assistants'
initiative: INIT-006-assistant-popularity-ranking
status: 'active'
created: 2026-06-22
references:
  - docs/specifications/SPEC-004-assistant-popularity-ranking.md
---

## Objectives

1. A single governing order exists for the supported assistants — one objective, reproducible ordering that determines how all eight (Claude Code, Cline, GitHub Copilot Chat, OpenAI Codex, OpenCode, Aider, RooCode, and Continue) are named, listed, and enumerated everywhere they appear, in the documentation and in the extension runtime alike.
2. That order derives from one versioned source consumed by both documentation and runtime, so a reader and the running extension always see the same sequence and no location can drift from another.
3. The order is automated and self-refreshing under minimal human ownership — refreshed on a recurring cadence from public signals and merged by a designated owner within an acceptable-staleness window — so the most-recognizable assistants surface first and stay current without per-release manual editing, yet the order is owned rather than ownerless, and a newly supported assistant takes its place by the same objective measure rather than by a hand-assigned position.
4. The documentation describes the extension as it actually is: every supported assistant is documented, closing the gap between what the README states and what the extension supports.

## Motivation

The order in which the supported assistants appear is, today, fixed by hand and repeated independently in every place they are mentioned — the README's assistants table, each prose sentence that lists them, the runtime's enumeration of providers, and the way they are named in logs and archive output. No rule governs why one assistant precedes another, and no single place defines the order, so the separate copies drift apart over time and every change has to be made by hand in many locations.

The documentation also understates the extension. The runtime already supports eight assistants, but the README documents only five; three supported assistants — Aider, RooCode, and Continue — go unmentioned, so a reader cannot tell from the documentation what the extension actually covers.

These costs are recurring rather than one-off. Each release risks a fresh divergence between the hand-maintained lists, and the documentation-versus-reality gap widens as the runtime grows. Resolving both together is worthwhile now: it replaces recurring manual maintenance with an order that maintains itself under minimal ownership, removes the drift by giving every location one source to read from, and closes the documentation gap so the README finally matches the runtime.

**Cost justification.** The recurring per-release manual edits this order replaces silently drift and understate what the extension supports, so the standing maintenance cost they impose grows with every release; a self-refreshing order pays that cost down once and keeps it down. The new monthly refresh obligation is a deliberately better trade than those per-release edits, not an addition on top of them.

**Why popularity, and why bundled with documentation.** A fixed alphabetical single-source order would also eliminate the drift at near-zero cost, but it was rejected: a popularity order is the deliberate choice because surfacing the most-recognizable, most-used assistants first reduces the reader's scan cost, while remaining just as objective and automatable as an alphabetical one. Documentation completeness (five documented assistants to eight) is bundled with the ordering mechanism because the order governs the listing itself, and graceful degradation means no single data-source failure can block the documentation value (per [SPEC-004](docs/specifications/SPEC-004-assistant-popularity-ranking.md) Constraint 11): an assistant with no obtainable signal still receives a defined position, so the eight-assistant documentation is never held hostage to any one data source.

**Reputational posture.** Publishing a perpetual, named, ordered ranking of eight third-party commercial coding tools — some of them competitors — on a public README carries reputational exposure: a vendor or a member of the community may object to the ranking or perceive its order as an editorial position. The project's posture is that the order is a transparent, objective, reproducible measure computed from public signals (command-line downloads, editor-extension installs, and repository stars), documented and auditable from version-control history; it is explicitly not an endorsement, a recommendation, or a quality judgment of any assistant. The not-an-endorsement disclaimer and a pointer to the documented method must be co-located with every public surface of the ranking — the README table and the published data artifact — and not left to live only in this initiative or in SPEC-004, so a reader meets the disclaimer wherever they meet the order. Objections and corrections are handled through the project's normal issue and pull-request channel, owned by the project maintainer.

The recurring human-merge gate over the monthly refresh is a dual governance-and-editorial checkpoint, not a clean-diff check. Before publishing a ranking change the approver — the maintainer — applies editorial judgment: confirming the new order is sensible and appropriate to publish — no anomalous reordering from a data glitch, sanity bounds respected, the supported set still correct — rather than merely verifying that the diff applies cleanly. Publishing a refreshed third-party ranking is itself a deliberate, accepted extension of the project's public surface beyond its core session-archiving mission; this initiative takes on that extension knowingly.

[SPEC-004](docs/specifications/SPEC-004-assistant-popularity-ranking.md) defines the behavior, constraints, and acceptance criteria this order must satisfy; this initiative establishes why that order is worth having.

## Scope

Included:

- A single governing order for the eight supported assistants, derived from an objective popularity measure, that determines how they are named, listed, and enumerated wherever they appear
- One versioned source for that order, read by both the documentation and the extension runtime, so the two never diverge
- Recurring, self-refreshing maintenance of the order from public signals under minimal human ownership — a designated owner reviews and merges the monthly refresh within an acceptable-staleness window — keeping it current without per-release manual editing
- Automatic placement of any future supported assistant by the same objective measure, with no hand-assigned position
- Expanded documentation that describes all eight supported assistants, closing the gap for the currently undocumented Aider, RooCode, and Continue
- A not-an-endorsement disclaimer and a pointer to the documented method co-located with every public surface of the order, so the order reads everywhere as an objective relevance measure rather than a quality judgment

Excluded:

- Any change to which assistants the extension supports — the set of eight is unchanged; documenting Aider, RooCode, and Continue records assistants that are already supported, not new ones
- Any change to session archiving correctness — which sessions are discovered, matched, parsed, and archived for a workspace is unchanged; only the presentation and enumeration order changes
- The behavioral contracts and exclusions SPEC-004 already fixes — the determinism, provenance, isolation, zero-runtime-dependency, and no-network-at-runtime requirements, and the no-membership-change and no-archiving-change exclusions, are governed by SPEC-004 and referenced here rather than restated
- The concrete mechanism that realizes the order — the data sources, the exact normalization formula and arithmetic realization, the artifact's format and location, and the refresh tooling are deferred to the implementation plan; SPEC-004 already fixes the aggregation method, so only the formula is plan-gated

## Success criteria

These are strategic, product-level outcomes; the behavioral contracts that make each one verifiable are SPEC-004's acceptance criteria, referenced rather than restated here.

- [ ] A reader and the running extension always encounter the supported assistants in the same single order, with the most-recognizable assistants first — observable as a README table and runtime enumeration that present the eight assistants in one identical sequence (per SPEC-004 acceptance criteria for single-source ordering)
- [ ] No location of the order can silently drift from another, because every location reads the one versioned source rather than a hand-maintained copy
- [ ] The order stays current without per-release manual editing, while remaining owned: the designated maintenance owner merges the monthly refresh within the acceptable-staleness window, and no order change reaches the published branch except through the maintainer's governance-and-editorial merge (per SPEC-004 acceptance criteria for the build-time refresh, maintenance ownership, and human-merge gate)
- [ ] Every public surface of the order carries the not-an-endorsement disclaimer and a pointer to the documented method, so the ranking reads as an objective relevance measure wherever it appears
- [ ] Every public surface of the order carries an "as of `<last refresh>`" marker, so if the maintenance owner lapses the staleness is self-evident to a reader rather than hidden behind an order that still implies currency
- [ ] A future supported assistant takes its place by the same objective measure with no hand-assigned position and no special handling — an outcome confirmed by regression test at delivery (per SPEC-004 acceptance criteria for extensibility)
- [ ] The documentation describes all eight supported assistants, including the previously undocumented Aider, RooCode, and Continue, so the README matches what the runtime supports
