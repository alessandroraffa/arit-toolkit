---
title: 'Enriched turn metadata in session archives'
initiative: INIT-001-enriched-session-metadata
status: 'draft'
workspaces: []
created: 2026-03-15
references:
  - docs/specifications/SPEC-001-enriched-turn-metadata.md
  - docs/initiatives/INIT-001-enriched-session-metadata.md
---

## Business requirements and constraints

Per SPEC-001, the plan must satisfy these requirements:

- The normalized turn model gains three optional fields: timestamp (ISO 8601 string), agent name (kebab-case string), and skill name (string).
- The role label for all non-user turns changes from "Assistant" to "Agent" (unconditional, all providers). When an agent name is present, the label becomes "Agent(agent-name):".
- The renderer conditionally displays timestamp (human-readable, adjacent to the role label), agent name (in the role label), and skill name (as a visible annotation before content sections). Absent fields produce no placeholder output.
- Only parsers for providers whose source format contains the data populate the new fields. Other parsers leave them undefined with no code changes required.
- Invalid timestamps are treated as absent. Empty or whitespace-only agent names and skill names are treated as absent.
- The fields are independent: any combination of present/absent must render correctly.

**Constraints from the project's TypeScript configuration.** The `exactOptionalPropertyTypes: true` compiler option means optional properties on the normalized turn interface must be populated by omission (not by assigning `undefined`). Parsers that do not populate the new fields simply omit them from the object literal, which is the pattern already established by the `thinking` field.

## Alternatives considered

### Normalized model extension strategy

| Alternative  | Approach                                                                    | Pros                                                                                                                                                          | Cons                                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A (selected) | Add three optional properties to the existing normalized turn interface     | Consistent with the established pattern for `thinking`; no changes required in parsers that do not populate the fields; backward-compatible at the type level | Accumulates optional properties on a single interface over time                                                                                                          |
| B            | Introduce a separate metadata record type composed into the normalized turn | Cleaner grouping of metadata; could be extended independently                                                                                                 | Breaks the flat structure convention already established; requires all parsers to construct a metadata sub-object even when empty; more complex renderer access patterns |

**Selection rationale.** Alternative A follows the existing convention. The `thinking` field on the normalized turn is already optional and handled by conditional omission. Three additional optional properties maintain the same pattern without introducing structural novelty. Alternative B would require modifying every parser to construct an empty metadata object, contradicting the specification constraint that parsers without the data require no changes.

### Timestamp display format in rendered output

| Alternative  | Approach                                                                                          | Pros                                                                                                                             | Cons                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A (selected) | Format timestamps using the runtime's built-in date formatting (locale-independent, fixed format) | No external dependencies; predictable output across environments; consistent with the extension's zero-runtime-dependency policy | Less locale-aware than a dedicated formatting library                                           |
| B            | Use a date formatting library (date-fns, dayjs)                                                   | Richer formatting options; locale support                                                                                        | Adds a runtime dependency to a zero-dependency extension; overkill for a single formatting need |

**Selection rationale.** The extension has no runtime dependencies. Introducing one for timestamp formatting would break the established dependency policy for a narrow use case. A fixed human-readable format (date and time components as specified in SPEC-001) achievable with built-in APIs is sufficient.

### Role label change strategy

| Alternative  | Approach                                                                                                        | Pros                                                                                                                                                                                                  | Cons                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A (selected) | Change the role label in the renderer only, keeping the normalized model's role union as `'user'`/`'assistant'` | Minimal blast radius; the role label is a presentation concern; no changes to parser logic or the model's type union; the internal value `'assistant'` remains a stable identifier across all parsers | Semantic mismatch between internal value `'assistant'` and displayed label "Agent"                                                                                 |
| B            | Change the role union value from `'assistant'` to `'agent'` throughout the model and all parsers                | Internal and external labels aligned                                                                                                                                                                  | Requires modifying every parser and every test that constructs normalized turns; introduces churn with no behavioral gain; the internal value is never user-facing |

**Selection rationale.** The role label change is defined in SPEC-001 as a renderer-level concern. The internal model value `'assistant'` is a discriminator used by parsers and logic; renaming it to `'agent'` would require updating every parser and test for zero functional benefit. Keeping the change in the renderer isolates the breaking change to the output layer.

## Architectural decisions and rationale

1. **Extend the normalized turn interface with three optional properties.**
   Motivated by INIT-001 objectives 1, 2, and 3. The normalized turn interface gains `timestamp`, `agentName`, and `skillName` as optional string properties, following the same pattern as the existing `thinking` property. Trade-off accepted: the interface grows wider, but remains flat and consistent. Constraint: `exactOptionalPropertyTypes: true` requires population by omission rather than explicit `undefined` assignment.

2. **Change the rendered role label from "Assistant" to "Agent" in the renderer layer only.**
   Motivated by INIT-001 objective 2. The renderer maps the internal `'assistant'` role to the display label "Agent" (or "Agent(agent-name):" when an agent name is present). The internal role union `'user'`/`'assistant'` is unchanged. Trade-off accepted: semantic gap between internal and display values, offset by zero-churn in parsers.

3. **Populate the new fields in the Claude Code parser only.**
   Motivated by INIT-001 objective scope. Among the supported providers, only Claude Code's JSONL format provides timestamps (on `user` and `assistant` events), subagent identity (in `Agent` tool_use blocks via the input's `subagent_type` field), and skill invocations (in `Skill` tool_use blocks via the input's `skill` field). Other parsers (Cline/Roo Code, Codex, Copilot Chat, Continue) do not have equivalent data in their source formats and require no changes.

4. **Use built-in date formatting for timestamp display.**
   Motivated by the project's zero-runtime-dependency policy. The renderer formats ISO 8601 timestamps into a human-readable representation using built-in JavaScript date APIs. No external libraries are introduced.

5. **Validate and sanitize metadata during parsing, not rendering.**
   Motivated by SPEC-001 error handling requirements. Invalid ISO 8601 timestamps are treated as absent at parse time. Empty or whitespace-only agent and skill names are treated as absent at parse time. The renderer receives only valid values or no values, simplifying its conditional logic.

## Concern assessment

| Concern         | Classification | Addressed by | Notes                                                                                                                                                                                 |
| --------------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security        | IRRELEVANT     |              | No external APIs, no network I/O, no untrusted input beyond local session files already handled by existing parsers. The new fields are metadata extracted from the same local files. |
| Privacy         | IRRELEVANT     |              | Timestamps, agent names, and skill names are metadata from local session files the user already owns. No new data collection, storage, or sharing is introduced.                      |
| Compliance      | IRRELEVANT     |              | No regulated data categories affected.                                                                                                                                                |
| Accessibility   | IRRELEVANT     |              | No user-facing UI changes; output is markdown text.                                                                                                                                   |
| Observability   | IRRELEVANT     |              | No new services, background processes, or external dependencies.                                                                                                                      |
| Resilience      | IRRELEVANT     |              | Graceful degradation is inherent: absent fields produce no output. Decision 5 ensures invalid data is filtered at parse time.                                                         |
| Performance     | IRRELEVANT     |              | Marginal increase in string operations per turn; no measurable impact on archive generation.                                                                                          |
| AI governance   | IRRELEVANT     |              | No AI/ML components introduced or modified.                                                                                                                                           |
| i18n            | IRRELEVANT     |              | No user-facing translatable text introduced; timestamp format is locale-independent by design (decision 4).                                                                           |
| Sustainability  | IRRELEVANT     |              | No compute-intensive workloads introduced.                                                                                                                                            |
| Supply chain    | IRRELEVANT     |              | No new dependencies introduced (decision 4).                                                                                                                                          |
| Maintainability | MEDIUM         |              | Monitor during workstreams. The normalized model grows by three optional properties; the established pattern for optional fields (omission-based) keeps the impact contained.         |
| Quality         | MEDIUM         |              | Monitor during workstreams. Test coverage for the new fields and the role label change must meet the project's >=80% unit test coverage target.                                       |

## Increments

### Increment 1 — Normalized model extension and role label change

**Objective.** Extend the normalized turn interface with the three optional metadata fields and change the rendered role label from "Assistant" to "Agent". This increment establishes the data contract and the universal role label change before any parser produces the new fields.

**Dependencies.** None.

**Requirements covered.** SPEC-001: timestamp field definition (Timestamp req. 1), agent name field definition (Agent name req. 1), skill name field definition (Skill name req. 1), role label change (Role label req. 1, 2), timestamp display (Timestamp req. 2, 3), agent name display (Agent name req. 2, 3), skill name display (Skill name req. 2, 3), combination behavior (Combination req. 1, 2), graceful degradation (Constraints req. 2), provider population passivity (Provider population req. 3), role label universality (Provider population req. 4).

**Interventions.**

- Add `timestamp`, `agentName`, and `skillName` as optional string properties on the normalized turn interface in the normalized model type definitions.
- Update the renderer's role label logic to map the internal `'assistant'` role to the display label "Agent". When the turn has an `agentName`, the label becomes "Agent(agent-name):".
- Add timestamp rendering in the turn header, adjacent to the role label, formatting the ISO 8601 value into a human-readable date-time string using built-in date APIs.
- Add skill name rendering as a visible annotation before the turn's content sections. When the turn has no skill name, no annotation appears.
- Update all existing renderer tests to expect "Agent:" instead of "Assistant:" for non-user turns.
- Add new renderer tests covering: timestamp display with and without a value, agent name in the role label with and without a value, skill name annotation with and without a value, combinations of all three fields, and the empty-field graceful degradation.
- Verify that existing parsers compile without modification (the new fields are optional and require no changes in parsers that omit them).

**Verifiable output.** All unit tests pass. The rendered output for sessions with no new metadata fields is identical to the previous format except for "Agent:" replacing "Assistant:". The type checker confirms that existing parsers remain valid without changes.

### Increment 2 — Claude Code parser enrichment

**Objective.** Populate the three new metadata fields in the Claude Code parser by extracting timestamps, subagent identity, and skill invocations from the JSONL event data.

**Dependencies.** Increment 1 (the normalized model must have the new fields; the renderer must handle them).

**Requirements covered.** SPEC-001: provider population for timestamp (Provider population req. 1), provider population for agent name (Provider population req. 1), provider population for skill name (Provider population req. 1), timestamp validation (Error handling req. 1), agent name validation (Error handling req. 2), skill name validation (Error handling req. 2), provider-agnostic field formats (Constraints req. 1).

**Interventions.**

- Extend the Claude Code parser's internal event type definitions to include the `timestamp` field present on `user` and `assistant` JSONL events.
- Extract the timestamp from each `user` and `assistant` event and populate the normalized turn's `timestamp` field. Validate the value as ISO 8601 at parse time; treat invalid values as absent per SPEC-001 error handling.
- Detect `Agent` tool_use blocks (tool_use content blocks where the tool name is "Agent") and extract the subagent name from the block's `input.subagent_type` field. Convert the value to kebab-case and populate the normalized turn's `agentName` field. Treat empty or whitespace-only values as absent.
- Detect `Skill` tool_use blocks (tool_use content blocks where the tool name is "Skill") and extract the skill name from the block's `input.skill` field. Populate the normalized turn's `skillName` field. Treat empty or whitespace-only values as absent.
- Add parser unit tests covering: timestamp extraction from user and assistant events, invalid timestamp handling, subagent name extraction from Agent tool_use blocks, skill name extraction from Skill tool_use blocks, empty/whitespace name handling, and events with combinations of the new fields.

**Verifiable output.** All unit tests pass, including the new parser tests. Sessions parsed from Claude Code JSONL data with timestamps, Agent tool_use blocks, and Skill tool_use blocks produce normalized turns with the corresponding metadata fields populated. The quality gate (type check, lint, unit tests) passes.

## Risks and mitigations

- **Risk: Claude Code JSONL format variation.** The JSONL event structure for `Agent` and `Skill` tool_use blocks is based on observed data. If the actual format differs across Claude Code versions, the parser may fail to extract subagent or skill data.
  **Mitigation.** The extraction logic treats unrecognized structures as absent fields (consistent with SPEC-001 error handling). No parsing failures occur; the data is simply omitted from the archive. The parser tests should use representative JSONL samples.

- **Risk: Breaking change to existing archives.** The role label change from "Assistant:" to "Agent:" alters the output format for all providers. Users who search or post-process archived markdown files by the "Assistant:" label will need to update their workflows.
  **Mitigation.** This is an intentional breaking change documented in the initiative and specification. It affects only newly archived sessions, not existing files on disk.

## Open items at completion

_No open items — to be filled during Plan Completion Verification._
