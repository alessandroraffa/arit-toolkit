---
title: 'OpenCode as a first-class archiving source'
initiative: INIT-005-opencode-provider
status: 'in-progress'
created: 2026-06-22
references:
  - docs/specifications/SPEC-003-opencode-session-provider.md
---

## Objectives

1. Make OpenCode sessions first-class archived artifacts in the workspace — discovered, normalized, and rendered through the same pipeline as every other supported assistant — so that work done in OpenCode becomes versioned, reviewable project material.
2. Achieve this while preserving the four properties that define the archiving feature's value: zero configuration (auto-discovery), read-only and non-disruptive operation, single-package cross-platform portability, and a provider-agnostic normalized model that leaves existing providers untouched.
3. Extend the feature's ingestion path — minimally and additively — to accommodate a source whose sessions live in a single shared store rather than as one file per session, without forking the pipeline or breaking the shared parsing contract that other providers rely on.

## Motivation

The archiving feature's premise is that AI coding sessions scattered across the filesystem should be collected into the workspace as versioned artifacts. It already covers Claude Code, Cline, GitHub Copilot Chat, and Codex. OpenCode — the open-source terminal coding agent — is absent: a user who runs OpenCode in a workspace produces sessions that Tangyr cannot see, so that work is neither versioned with the code nor visible to the team. Closing this gap advances the feature's stated direction of broadening assistant coverage.

OpenCode is not a "one more flat-file parser" addition, which is why it warrants explicit governance rather than an ad-hoc change. It persists all sessions for all projects in a single shared, concurrently-written store, and that single fact ripples through discovery, workspace matching, ingestion, change detection, failure isolation, and packaging — captured behaviorally in [SPEC-003](docs/specifications/SPEC-003-opencode-session-provider.md). Three consequences shape this iteration's risk posture:

- **A new dependency class.** Reading that store introduces the project's first database-class dependency — a packaging and supply-chain posture change a flat-file parser never carried.
- **Schema coupling to a moving target.** The provider is coupled to OpenCode's store schema at a known version, and OpenCode is actively developed; a future schema change is the most likely long-tail failure. Schema-version detection, routed to the same out-of-scope "detect and signal" path, is therefore a required plan output rather than an afterthought.
- **A shared store raises the cost of a matching error.** Because the store holds every project's sessions, a workspace-matching false positive does not merely pick a wrong file — it would write another workspace's sessions into this workspace's version-controlled material. Exact matching is thus a confidentiality requirement, not arbitrary strictness.

The value is concrete and the risk is contained: the source is read-only, the normalized model and renderer already exist unchanged, and the marginal new surface beyond resolving the access mechanism is small. The one genuine unknown — a store-access mechanism that is simultaneously portable and journal-correct — is isolated as an explicit plan gate (SPEC-003 Constraints item 6). **This iteration is explicitly conditioned on that gate resolving favorably:** if no mechanism can satisfy both portability and journal-correctness, the iteration pauses for a human decision before implementation rather than silently relaxing either property.

## Scope

Each included item maps to at least one success criterion below; the criteria are strategic outcomes that reference SPEC-003's acceptance criteria rather than restating them.

Included:

- An OpenCode provider that discovers the shared store via OpenCode's platform-standard data-directory convention (cross-platform, honoring its documented overrides), matches sessions to the current workspace by recorded working directory, and presents each matched session as an independently parseable unit
- An OpenCode parser that maps OpenCode's recorded session content to the existing normalized model (turns, tool calls, thinking, subagents, compaction, enriched metadata)
- A minimal, additive extension of the archiving ingestion path so a non-file-per-session source flows through the existing parse-and-render pipeline without breaking the shared contract other providers rely on
- Per-session failure isolation, and workspace-scoped change detection that is correct across the shared store
- Graceful handling of the absent-store case (silent no-op) and "detect and signal" handling for any store outside the supported scope
- Test coverage for discovery, matching, mapping, change detection, isolation, and the out-of-scope and absent-store paths

Excluded:

- Support for OpenCode's earlier flat-file (per-session JSON) layout and for the separate OpenCode desktop application's store — and, more generally, any store outside the scope SPEC-003 supports (detected and signalled, not parsed)
- Any change to the normalized session model's shape or to the markdown output format
- Any change to the behavior of the existing providers (Claude Code, Cline, Copilot Chat, Codex)
- Bidirectional sync, OpenCode configuration, or any write back to the OpenCode store

## Success criteria

- [ ] A user running OpenCode in a workspace gets those sessions archived automatically, with zero configuration, alongside other providers' archives
- [ ] No session belonging to another workspace ever appears in the current workspace's archives
- [ ] An archived OpenCode session is a faithful, readable record — its tool use, reasoning, subagents, and compaction all present — indistinguishable in quality from other providers' archives
- [ ] Archiving never disturbs OpenCode: the store is byte-unchanged and OpenCode need not be stopped, even under concurrent use
- [ ] Updated sessions are re-archived, a single unreadable session never blocks the others, and unrelated activity in other workspaces causes no archive churn
- [ ] An absent store is a silent no-op; an out-of-scope store yields no error and a single non-intrusive signal
- [ ] The addition ships in the single cross-platform package with no per-platform build step
- [ ] The existing providers' behavior and output are unchanged
