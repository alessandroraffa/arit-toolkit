---
title: 'Agent session archiving — enriched turn metadata'
spec: SPEC-001
status: 'draft'
workspaces: []
created: 2026-03-15
references:
  - Existing agent sessions archiving feature (agentSessionsArchiving)
---

## Introduction

The agent sessions archiving feature converts provider-specific session formats into a normalized model, then renders the normalized model as a markdown archive. The current normalized turn captures role, content, tool calls, thinking, and file lists — but omits contextual metadata that some providers make available: when a turn occurred, whether it involved delegation to a subagent, and whether it involved a skill invocation.

This specification defines three optional fields that extend the normalized turn model and a change to the role label for non-user turns. These fields are provider-agnostic: every provider produces turns that may or may not include them. The markdown renderer must incorporate present values and omit absent ones without leaving empty sections or placeholder text.

This specification introduces a breaking change: the role label "Assistant" is replaced by "Agent" in all rendered markdown output, across all providers.

## Functional requirements

### Timestamp

1. The normalized turn model must support an optional timestamp field representing the moment the turn occurred. The value must be an ISO 8601 timestamp string.

2. When a turn has a timestamp, the rendered markdown output must display it as part of the turn header, adjacent to the role label. The exact visual format must be human-readable (not raw ISO 8601) and must include date and time components.

3. When a turn does not have a timestamp, the turn header must render with only the role label — no empty placeholder, no label without a value.

### Role label

1. The rendered markdown output must use "Agent" as the role label for all non-user turns. The previous label "Assistant" is replaced across all providers. This is a breaking change to the archive format.

2. When a turn has an agent name, the role label must include the agent name in kebab-case within parentheses: `Agent(agent-name):`. When a turn does not have an agent name, the role label must be `Agent:`.

### Agent name

1. The normalized turn model must support an optional agent name field representing the name of a subagent to which the turn was delegated. The value must be stored in kebab-case.

2. When a turn has an agent name, it must be rendered as part of the role label (see Role label, requirement 2). No separate annotation section is needed.

3. When a turn does not have an agent name, the role label must render as `Agent:` with no parenthetical — no empty parentheses, no placeholder.

### Skill name

1. The normalized turn model must support an optional skill name field representing the name of a skill that was invoked during the turn.

2. When a turn has a skill name, the rendered markdown output must display it as a visible annotation within the turn, clearly associating the turn content with the named skill. The annotation must appear before the turn's content sections.

3. When a turn does not have a skill name, no skill-related annotation must appear in the rendered output.

### Combination behavior

1. The timestamp, agent name, and skill name fields are independent. A turn may have any combination of the three fields present or absent (including all three present, or none).

2. When multiple metadata fields are present on the same turn, they must all appear in the rendered output. Their visual placement must be consistent and predictable regardless of which combination is present.

### Provider population rules

1. Parsers for providers that have timestamp, agent name, or skill name data available in their source format must populate the corresponding fields in the normalized turn.

2. Parsers for providers that do not have these data available must leave the corresponding fields undefined. Parsers must not synthesize or infer values that are not present in the source data.

3. Adding these optional fields to the normalized model must not require changes to parsers that do not populate them — the fields must be optional at the type level, defaulting to undefined when omitted.

4. The role label change from "Assistant" to "Agent" applies to all providers unconditionally — it is a renderer-level change, not a parser concern.

## Constraints

1. The normalized turn model must remain provider-agnostic. The field names and value formats must not encode provider-specific semantics. Any provider that has equivalent data must be able to populate the same fields.

2. The markdown output format must degrade gracefully. A session where no turns have any of the three optional fields must produce output identical to the current format except for the role label change ("Agent" instead of "Assistant").

3. The timestamp format in the normalized model must be ISO 8601. The rendered display format is a presentation concern and may differ from the stored format, but must preserve the full date and time precision available in the source.

## Error handling

1. When a parser encounters a timestamp value that is not valid ISO 8601, the parser must treat the timestamp as absent for that turn rather than failing the entire session parse.

2. When a parser encounters an agent name or skill name value that is empty or whitespace-only, the parser must treat the field as absent for that turn.

## Acceptance criteria

1. All rendered non-user turns must use "Agent:" or "Agent(agent-name):" as the role label — "Assistant:" must not appear in any newly archived session.

2. A session archived from a provider that supplies timestamps must produce a markdown file where each turn header includes the timestamp in a human-readable format.

3. A session archived from a provider that does not supply timestamps must produce a markdown file with no empty timestamp placeholders.

4. A session containing turns delegated to subagents must render those turns with `Agent(agent-name):` and turns without delegation with `Agent:`.

5. A session containing turns that invoke skills must display the skill name as a visible annotation on those turns, and no annotation on turns without skill invocation.

6. A session where a single turn has all three fields (timestamp, agent name, skill name) must render all three consistently within that turn.

7. Existing parsers that do not populate any of the new optional fields must continue to function without modification. Their output must use "Agent:" as the role label.

## Open questions

None at this time.

## Revision history

2026-03-15 — Initial draft.
2026-03-15 — Added role label change: "Assistant" → "Agent"/"Agent(agent-name)". Breaking change. Renumbered requirements and acceptance criteria.
