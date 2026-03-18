---
title: 'Full session archiving for Claude Code provider'
initiative: INIT-002-full-session-archiving
status: draft
created: 2026-03-18
references:
  - docs/specifications/SPEC-002-full-session-archiving.md
  - Existing agent sessions archiving feature (agentSessionsArchiving)
---

## Objectives

1. Archive the complete session record for Claude Code sessions, including subagent transcripts stored in the companion directory alongside the main session JSONL file.
2. Resolve externalized tool results during archiving so that archived markdown contains actual content instead of opaque reference markers.
3. Preserve compaction summaries as labeled sections in the archive, providing continuity context across compaction boundaries in long sessions.
4. Extend session change detection to account for modifications to subagent and tool-result files, ensuring that active sessions with evolving companion data are re-archived with updated content.

## Motivation

The agent sessions archiving feature currently archives only the main session JSONL file for each Claude Code session. Claude Code stores additional session data in a companion directory structure containing subagent transcripts and externalized tool outputs. This companion data represents a significant portion of the session record: across current project sessions, 63% of sessions have subagent data, and the unarchived content totals approximately 33 MB compared to 53 MB for the main session files.

The practical consequence is that archived sessions are incomplete. Subagent conversations — which often contain the bulk of research, analysis, file reads, and implementation work — are silently lost during archiving. The main session captures only a compressed single-paragraph summary of each subagent invocation result, while the full multi-turn conversation is discarded. Tool results referenced by subagents resolve to truncation markers instead of actual content.

This means post-session review of archived sessions misses the detailed reasoning, code analysis, and decision-making that occurred within delegated agent threads. For sessions that rely heavily on subagent delegation, the majority of the substantive work is absent from the archive.

## Scope

Included:

- Discovery and enumeration of companion directories, subagent transcript files, subagent metadata files, and tool-result files alongside the main session JSONL
- Parsing of subagent JSONL transcripts using the same parsing logic as the main session
- Extraction of subagent metadata (agent type, description) from companion metadata files with fallback strategies when metadata files are absent
- Resolution of externalized tool-result references during parsing, substituting reference markers with actual file content
- Parsing and inclusion of compaction summary files as distinct labeled sections
- Extension of the normalized session model to carry subagent sessions and compaction summaries as optional, additive fields
- Markdown rendering of subagent transcripts as clearly identified sections within the archive, with agent type and identifier visible in headings
- Extension of session file watching to detect changes in companion directory contents
- Extension of change detection to trigger re-archiving when subagent or tool-result files are modified
- Graceful handling of missing, unreadable, or malformed companion data as specified in SPEC-002

Excluded:

- Changes to archive file naming conventions (subagent and tool-result data is incorporated into the existing per-session archive file)
- Parsing or rendering of binary or non-text tool outputs
- Changes to providers other than Claude Code
- Retroactive re-archiving of existing markdown archive files
- Changes to the enriched turn metadata fields covered by INIT-001

## Success criteria

- [ ] Archived sessions that spawned subagents contain the full conversation transcript of each subagent, not just the compressed return value from the main session
- [ ] Externalized tool results appear in the archive with their full content, replacing reference markers
- [ ] Sessions without companion directories produce archives identical to the current implementation
- [ ] Modification of a subagent or tool-result file triggers re-archiving of the parent session
- [ ] Each subagent's turns are clearly distinguished from the main session's turns, with the subagent type and identifier visible in the section heading
- [ ] Compaction summaries appear as distinct labeled sections in the archive, providing context across compaction boundaries
- [ ] All subagent types are handled uniformly without special-casing
