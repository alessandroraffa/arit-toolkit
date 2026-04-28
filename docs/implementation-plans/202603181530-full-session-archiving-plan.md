---
title: 'Full session archiving for Claude Code provider'
initiative: INIT-002-full-session-archiving
status: in-progress
workspaces: []
created: 2026-03-18
references:
  - docs/specifications/SPEC-002-full-session-archiving.md
  - docs/initiatives/INIT-002-full-session-archiving.md
  - docs/implementation-plans/202603151100-enriched-turn-metadata-plan.md
---

## Business requirements and constraints

Per SPEC-002 and INIT-002, the plan must satisfy:

- Discovery and enumeration of companion directories, subagent transcript files, subagent metadata files, and tool-result files alongside the main session JSONL.
- Parsing of subagent JSONL transcripts using the same parsing logic as the main session.
- Extraction of subagent metadata (agent type, description) from companion metadata files, with fallback strategies when metadata files are absent.
- Resolution of externalized tool-result references (replacing `<persisted-output>` markers with actual file content) during parsing, for both main session and subagent events.
- Parsing and inclusion of compaction summary files as distinct labeled sections.
- Extension of the normalized session model to carry subagent sessions and compaction summaries as optional, additive fields.
- Markdown rendering of subagent transcripts as clearly identified sections within the archive.
- Extension of session file watching to detect changes in companion directory contents.
- Extension of change detection to trigger re-archiving when subagent or tool-result files are modified.
- Graceful handling of missing, unreadable, or malformed companion data.
- Backward compatibility: sessions without companion directories must produce identical archives to the current implementation.
- Performance: companion files must not all be loaded into memory simultaneously; sequential or bounded-concurrency processing is required.

## Alternatives considered

### Parser architecture for companion file access

| Alternative  | Approach                                                                                                                                                                                                                                                                                                                                                                           | Pros                                                                                                                                              | Cons                                                                                                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A (selected) | Introduce a companion data resolution layer in the archive service that discovers, reads, and assembles companion data before invoking the parser. The parser receives a structured context object containing the main session content plus pre-read companion data (subagent contents, metadata, tool-result contents). The parser interface gains an optional context parameter. | Keeps the parser pure (no I/O); testable with in-memory data; other parsers unaffected; the archive service already owns file I/O responsibility. | The archive service grows in responsibility; the context object must be designed carefully to avoid unbounded memory.                                                                                               |
| B            | Make the parser asynchronous and give it direct file-system access to read companion files during parsing.                                                                                                                                                                                                                                                                         | Parser has full control over what and when to read.                                                                                               | Breaks the existing synchronous parser interface for all parser implementations; mixes I/O and parsing concerns; harder to test; violates the separation already established where the archive service handles I/O. |
| C            | Create a new dedicated session assembler component that reads all files and produces a fully assembled JSONL string (main + subagent content concatenated or interleaved), then pass the assembled string to the existing parser.                                                                                                                                                  | Parser interface unchanged.                                                                                                                       | Loses the structural distinction between main session and subagent transcripts; cannot produce separate subagent sections in the archive; conflates different sources into a single stream.                         |

**Selection rationale.** Alternative A preserves the established separation of concerns: the archive service manages file I/O and the parser transforms content into the normalized model. The parser remains synchronous and testable with in-memory fixtures. Alternative B would require changing the parser interface across all parser implementations for a capability only the Claude Code parser needs. Alternative C destroys the structural information needed to render subagent sections distinctly.

### Subagent rendering strategy (inline vs. appended)

| Alternative  | Approach                                                                                                                                                                                                                                               | Pros                                                                                                                                                                                                                                                                                                                         | Cons                                                                                                                                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A (selected) | Render subagent sections appended after the main session turns, each under a distinct heading with subagent type and ID. The main session's Agent tool call result references the subagent section instead of rendering the compressed summary inline. | Clear visual separation between main and subagent transcripts; simpler implementation — no need to correlate subagent invocation points in the main session; subagent sections are self-contained and navigable via heading anchors; orphaned subagents (no matching Agent tool call) render naturally as appended sections. | Loses chronological interleaving — the reader must scroll to the subagent section to see what happened during a delegation.                                                                                                                                                                          |
| B            | Inline subagent turns at the chronological point of the Agent tool invocation in the main session, within a delimited block.                                                                                                                           | Preserves reading chronology; shows delegation in context.                                                                                                                                                                                                                                                                   | Requires reliable correlation between Agent tool call IDs and subagent agentIds/promptIds — correlation is not always possible (orphaned subagents, background agents); deeply nested rendering (blockquote within blockquote for sub-subagents) degrades readability; more complex rendering logic. |

**Selection rationale.** Alternative A is more robust: it handles all subagent types uniformly, including orphaned subagents and background agents that have no matching Agent tool call in the main session. SPEC-002 explicitly requires orphaned subagent files to be included. The appended approach also simplifies the renderer — each subagent section is a self-contained rendering unit. The chronological ordering of subagent sections (by first event timestamp) provides sufficient temporal context. SPEC-002 lists inline rendering as an alternative to consider but defers the choice to the plan level; the specification does not require inline rendering.

### Change detection strategy for companion data

| Alternative  | Approach                                                                                                                                                                                                                                                                                                               | Pros                                                                                                                                                   | Cons                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A (selected) | Extend the session file model to carry a composite modification indicator derived from the maximum mtime across the main JSONL and all companion files. The provider computes this composite indicator during discovery. The archive service compares the composite indicator against its cached value, same as today. | Minimal change to the archive service's change detection logic; single comparison per session; provider encapsulates the companion directory scanning. | Discovery must stat companion files, adding I/O during session enumeration.                                                                              |
| B            | Keep the session file model unchanged and add a separate companion-aware change detector in the archive service.                                                                                                                                                                                                       | No changes to the session file type; other providers unaffected.                                                                                       | Duplicates discovery logic between provider and archive service; the archive service would need provider-specific knowledge about companion directories. |

**Selection rationale.** Alternative A concentrates companion directory awareness in the Claude Code provider, which already owns the knowledge of where session files live. The archive service's existing change detection mechanism (compare mtime, skip if unchanged) works without modification beyond comparing the composite indicator instead of the main file's mtime alone. Alternative B would scatter companion awareness across components.

## Architectural decisions and rationale

1. **Introduce a companion data resolution layer in the archive service.**
   Motivated by INIT-002 objectives 1, 2, and 3. The archive service gains a pre-parsing phase that discovers and reads companion data (subagent transcripts, metadata files, tool-result files) for session providers that support it. The resolved companion data is assembled into a structured context object and passed to the parser alongside the main session content. Trade-off accepted: the archive service grows in responsibility, but this aligns with its existing role as the I/O coordinator. Constraint: the resolution layer must process files sequentially to respect the performance requirement (no simultaneous loading of all subagent files).

2. **Extend the parser interface with an optional context parameter.**
   Motivated by INIT-002 objectives 1 and 2. The parser's `parse` method gains an optional companion data context parameter containing pre-resolved companion data (subagent contents with metadata, tool-result content map, compaction file contents). Parsers that do not use companion data ignore the parameter. This is additive — existing parser implementations require no changes. Trade-off accepted: the parser interface widens, but only optionally.

3. **Extend the normalized session model with optional subagent sessions and compaction summaries.**
   Motivated by INIT-002 objective 1. The `NormalizedSession` interface gains two optional fields: a list of subagent sessions (each carrying agent ID, agent type, optional description, normalized turns, and optional compaction summaries) and a list of main-session compaction summaries. These fields follow the same optional-by-omission pattern established by INIT-001 for turn metadata. Constraint: `exactOptionalPropertyTypes: true` requires population by omission.

4. **Render subagent sessions as appended sections with distinct headings.**
   Motivated by INIT-002 objective 1 and success criterion 5. Subagent sections appear after the main session turns, each introduced by a heading containing the subagent type and agent ID. The main session's Agent tool call result is replaced with a reference to the corresponding subagent section. Subagent sections are ordered chronologically by the timestamp of their first event. Trade-off accepted: loses chronological interleaving in exchange for robustness and simplicity.

5. **Render compaction summaries as collapsible sections.**
   Motivated by INIT-002 objective 3. Compaction summaries are rendered as `<details>` blocks labeled with "Compaction Summary" and a timestamp. They appear at the position corresponding to their chronological occurrence within the relevant session (main or subagent). Trade-off accepted: collapsible sections reduce visual noise but require the reader to expand them to see content.

6. **Extend the Claude Code provider to discover and report companion directory metadata.**
   Motivated by INIT-002 objective 4. The provider's `findSessions` method enumerates the companion directory for each session and computes a composite modification indicator (maximum mtime across main JSONL and companion files). The session file model is extended with an optional field for companion directory metadata. Other providers are unaffected — they omit the field. Trade-off accepted: session discovery performs additional stat calls on companion files, adding I/O during enumeration.

7. **Extend watch patterns to cover companion subdirectories.**
   Motivated by INIT-002 objective 4. The Claude Code provider's watch patterns are extended to include glob patterns for subagent and tool-result files within companion directories. The session file watcher already supports multiple patterns per provider. Trade-off accepted: more file system watchers are registered, but the VS Code watcher API handles this efficiently.

8. **Resolve tool-result references during the companion data resolution phase.**
   Motivated by INIT-002 objective 2. The companion data resolution layer reads tool-result files and builds a lookup map keyed by the reference identifier extracted from `<persisted-output>` markers. The parser uses this map to substitute markers with actual content during JSONL event processing. When a referenced file is unreadable, the marker is retained and a warning is logged. Trade-off accepted: all tool-result files are read during the resolution phase even if not all are referenced — this simplifies the resolution logic and the total data is bounded (observed maximum ~4 MB for tool-results per session).

9. **Extract subagent metadata with a fallback chain.**
   Motivated by INIT-002 objective 1. For each subagent transcript, metadata extraction follows a priority chain: (1) the companion `.meta.json` file, (2) fields within the subagent's first JSONL event, (3) the string "unknown" as a last resort. The parser implements the JSONL-based fallback; the resolution layer provides the `.meta.json` content when available. Trade-off accepted: the fallback chain adds complexity but is necessary for older sessions that lack metadata files.

## Concern assessment

| Concern         | Classification | Addressed by      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------- | -------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security        | IRRELEVANT     |                   | No external APIs, no network I/O, no untrusted input. All files are local session data owned by the user. Tool-result lookup keys are extracted from JSONL content, but actual file reads are restricted to the session's companion directory — no path traversal is possible because the resolution layer reads files enumerated from the directory, not paths constructed from JSONL content.                                                                                              |
| Privacy         | IRRELEVANT     |                   | No new data collection or sharing. The plan reads session data the user already owns and writes it to local markdown archives in the user's workspace. No data leaves the local machine.                                                                                                                                                                                                                                                                                                     |
| Compliance      | IRRELEVANT     |                   | No regulated data categories affected.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Accessibility   | IRRELEVANT     |                   | No user-facing UI changes; output is markdown text with standard heading structure.                                                                                                                                                                                                                                                                                                                                                                                                          |
| Observability   | MEDIUM         |                   | Monitor during workstreams. The companion data resolution phase should log discovery results (number of subagent files, tool-result files found) at debug level for diagnostics.                                                                                                                                                                                                                                                                                                             |
| Resilience      | HIGH           | Decisions 1, 8, 9 | The plan introduces multiple new failure points: unreadable subagent files, missing metadata, unresolvable tool-result references, malformed companion JSONL. Each is addressed by graceful degradation strategies defined in SPEC-002 error handling and implemented through the fallback chain (decision 9), marker retention (decision 8), and the resolution layer's file-by-file processing (decision 1).                                                                               |
| Performance     | HIGH           | Decision 1        | Subagent transcripts can be large (up to 15 MB observed per file; tool-results up to 2.6 MB). Sequential processing in the companion data resolution layer (decision 1) prevents simultaneous loading of all companion files. The archive service already processes sessions sequentially within each provider.                                                                                                                                                                              |
| AI governance   | IRRELEVANT     |                   | No AI/ML components introduced or modified.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| i18n            | IRRELEVANT     |                   | No user-facing translatable text introduced.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Sustainability  | IRRELEVANT     |                   | No significant compute-intensive workloads introduced beyond file reading.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Supply chain    | IRRELEVANT     |                   | No new dependencies introduced.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Maintainability | HIGH           | Decisions 1, 2, 3 | The companion data resolution layer, extended parser context, and model extensions add complexity to the archiving pipeline. Decision 1 isolates companion data handling from parsing. Decision 2 keeps the interface extension optional and non-breaking. Decision 3 follows the established additive pattern. The ESLint constraints (250 lines/file, 50 lines/function, 3 params max) require the resolution layer and rendering extensions to be decomposed into focused helper modules. |
| Quality         | MEDIUM         |                   | Monitor during workstreams. Test coverage for the new components must meet the project's unit test coverage targets. Both the resolution layer and the parser extensions need dedicated test suites with fixtures representing sessions with and without companion data.                                                                                                                                                                                                                     |

## Increments

### Increment 1 — Normalized model extension and companion data types

**Objective.** Extend the normalized session model with the subagent session and compaction summary structures. Introduce the companion data context type that the resolution layer will produce and the parser will consume. Establish the data contracts before any component produces or consumes the new data.

**Dependencies.** None. INIT-001 (enriched turn metadata) must have been completed, as the normalized turn interface from INIT-001 is the baseline.

**Requirements covered.** SPEC-002: normalized model extension (Normalized model req. 1, 2, 3).

**Interventions.**

- Define a subagent session type in the normalized model type definitions. Each subagent session carries: agent ID (string), agent type (string), optional description (string), normalized turns (same type as the main session's turns), and optional compaction summaries.
- Define a compaction summary type carrying: summary text (string) and timestamp (string).
- Add two optional fields to the `NormalizedSession` interface: a list of subagent sessions and a list of compaction summaries. Both follow the optional-by-omission pattern.
- Define the companion data context type (used by the resolution layer and the parser): a structured object containing a list of subagent entries (each with content string, optional metadata), a tool-result content map (keyed by reference identifier), and a list of compaction entries (each with content string and modification time).
- Add unit tests verifying that existing code constructing `NormalizedSession` objects (in parser tests and renderer tests) continues to compile and pass without modification — the new fields are optional and omitted.

**Verifiable output.** All existing unit tests pass without modification. The type checker confirms backward compatibility. The new types are importable and constructible in test fixtures.

### Increment 2 — Companion data resolution layer

**Objective.** Implement the companion data discovery and resolution layer in the archive service. This layer reads the companion directory for a session, enumerates subagent files, metadata files, tool-result files, and compaction files, reads their contents sequentially, and assembles the companion data context object defined in increment 1.

**Dependencies.** Increment 1 (companion data context type).

**Requirements covered.** SPEC-002: session discovery (Session discovery req. 1, 2, 3, 4), tool-result resolution (Tool-result resolution req. 1, 2, 3), compact file handling (Compact file handling req. 1, 3), error handling (Error handling req. 1, 2, 3, 5, 6).

**Interventions.**

- Introduce a companion data resolver module in the archive service layer. This module receives a session's companion directory URI and produces the companion data context object.
- Implement companion directory discovery: given the main session URI, derive the companion directory URI (same parent, session ID as directory name). Check for existence; return an empty context if absent.
- Implement subagent file enumeration: scan the subagents subdirectory for files matching the subagent transcript pattern and the metadata pattern. For each subagent, read the transcript content and the metadata content (if the metadata file exists). Handle permission errors by logging a warning and skipping the file.
- Implement tool-result file enumeration: scan the tool-results subdirectory and read each file's content into the tool-result map. Handle unreadable files by logging a warning and omitting the entry.
- Implement compaction file enumeration: identify compaction files by their filename pattern. Read their content and record their modification time for chronological ordering.
- Ensure sequential file reading (process one file at a time) to respect the performance constraint.
- Integrate the companion data resolver into the archive service's write-archive flow: after obtaining the parser, invoke the resolver to produce the companion data context, then pass it to the parser.
- Add unit tests with mocked file system operations covering: session with companion directory (subagents, tool-results, compaction files), session without companion directory, session with partially unreadable companion files, session with empty companion directory.

**Verifiable output.** Unit tests pass. The resolver produces correct companion data context objects for sessions with and without companion directories. Unreadable files produce warnings and are omitted from the context. The archive service invokes the resolver before parsing.

### Increment 3 — Parser extension for subagent and companion data processing

**Objective.** Extend the Claude Code parser to consume the companion data context and produce normalized sessions with subagent transcripts, resolved tool results, and compaction summaries.

**Dependencies.** Increment 1 (model types), increment 2 (companion data context production).

**Requirements covered.** SPEC-002: subagent parsing (Subagent parsing req. 1, 2, 3), tool-result resolution (Tool-result resolution req. 1, 2, 3), compact file handling (Compact file handling req. 1, 2), normalized model extension (Normalized model req. 1, 2), error handling (Error handling req. 4, 5, 6), backward compatibility (Constraints req. 1).

**Interventions.**

- Extend the parser interface's `parse` method signature with an optional companion data context parameter. All existing parser implementations remain valid — they ignore the parameter.
- In the Claude Code parser, when a companion data context is provided, process each subagent entry: parse the subagent transcript content using the same JSONL parsing logic as the main session, extract metadata (agent type, description) from the companion metadata or from the JSONL events as a fallback, and assemble a subagent session object.
- Implement tool-result resolution within the JSONL event processing: when a tool_result event's content contains a persisted-output reference, look up the actual content in the companion data context's tool-result map. Substitute the reference with the resolved content if available; retain the original text if not.
- Process compaction file entries: parse each compaction JSONL to extract the summary text (the assistant's response in the compaction conversation), order chronologically by modification time, and attach to the normalized session as compaction summaries.
- Implement the subagent metadata fallback chain: (1) use the pre-read metadata from the companion data context, (2) extract agent type from the first JSONL event's fields, (3) default to "unknown".
- Ensure backward compatibility: when no companion data context is provided (or it is empty), the parser produces the same output as before.
- Add parser unit tests covering: session with subagent transcripts (verifying turns appear in the subagent sessions list), tool-result resolution (verifying persisted-output references are replaced), compaction summary extraction, metadata extraction with all three fallback levels, malformed subagent JSONL recovery, orphaned subagents (no matching Agent tool call in main session), and sessions without companion data producing unchanged output.

**Verifiable output.** All unit tests pass (existing and new). The parser produces `NormalizedSession` objects with populated subagent sessions when companion data is provided. Tool-result references are resolved. Sessions without companion data produce identical output to the current implementation. The quality gate passes.

### Increment 4 — Renderer extension for subagent sections and compaction summaries

**Objective.** Extend the markdown renderer to produce subagent sections and compaction summary sections in the archived output.

**Dependencies.** Increment 1 (model types), increment 3 (parser produces populated subagent sessions and compaction summaries).

**Requirements covered.** SPEC-002: markdown rendering (Markdown rendering req. 1, 2, 3, 4), compact file handling (Compact file handling req. 2), acceptance criteria 1, 5, 6.

**Interventions.**

- Extend the renderer to detect when the normalized session contains subagent sessions. After rendering the main session turns, render each subagent section under a distinct heading containing the subagent type and agent ID.
- Within each subagent section, render the subagent's description (if available), followed by the subagent's turns using the same rendering logic as main session turns.
- Order subagent sections chronologically by the timestamp of each subagent's first turn.
- Replace the main session's Agent tool call result with a reference to the corresponding subagent section when a matching subagent is available.
- Render compaction summaries as collapsible `<details>` blocks with a "Compaction Summary" label and timestamp. Place them at the appropriate chronological position within the session or subagent they belong to.
- Handle edge cases around empty subagents, missing timestamps, and absent compaction data gracefully.
- Ensure that sessions without subagent data produce identical output to the current implementation.
- Add renderer unit tests covering: session with one subagent, session with multiple subagents in chronological order, subagent with description, subagent without description, compaction summary rendering as collapsible section, Agent tool call result replacement, session without subagent data producing unchanged output.

**Verifiable output.** All unit tests pass. Rendered markdown for sessions with subagents contains distinct subagent sections with correct headings. Compaction summaries appear as collapsible blocks. Sessions without companion data produce unchanged output. The quality gate passes.

### Increment 5 — Provider extension and change detection

**Objective.** Extend the Claude Code provider's session discovery and watch patterns to account for companion directory contents. Ensure that modifications to subagent or tool-result files trigger session re-archiving.

**Dependencies.** Increment 2 (the archive service must already invoke the resolution layer; this increment ensures the input data reflects companion changes).

**Requirements covered.** SPEC-002: session file model (Session file model req. 1, 2), file watching (File watching req. 1, 2), idempotency (Constraints req. 4), acceptance criterion 4.

**Interventions.**

- Extend the session file type with an optional field for a composite modification indicator that accounts for companion files. Other providers omit this field.
- In the Claude Code provider's session discovery, after discovering a main JSONL file, check for the existence of the companion directory. If present, enumerate the files within the companion subdirectories and compute the composite modification indicator as the maximum mtime across the main JSONL and all companion files. Handle stat failures on individual companion files by skipping them and using the main JSONL's mtime as a conservative fallback.
- Update the archive service's change detection to use the composite modification indicator when present, falling back to the main file's mtime when absent. This ensures backward compatibility with providers that do not report companion data.
- Extend the Claude Code provider's watch patterns to return additional patterns covering subagent and tool-result files within companion directories.
- Add unit tests covering: provider discovering sessions with companion directories and reporting composite mtime, provider discovering sessions without companion directories (unchanged behavior), archive service skipping re-archive when composite mtime is unchanged, archive service triggering re-archive when a subagent file's mtime increases the composite indicator, watcher patterns including companion directory globs, stat failure on a companion file falling back to main JSONL mtime.

**Verifiable output.** All unit tests pass. The provider reports composite modification indicators for sessions with companion data. The archive service correctly detects changes to subagent and tool-result files. Watch patterns cover companion directories. The full quality gate passes.

**Parallelism note.** Increment 1 is a prerequisite for all subsequent increments. Increment 2 and increment 3 are sequential (3 depends on 2). Increment 4 depends on 1 and 3 but not on 2 directly — however, increments 3 and 4 both modify the parser and renderer modules respectively, with no component overlap, so they could execute concurrently after increment 3 completes. Increment 5 modifies the provider and archive service, overlapping with increment 2 on the archive service. Recommend sequential execution: 1 → 2 → 3 → 4 → 5.

## Risks and mitigations

- **Risk: Companion directory structure variation across Claude Code versions.** The companion directory layout and file naming conventions are based on observed data. Future Claude Code versions may change the structure.
  **Mitigation.** The companion data resolver treats missing directories and unrecognized files gracefully — absent directories produce empty contexts, unrecognized files are ignored. The resolver's discovery patterns are isolated in a single module, making future adaptation a contained change.

- **Risk: Large session archives exceeding practical readability.** Sessions with many subagents can produce very large markdown archives (tens of megabytes of rendered markdown).
  **Mitigation.** The specification explicitly states no arbitrary truncation. Sequential processing prevents memory exhaustion during the resolution phase. The collapsible rendering of compaction summaries and tool outputs reduces visual noise. Archive size monitoring can be added as a follow-up if needed.

- **Risk: Tool-result file path mismatch.** The persisted-output reference in the JSONL may contain a path form that does not directly match the filename in the tool-results directory (e.g., absolute paths vs. bare identifiers, different path separators).
  **Mitigation.** The resolution layer derives tool-result file identifiers from the filenames in the tool-results directory and matches them against the reference identifier extracted from the JSONL. The extraction logic must handle both absolute path references (extracting the filename component) and bare identifiers. Unmatched references retain the original text and log a warning.

- **Risk: Increased session discovery latency.** Scanning companion directories and statting files during session discovery adds I/O to the discovery phase, which runs on every archive cycle.
  **Mitigation.** The discovery phase only stats files (no content reads). The number of companion files per session is bounded (typically fewer than 20 subagent files). The archive cycle runs on a timer (default 5 minutes) so the latency increase is not user-facing.

## Open items at completion

_No open items — to be filled during Plan Completion Verification._
