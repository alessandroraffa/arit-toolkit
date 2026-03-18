---
title: 'Claude Code provider — full session archiving (subagents and tool results)'
spec: SPEC-002
status: approved
workspaces: []
created: 2026-03-18
references:
  - Existing agent sessions archiving feature (agentSessionsArchiving)
  - SPEC-001 enriched turn metadata
  - Claude Code session storage format (subagents/, tool-results/ directories)
---

## Introduction

The Claude Code provider currently archives only the main session JSONL file (`<session-id>.jsonl`). Claude Code stores additional session data in a companion directory (`<session-id>/`) alongside the main JSONL, containing two subdirectories:

- **`subagents/`** — JSONL transcripts for each subagent spawned during the session, plus optional `.meta.json` files with agent type and description.
- **`tool-results/`** — Externalized large tool outputs referenced from the JSONL via `<persisted-output>` markers.

This data is never read, parsed, or included in the archived markdown. The result is that archived sessions are incomplete: subagent conversations (which often contain the bulk of the research, analysis, and implementation work) are silently lost, and tool results referenced by subagents resolve to truncation markers instead of actual content.

### Impact assessment

Across the current project sessions: 19 of 30 sessions (63%) have subagent data. The unarchived data totals ~33 MB (29 MB subagents + 4 MB tool results), compared to ~53 MB for the main session files. In sessions that use subagents heavily, the subagent data can exceed the main session data. The archived markdown captures only the main session's summary of each Agent tool call result — a compressed single-paragraph return value — while the full subagent conversation (tool calls, reasoning, file reads, code analysis) is discarded.

## Functional requirements

### Session discovery

1. The Claude Code provider must discover, for each main session JSONL file, the companion directory `<session-id>/` in the same parent directory. If the companion directory does not exist, the session is treated as having no subagent or tool-result data (current behavior preserved).

2. The provider must enumerate files in the `subagents/` subdirectory. Each file matching the pattern `agent-<agentId>.jsonl` is a subagent transcript. Each file matching `agent-<agentId>.meta.json` is metadata for the corresponding subagent.

3. The provider must enumerate files in the `tool-results/` subdirectory. Each file is an externalized tool output, named by its tool-use identifier (e.g., `toolu_<id>.txt` or `<hash>.txt`).

4. Compact files (`agent-acompact-<hash>.jsonl`) in the `subagents/` directory are compaction artifacts. They must be discovered but handled distinctly (see Compact files section).

### Subagent parsing

1. Each subagent JSONL file must be parsed using the same JSONL parsing logic as the main session, producing a `NormalizedSession` (or equivalent normalized structure) per subagent. The JSONL format is identical to the main session format — same event types, same field structure.

2. When a `.meta.json` file exists for a subagent, the parser must read it and extract:
   - `agentType` (string) — the subagent's role (e.g., `"Explore"`, `"reviewer"`, `"executor"`).
   - `description` (string, optional) — a brief description of the subagent's task.

   When no `.meta.json` exists (older sessions), the parser must fall back to extracting the agent type from the first JSONL event's fields, or from the parent session's Agent tool call input (if linkable via `agentId` or `promptId`).

3. Each subagent JSONL event contains an `agentId` field and optionally a `promptId` field. The `agentId` links the subagent transcript to the filename (`agent-<agentId>.jsonl`). The `promptId` can be used to correlate the subagent with the Agent tool invocation in the parent session.

### Tool-result resolution

1. When parsing a JSONL event (in either the main session or a subagent transcript) and encountering a `tool_result` whose `content` begins with `<persisted-output>`, the parser must recognize this as a reference to an externalized output. The content contains a file path pointing to a file in the `tool-results/` directory.

2. The parser must read the referenced tool-results file and substitute the `<persisted-output>` marker with the actual file content during parsing. If the referenced file does not exist or cannot be read, the parser must retain the original marker text and log a warning.

3. Tool-result resolution must apply to both main session events and subagent events. Subagent events reference tool-results files in the same session's `tool-results/` directory.

### Compact file handling

1. Compact files (`agent-acompact-<hash>.jsonl`) represent auto-compaction conversations — a system prompt asking for a summary, and the summary response. They must be parsed to extract the compaction summary text.

2. Compact summaries must be included in the archived output as distinct sections, clearly labeled as compaction summaries with a timestamp. They provide context about what was discussed before a compaction boundary.

3. When multiple compact files exist for a session (possible in long sessions), they must be ordered chronologically by their modification time.

### Normalized model extension

1. The `NormalizedSession` model must be extended to include an optional list of subagent sessions. Each subagent session must include:
   - The subagent's `agentId`.
   - The subagent's type (from `.meta.json` or fallback extraction).
   - An optional description (from `.meta.json`).
   - The subagent's normalized turns (same structure as the main session's turns).
   - An optional list of compaction summaries associated with this subagent.

2. The `NormalizedSession` model must be extended to include an optional list of compaction summaries for the main session itself.

3. These extensions must be additive — existing fields and their semantics remain unchanged. Sessions without subagent data produce the same normalized output as before.

### Markdown rendering

1. The markdown renderer must render subagent sessions as distinct sections within the archive, after the main session's turns. Each subagent section must include:
   - A heading with the subagent type and agent ID (e.g., `## Subagent: Explore (a885a9488d701a5d2)`).
   - The subagent description, if available.
   - All turns from the subagent's transcript, rendered with the same formatting rules as main session turns (timestamps, tool calls, thinking, file lists).

2. Subagent sections must be ordered chronologically by the timestamp of their first event.

3. Compaction summaries must be rendered as collapsible sections (`<details>`) labeled with "Compaction Summary" and a timestamp, placed at the chronological point where they occurred.

4. When the main session's Agent tool call result is a compressed summary and the corresponding subagent's full transcript is available, the renderer must not duplicate the content. The main session's Agent tool result should reference the subagent section (e.g., "See Subagent: Explore (a885a9488d701a5d2) below") rather than rendering the compressed summary inline.

### Inline vs. appended rendering (alternative to consider)

1. As an alternative to appending subagent sections at the end, the renderer may inline subagent turns at the chronological point where the Agent tool was invoked in the main session. When inline rendering is used:
   - The subagent's turns must be rendered within a clearly delimited block (e.g., a blockquote or indented section) to visually distinguish them from the main session.
   - The block must be introduced with a header identifying the subagent type and ID.
   - The Agent tool's result turn in the main session must be replaced by the subagent block.

   The choice between appended and inline rendering is an implementation decision to be resolved at the plan level.

### File watching

1. The session file watcher must monitor changes not only to `*.jsonl` files in the project directory, but also to files within `<session-id>/subagents/` and `<session-id>/tool-results/` subdirectories. A change to a subagent file or tool-result file must trigger a re-archive of the parent session.

2. The watch patterns must be extended to include glob patterns for the companion directories. The watcher must handle the case where companion directories are created after the main JSONL file already exists.

### Session file model

1. The `SessionFile` type must be extended (or a companion type introduced) to carry references to the session's companion directory, subagent files, and tool-result files. The archive service must have access to this information when invoking the parser.

2. The provider's `findSessions()` method must return session file objects that include metadata about the presence and contents of companion directories, without reading the actual file contents (discovery only — content is read during the archive cycle).

### Archive naming

1. The archive file naming convention must remain unchanged: `<timestamp>-claude-code-<session-id>.md`. The subagent and tool-result data is incorporated into the same archive file as the main session, not into separate files.

## Constraints

1. **Backward compatibility** — Sessions without companion directories must continue to archive identically to the current behavior. The absence of a `<session-id>/` directory must not cause errors or warnings.

2. **Performance** — Subagent and tool-result files can be large (individual subagent transcripts up to 15 MB observed, tool-results up to 2.6 MB). The parser must not load all subagent files into memory simultaneously. Files should be read and parsed sequentially or with bounded concurrency.

3. **File permissions** — Subagent JSONL files may have restricted permissions (`-rw-------`). The provider must handle permission errors gracefully, logging a warning and continuing with available data.

4. **Idempotency** — Re-archiving a session whose main JSONL is unchanged but whose subagent files have been modified must produce an updated archive. The change-detection mechanism (currently based on main JSONL `mtime`) must account for subagent and tool-result file modifications.

5. **Archive size** — Sessions with many subagents can produce very large markdown archives. The renderer should not impose arbitrary truncation, but the specification does not require rendering of binary or non-text tool outputs.

## Error handling

1. **Missing companion directory** — Not an error. The session is archived with main session data only (current behavior).

2. **Unreadable subagent file** — Log a warning identifying the file. Continue archiving the session with available data. The archived markdown must include a note indicating that a subagent transcript could not be read.

3. **Unreadable tool-result file** — Log a warning. Retain the `<persisted-output>` marker in the parsed content. The archived markdown must indicate that a tool output was externalized but unavailable.

4. **Malformed subagent JSONL** — Apply the same recovery strategy as the main session parser: skip unparseable lines, continue with valid events. If no valid events can be extracted, log a warning and omit the subagent from the archive.

5. **Malformed `.meta.json`** — Log a warning. Fall back to extracting the agent type from JSONL events or use "unknown" as the agent type.

6. **Orphaned subagent files** — Subagent files in a companion directory whose `agentId` does not appear in any Agent tool call in the main session must still be included in the archive. They are valid subagent transcripts that may have been spawned through mechanisms not visible in the main session events (e.g., background agents, SendMessage continuations).

## Acceptance criteria

1. An archived markdown file for a session that spawned subagents must contain the full conversation transcript of each subagent, not just the compressed return value visible in the main session.

2. Tool results that were externalized to `tool-results/` files must appear in the archived markdown with their full content, not as `<persisted-output>` markers.

3. A session with zero subagents and zero tool-result files must produce an identical archive to the current implementation.

4. The archive service must detect when a subagent file is modified (e.g., a session is still active and subagents are completing) and re-archive the session with updated content.

5. The archived markdown must clearly identify which turns belong to the main session and which belong to each subagent, with the subagent type and ID visible in the heading.

6. Compact summaries must be present in the archive as distinct labeled sections, providing continuity context across compaction boundaries.

7. All subagent types observed in production (`Explore`, `reviewer`, `executor`, `plan-author`, `spec-author`, `workstream-author`, `analyst`, `general-purpose`, `claude-code-guide`, `editor`, `diagnostic`) must be handled without special-casing — the parser treats all subagent JSONL files uniformly.
