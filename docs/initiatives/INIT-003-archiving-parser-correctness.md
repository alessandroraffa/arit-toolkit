---
title: 'Agent session archiving parser correctness for Codex and Copilot Chat'
initiative: INIT-003-archiving-parser-correctness
status: active
created: 2026-03-23
references:
  - docs/reports/20260323-agent-session-archiving-inconsistencies.md
  - INIT-002-full-session-archiving (related — same feature area, different scope)
---

## Objectives

1. Archived Codex sessions faithfully represent the multi-turn structure of the original conversation, with each user message and its corresponding assistant response preserved as distinct turns.
2. Archived Copilot Chat sessions are correctly parsed regardless of whether the source file uses the VS Code serialization envelope format or the direct format, producing structured markdown in both cases.
3. Sessions with no meaningful content (no conversation turns, no substantive data) are excluded from the archive rather than persisted as empty stubs.
4. Archived sessions contain all available content sections present in the original data, including reasoning blocks when the source format provides them.

## Motivation

The agent sessions archiving feature converts raw session data from multiple AI coding providers into a standardized markdown format for post-session review and process analysis. An inconsistency analysis conducted on 2026-03-23 (see [inconsistency report](docs/reports/20260323-agent-session-archiving-inconsistencies.md)) identified two critical parser defects that cause systematic content loss during the conversion process.

The Codex parser produces at most one user turn and one assistant turn per session, regardless of the actual number of conversation exchanges. In multi-turn sessions, earlier user messages are silently discarded and tool calls from all turns are merged into a single block. This affects 22 out of 37 archived Codex sessions, with the most severe case collapsing 10 distinct user messages into one.

The Copilot Chat parser fails to recognize a serialization envelope that VS Code wraps around session data. The parser's initial parse step succeeds on the envelope object but then searches for conversation data at the wrong structural level. The result is that sessions in this format fall through to a raw-copy fallback instead of being converted to markdown. This affects 11 archived files, including one with 2.9 MB of conversation content.

Additional quality gaps compound the impact: 4 Copilot Chat sessions are archived as empty stub files containing only a header, 3 sessions show mismatches between user turns and agent responses, and 31 of 37 Codex sessions are missing reasoning sections that may be present in the source data.

Because the original session files remain intact in their provider storage locations, correcting the parsers and re-archiving affected sessions will recover all content without permanent data loss. However, until the parsers are corrected, the archive continues to produce incomplete output for every new session from these providers.

## Scope

Included:

- Correction of multi-turn conversation handling in the Codex session parser so that turn boundaries are respected and all user messages, assistant responses, and tool calls are preserved in their original sequence
- Correction of serialization envelope handling in the Copilot Chat session parser so that both envelope-wrapped and direct-format session files produce structured markdown output
- Filtering of empty or contentless sessions to prevent stub archive files with no conversation data
- Investigation and correction of missing reasoning sections in Codex session archives, contingent on confirming the data is present in the source files
- Investigation of user/agent turn mismatches in Copilot Chat session archives to determine whether the parser drops valid response content
- Re-archiving of all affected sessions after parser corrections are applied, regenerating markdown from the intact originals

Excluded:

- Changes to session discovery, provider detection, or archive naming conventions (no issues identified in these areas)
- Changes to the Claude Code parser or any provider parser not identified in the inconsistency report (out of scope; Claude Code archiving improvements are covered by [INIT-002](docs/initiatives/INIT-002-full-session-archiving.md))
- Changes to the agent text fragmentation observed in early Copilot Chat archives (the report notes this was already resolved in later versions — deferred unless regression is confirmed)
- Structural changes to the archive markdown format itself (the format is adequate; the issue is parser correctness, not output format design)

## Success criteria

- [ ] All multi-turn Codex sessions produce archived markdown with the correct number of distinct user and assistant turns matching the source data
- [ ] All Copilot Chat sessions in envelope format are parsed into structured markdown rather than falling through to raw-copy
- [ ] No archive files exist that contain only a header with zero conversation turns
- [ ] A re-archive cycle regenerates corrected markdown for all previously affected sessions
- [ ] Reasoning sections appear in archived Codex sessions when the source data contains reasoning content
- [ ] User and agent turn counts are consistent within archived Copilot Chat sessions (every user turn with a recorded response has a corresponding agent turn in the archive)
