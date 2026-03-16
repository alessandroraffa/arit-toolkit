---
title: 'Enriched turn metadata in session archives'
initiative: INIT-001-enriched-turn-metadata
status: 'draft'
created: 2026-03-15
references:
  - docs/specifications/SPEC-001-enriched-turn-metadata.md
---

## Objectives

1. Provide chronological context in archived sessions by surfacing per-turn timestamps when the source provider supplies them.
2. Distinguish agent identity in archived sessions by replacing the generic "Assistant" label with "Agent" and, when known, including the subagent name in the role label.
3. Surface skill invocations as visible annotations in archived sessions when the source provider supplies them.

## Motivation

The agent sessions archiving feature currently produces markdown archives that lack temporal and identity context. All non-user turns are labelled "Assistant" regardless of whether they were produced by the main agent or a delegated subagent. Timestamps present in the source data are discarded during normalization. Skill invocations are indistinguishable from regular tool calls.

This makes archived sessions harder to use for post-session review: without timestamps, the reader cannot reconstruct the pace or sequence of events; without agent identity, delegation boundaries are invisible; without skill annotations, the reader cannot identify which parts of the session were driven by structured workflows.

The normalized model already supports optional fields (e.g., `thinking`). Extending it with three additional optional fields and changing the role label from "Assistant" to "Agent" enables richer archives from providers that supply this data, while preserving the current output structure for providers that do not.

## Scope

Included:

- Extension of the normalized turn model with optional `timestamp`, `agentName`, and `skillName` fields
- Change of the non-user role label from "Assistant" to "Agent" across all providers (breaking change)
- Integration of `agentName` into the role label as `Agent(agent-name):`
- Kebab-case normalization for both agent name and skill name values at parse time
- Renderer updates to conditionally display timestamp, agent name, and skill name
- Parser updates for providers that have the data available in their source format
- Test coverage for the new fields and the role label change

Excluded:

- Changes to session discovery, file watching, or archive service orchestration
- Changes to the provider registration or session file metadata
- Retroactive re-archiving of existing markdown files
- Addition of metadata fields beyond the three specified (timestamp, agentName, skillName)

## Success criteria

- [ ] All archived non-user turns use "Agent:" or "Agent(agent-name):" as the role label
- [ ] Archived sessions from providers with timestamp data display human-readable timestamps in turn headers
- [ ] Archived sessions from providers without timestamp data produce no empty timestamp placeholders
- [ ] Subagent delegation is visible as `Agent(agent-name):` in archived sessions from providers that supply agent identity
- [ ] Skill invocations appear as visible annotations in archived sessions from providers that supply skill data
- [ ] Existing parsers that do not populate the new optional fields continue to function without modification
