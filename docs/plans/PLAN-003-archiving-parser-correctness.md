---
title: 'Parser correctness for Codex and Copilot Chat archiving'
initiative: INIT-003-archiving-parser-correctness
status: accepted
workspaces: []
created: 2026-03-23
references:
  - docs/initiatives/INIT-003-archiving-parser-correctness.md
  - docs/reports/20260323-agent-session-archiving-inconsistencies.md
---

## Business requirements and constraints

Per INIT-003, the plan must satisfy:

- Codex session archives preserve all conversation turns with correct boundaries: each user message and its corresponding assistant response (including tool calls and reasoning) appear as distinct turns in their original sequence
- Copilot Chat session archives handle the VS Code serialization envelope (`{kind, v}`) so that both envelope-wrapped and direct-format session files produce structured markdown
- Sessions with no meaningful content (zero conversation turns, no substantive data) are excluded from the archive rather than persisted as empty stubs
- Reasoning sections appear in Codex archives when the source data contains reasoning content
- User and agent turn counts are consistent within Copilot Chat archives: every user turn with a recorded response has a corresponding agent turn
- A re-archive cycle regenerates corrected markdown for all previously affected sessions

## Alternatives considered

### Codex multi-turn parsing strategy

| Alternative  | Approach                                                                                                                                                                            | Pros                                                                                                                                                                                                                                                                         | Cons                                                                                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A (selected) | Turn-boundary detection within the existing single-pass parser: treat each `user_message` event as a turn boundary that emits the accumulated assistant turn and starts a new cycle | Preserves the current single-pass JSONL processing architecture; requires localized changes to the state management within the parser; no new components or abstractions needed; aligns with how the Copilot Chat parser already handles multiple requests as distinct turns | Increases the responsibility of the state management logic, which must correctly handle partial turns (user message without a following assistant response) and edge cases (consecutive user messages without intervening assistant content)               |
| B            | Two-pass approach: first pass groups JSONL events into turn segments, second pass converts each segment into normalized turns                                                       | Cleaner separation between segmentation and conversion; each pass has a single concern                                                                                                                                                                                       | Introduces a structural change to the parser architecture that differs from all other parsers in the codebase; adds an intermediate data structure; over-engineered for the problem since the turn boundary signal (a `user_message` event) is unambiguous |

**Selection rationale.** Alternative A is preferred because it keeps the Codex parser's architecture consistent with the single-pass approach used by all other parsers in the registry. The root cause is that the state accumulator overwrites user content instead of emitting a completed turn. Fixing this within the existing pass is straightforward and avoids introducing a structural anomaly in the parser family.

### Empty session filtering location

| Alternative  | Approach                                                                                                                               | Pros                                                                                                                                                                                                                                    | Cons                                                                                                                                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A (selected) | Filter in the archive service after parsing, before writing: when a parsed session has zero meaningful turns, skip the write operation | Centralizes the filter at a single point that applies to all providers; the parser remains a pure converter that faithfully represents what is in the source data; the filtering policy is decoupled from format-specific parsing logic | Requires defining "meaningful" at the normalized-session level rather than per-provider                                                                                                                                                                |
| B            | Filter within each parser by returning an `unrecognized` status for empty sessions                                                     | Keeps the decision close to the data; each parser can apply provider-specific criteria                                                                                                                                                  | Misuses the `unrecognized` discriminant (the session _was_ recognized, it is simply empty); causes the archive service to fall through to raw-copy, which is the opposite of the desired behavior; requires duplicating the filter across every parser |

**Selection rationale.** Alternative A is preferred because the empty-session filter is a cross-provider archiving policy, not a format recognition concern. Placing it in the archive service keeps parsers as faithful converters and ensures consistent behavior regardless of which parser produced the result. The `unrecognized` status has a specific semantic (format not supported) that should not be overloaded for content-emptiness.

### Copilot Chat envelope unwrapping location

| Alternative  | Approach                                                                                                                        | Pros                                                                                                                                                                                                            | Cons                                                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A (selected) | Unwrap the envelope in the parser's content-parsing method before attempting to access session data fields                      | Fixes the bug at its root cause; the JSONL reconstructor already handles envelope unwrapping for multi-line JSONL content, so aligning the single-JSON path creates consistent behavior; minimal change surface | None identified — this is the direct fix for the documented root cause                                                                                                                                                                         |
| B            | Route all Copilot Chat content through the JSONL reconstructor regardless of whether it is single-line JSON or multi-line JSONL | Reuses existing envelope-aware code; single code path for all formats                                                                                                                                           | The JSONL reconstructor applies delta operations that are unnecessary for single-line JSON; adds processing overhead and indirection for the common case; conflates two distinct format concerns (envelope structure and delta reconstruction) |

**Selection rationale.** Alternative A directly addresses the root cause identified in the inconsistency report. The parser's content-parsing method successfully parses the JSON but fails to check for the envelope wrapper before accessing session fields. Adding envelope detection at this point is minimal, targeted, and consistent with the reconstructor's existing behavior for the JSONL path.

## Architectural decisions and rationale

1. **Decision: Turn-boundary emission in the Codex parser state machine.**
   The Codex parser will detect `user_message` events as turn boundaries. When a new `user_message` is encountered while the current state already contains accumulated content, the parser emits the completed turn pair (user + assistant) before resetting the state for the new turn. This addresses INIT-003 objective 1 (faithful multi-turn representation).
   _Trade-offs accepted:_ The parser must handle edge cases where a `user_message` appears without a preceding assistant response (consecutive user messages), which requires defensive state management. This is acceptable because the alternative (ignoring the edge case) would produce incorrect turn counts.
   _Constraints:_ The existing `NormalizedTurn` type and the renderer already support multiple turns per session — no changes needed downstream.

2. **Decision: Envelope unwrapping in the Copilot Chat parser's content-parsing method.**
   The parser's content-parsing method will detect the `{kind, v}` envelope structure and extract the inner object before returning. This aligns the single-JSON code path with the JSONL reconstructor's existing envelope handling. This addresses INIT-003 objective 2 (correct parsing of envelope-format files).
   _Trade-offs accepted:_ The envelope detection adds a structural check to the parsing path. This is minimal and warranted because the alternative (routing through the JSONL reconstructor) adds unnecessary processing.
   _Constraints:_ The fix must not break direct-format files (files without an envelope), which must continue to parse correctly.

3. **Decision: Empty session filtering in the archive service layer.**
   The archive service will check whether a parsed session contains meaningful content before writing. Sessions with zero non-empty turns will be skipped. This addresses INIT-003 objective 3 (no empty stub files).
   _Trade-offs accepted:_ Existing empty stub files in the archive will not be retroactively removed by this filter alone — they will be cleaned up during the re-archive cycle (increment 3), which regenerates all affected files from source data and applies the filter to the regenerated output.
   _Constraints:_ The filter must operate on the normalized session model, not on raw content size, to ensure consistent behavior across providers.

4. **Decision: Reasoning section investigation as part of the Codex parser increment.**
   The reasoning investigation will be conducted during the Codex parser correction increment. The parser already handles two reasoning event types (`summary_text` via `response_item:reasoning` and `agent_reasoning` via `event_msg`). The investigation will compare source JSONL data against parser output to determine whether additional reasoning event types exist that the parser does not handle. If additional types are found, they will be added to the parser's event handler map. This addresses INIT-003 objective 4 (reasoning sections when source data contains them).
   _Trade-offs accepted:_ If the investigation reveals that the 31 sessions without reasoning genuinely lack reasoning data in their source files, no parser change is needed — the finding will be documented as a confirmed negative.

5. **Decision: One-shot re-archive with loop prevention.**
   The re-archive of pre-fix sessions must be a bounded, one-time operation that does not cause subsequent archive cycles to re-process the same files indefinitely. The archive service uses an in-memory map (`lastArchivedMap`) keyed by `archiveName` to skip sessions whose `mtime` has not changed. After the corrected parsers are deployed, invalidating this map once triggers a full re-processing cycle. Once the cycle completes, the map is repopulated with the new mtime values, and subsequent cycles resume normal mtime-based skip behavior. The re-archive must not introduce a permanent flag, configuration setting, or polling loop that persists across extension restarts. This addresses INIT-003 success criteria (re-archive cycle) while preventing unbounded reprocessing.
   _Trade-offs accepted:_ The one-shot invalidation means the re-archive happens on the first archive cycle after the fix is deployed. If the extension restarts before the cycle completes, the `deduplicateAndHydrate` startup routine re-reads existing archive files and populates the map from disk, so incomplete re-archives are naturally resumed on the next startup.
   _Constraints:_ The re-archive must replace stale files (flattened `.md`, raw-copy `.jsonl`) with corrected output, and must not regenerate files that are already correct (e.g., Claude Code sessions unaffected by this initiative).

6. **Decision: Turn mismatch investigation as part of the Copilot Chat parser increment.**
   The user/agent turn mismatch investigation will be conducted during the Copilot Chat parser correction increment. The investigation will compare the affected source files against their archived output to determine whether the parser drops valid response items. This addresses INIT-003 objective 6 (consistent turn counts).
   _Trade-offs accepted:_ If the investigation reveals that the source files genuinely contain incomplete responses (streaming interruption, Copilot format edge case), the finding will be documented rather than creating a synthetic response.

## Concern assessment

| Concern         | Classification | Addressed by             | Notes                                                                                                                                                                                                                                                                     |
| --------------- | -------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security        | IRRELEVANT     |                          | The plan modifies internal parsers that convert locally-stored session files into markdown. No external integrations, no user-facing APIs, no authentication flows, no untrusted input beyond the already-trusted provider session files.                                 |
| Privacy         | IRRELEVANT     |                          | Session data is read from local provider storage and written to a local archive within the same workspace. No new data collection, no transmission, no third-party integration. The data flow is unchanged; only parsing correctness is improved.                         |
| Compliance      | IRRELEVANT     |                          | No regulated domain, no audit surface changes.                                                                                                                                                                                                                            |
| Accessibility   | IRRELEVANT     |                          | No user-facing interface changes.                                                                                                                                                                                                                                         |
| Observability   | IRRELEVANT     |                          | Existing logging in the archive service is sufficient; the plan does not introduce background processing or external dependencies.                                                                                                                                        |
| Resilience      | MEDIUM         |                          | Parser corrections must handle malformed or unexpected source data gracefully (no crashes on edge cases). Monitored during workstreams through defensive parsing and test coverage for edge cases.                                                                        |
| Performance     | IRRELEVANT     |                          | Parser corrections do not change the volume of data processed or the processing model. The re-archive cycle processes the same files as a normal archive cycle.                                                                                                           |
| AI governance   | IRRELEVANT     |                          | No AI/ML components introduced or modified.                                                                                                                                                                                                                               |
| i18n            | IRRELEVANT     |                          | No user-facing text changes.                                                                                                                                                                                                                                              |
| Sustainability  | IRRELEVANT     |                          | No compute-intensive workload changes.                                                                                                                                                                                                                                    |
| Supply chain    | IRRELEVANT     |                          | No new dependencies introduced.                                                                                                                                                                                                                                           |
| Maintainability | MEDIUM         |                          | The Codex parser's state management becomes more complex with turn-boundary detection. Monitored during workstreams through adequate test coverage for multi-turn scenarios and edge cases.                                                                               |
| Quality         | HIGH           | Increment 1, Increment 2 | Each parser correction must be accompanied by unit tests that verify the corrected behavior, including multi-turn scenarios for Codex and envelope-format scenarios for Copilot Chat. Tests must cover the specific failure modes documented in the inconsistency report. |

## Increments

### Increment 1 — Codex parser multi-turn correction and reasoning investigation

**Objective.** The Codex parser correctly handles multi-turn sessions by treating each user message event as a turn boundary, producing distinct user and assistant turn pairs in sequence. Reasoning sections are preserved when present in the source data.

**Dependencies.** None.

**Requirements covered.** INIT-003 objectives 1 (multi-turn structure) and 4 (reasoning sections).

**Interventions.**

- Modify the Codex parser's state management to detect user-message events as turn boundaries. When a new user message arrives while the state already contains accumulated content, emit the completed turn (user + assistant with tool calls and reasoning) before resetting the state for the new turn.
- Modify the turn-building logic to produce a list of turn pairs rather than a single pair, so that the final result contains all turns in their original sequence.
- Investigate the reasoning event types in source JSONL files for sessions that lack reasoning in the archive. If additional event types are found beyond `summary_text` and `agent_reasoning`, extend the parser's event handlers to capture them.
- Add unit tests for multi-turn scenarios: sessions with 2, 3, and 5+ user messages; sessions with consecutive user messages without intervening assistant responses; sessions where tool calls span multiple turns; sessions with reasoning blocks distributed across turns.
- Add or extend unit tests for reasoning extraction covering both known event types and any newly discovered types.

**Verifiable output.** Unit tests pass for multi-turn Codex sessions with correct turn counts and content. A manual verification against a sample of the 22 affected source files confirms that the corrected parser produces the expected number of turns.

### Increment 2 — Copilot Chat envelope unwrapping, empty session filtering, and turn mismatch investigation

**Objective.** The Copilot Chat parser correctly handles both envelope-wrapped and direct-format session files. The archive service filters out sessions with no meaningful content. Turn mismatches are investigated and resolved if caused by parser defects.

**Dependencies.** None (independent of Increment 1 — different parser and different components).

**Requirements covered.** INIT-003 objectives 2 (envelope parsing), 3 (empty session filtering), and 6 (turn count consistency).

**Interventions.**

- Modify the Copilot Chat parser's content-parsing method to detect the `{kind, v}` envelope structure and extract the inner object before accessing session data fields. Ensure that direct-format files (without envelope) continue to parse correctly.
- Add a content-meaningfulness check in the archive service's write path. When a parsed session contains zero non-empty turns, skip the write operation and log the skip.
- Investigate the 3 sessions with user/agent turn mismatches by comparing the source files against the parser output. If the parser drops valid response items, correct the extraction logic. If the source files contain incomplete responses, document the finding.
- Add unit tests for envelope-format parsing: sessions with `{kind: 0, v: {requests: [...]}}` structure; sessions with the direct format (no envelope); sessions where the envelope contains empty requests.
- Add unit tests for empty session filtering: parsed sessions with zero turns; sessions with only empty turns; sessions with at least one meaningful turn (should not be filtered).
- Add or extend unit tests for turn mismatch scenarios if a parser defect is identified.

**Verifiable output.** Unit tests pass for envelope-format Copilot Chat sessions producing structured markdown. Unit tests pass for empty session filtering. A manual verification against the 11 affected raw-copy files confirms that the corrected parser produces structured markdown for files with content and correctly skips files with empty requests.

**Parallelism note.** Increments 1 and 2 modify different components: Increment 1 modifies the Codex parser; Increment 2 modifies the Copilot Chat parser and the archive service. There is no component overlap. However, since all workstreams of a plan share the same branch, sequential execution is recommended to avoid coordination overhead for the archive service changes in Increment 2.

### Increment 3 — One-shot re-archive of pre-fix sessions

**Objective.** All previously affected sessions are re-archived using the corrected parsers, producing accurate markdown output that replaces the flattened or raw-copy files. The re-archive executes exactly once and does not cause subsequent archive cycles to reprocess already-corrected files.

**Dependencies.** Increments 1 and 2 (both parser corrections must be in place before re-archiving).

**Requirements covered.** INIT-003 success criteria: re-archive cycle regenerates corrected markdown for all previously affected sessions.

**Interventions.**

- Implement a one-shot re-archive mechanism per architectural decision 5: invalidate the archive service's in-memory tracking map to force a single full reprocessing cycle. After the cycle completes, the map is repopulated and subsequent cycles resume normal mtime-based skip behavior. The mechanism must not introduce persistent flags, configuration changes, or polling loops that survive extension restarts.
- The re-archive reprocesses all providers' sessions on the first cycle (the existing `deduplicateAndHydrate` mechanism stores `mtime: 0` for all archive files, not just affected providers). This is accepted because unaffected sessions regenerate identical output — adding provider-scoped filtering would introduce complexity without functional benefit.
- Verify the re-archived output for the specific sessions identified in the inconsistency report: the 22 multi-turn Codex sessions, the 11 envelope-format Copilot Chat files, and the 4 empty stub files.
- Document the re-archive results, including any sessions where the corrected parser produces different output than expected.

**Verifiable output.** The archive contains corrected markdown for all sessions identified in the inconsistency report. Multi-turn Codex sessions show the correct number of user and assistant turns. Envelope-format Copilot Chat sessions appear as structured markdown. Empty stub files are no longer present (either replaced by the re-archive or not regenerated due to the empty session filter). A second archive cycle after the re-archive completes without reprocessing already-corrected files (no loop).

## Risks and mitigations

- **Risk: Codex reasoning data genuinely absent.** The investigation in Increment 1 may confirm that 31 sessions lack reasoning data in their source files, meaning the parser is already correct for those sessions.
  **Mitigation:** Document the confirmed negative result. The success criterion for reasoning sections is conditioned on source data presence ("when the source data contains reasoning content"), so this outcome satisfies the initiative.

- **Risk: Turn mismatches caused by incomplete source data.** The investigation in Increment 2 may reveal that turn mismatches are caused by streaming interruptions or VS Code serialization timing, not parser defects.
  **Mitigation:** Document the finding with evidence from the source files. If the source data is genuinely incomplete, the parser cannot synthesize missing content — the finding will be recorded as a known limitation of the source data.

- **Risk: Re-archive cycle overwrites manually corrected files.** If any archive files were manually edited after initial archiving, the re-archive cycle will overwrite them.
  **Mitigation:** The archive is generated output, not a source of truth — the source session files in provider storage are the authoritative data. The re-archive cycle regenerates from source, which is the intended behavior.

## Open items at completion

_No open items — to be filled during Plan Completion Verification._
