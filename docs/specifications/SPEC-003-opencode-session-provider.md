---
title: 'Agent session archiving — OpenCode provider'
spec: SPEC-003
status: 'approved'
workspaces: []
created: 2026-06-22
references:
  - Existing agent sessions archiving feature (agentSessionsArchiving)
  - docs/specifications/SPEC-001-enriched-turn-metadata.md
  - docs/specifications/SPEC-002-full-session-archiving.md
---

## Introduction

The agent sessions archiving feature collects AI coding sessions from multiple assistants (Claude Code, Cline, GitHub Copilot Chat, OpenAI Codex) and converts them into normalized, versioned markdown archives in the workspace. **OpenCode** — the open-source terminal coding agent — is an additional assistant that is not yet supported.

This specification defines adding OpenCode as a supported source: discovering its sessions, matching them to the current workspace, and converting them to the existing normalized session model so they render through the existing markdown pipeline, consistent with every other provider.

OpenCode differs from the currently supported assistants in one material respect: it persists every session for every project in a **single shared local database**, not as one flat file per session. This single shared, concurrently-written store is the source of most of the requirements below — it changes how discovery, workspace matching, pipeline integration, change detection, and failure isolation must behave. This specification defines the observable behavior and the correctness, isolation, portability, and cross-platform constraints the addition must satisfy. It does not prescribe the database-access mechanism — that is an implementation-plan concern (see Constraints, item 6).

## Functional requirements

### Session discovery

1. The feature must discover OpenCode sessions from OpenCode's on-disk data store, located via the platform data-directory convention OpenCode itself uses: `$XDG_DATA_HOME/opencode` when `XDG_DATA_HOME` is set and non-empty; otherwise `~/.local/share/opencode` on macOS and Linux, and the user-profile equivalent (`%USERPROFILE%\.local\share\opencode`) on Windows.

2. Discovery must honor OpenCode's store-location overrides explicitly: when the `OPENCODE_DB` environment variable is set non-empty, it designates the store path and takes precedence over the default location. Otherwise, discovery must consider all default-directory store files matching OpenCode's database naming (the default `opencode.db` and per-channel variants `opencode-<channel>.db`), which may coexist in the same directory, rather than only the literal `opencode.db`. When `OPENCODE_DB` is set, only that path is consulted; per-channel enumeration applies only to the default directory. If the `OPENCODE_DB` path (or a resolved default path) does not exist or is out of scope, it is routed to items 4 and 5 (a silent no-op when absent; detect-and-signal when out of scope), never to best-effort guessing.

3. Discovery must succeed whether or not OpenCode is currently running. It must require only the presence of the store, not a running or installed OpenCode process at archive time.

4. When no OpenCode store is present at the resolved location(s), the provider must contribute zero sessions without raising an error — consistent with how existing providers behave when their source is absent.

5. When a store is present but its layout or version is outside the supported scope (see Constraints, item 5) — for example an older flat-file/JSON layout, or the separate desktop application's store — the provider must not attempt to parse it and must not fail the cycle. Instead it must surface a single, deduplicated, non-intrusive diagnostic — a log or status-bar message, never a blocking alert or modal — that names the unsupported layout, so the situation is distinguishable from "nothing found" and from "broken." It must not repeat this diagnostic on every cycle.

### Workspace matching

1. A session belongs to the current workspace when the working directory recorded with the session resolves to the same location as the workspace root, compared after path normalization. This is analogous to the existing working-directory matching used for the Codex provider.

2. Because the store is shared across all of the user's projects, matching must be exact at the directory level and must not produce false positives. Normalization must account for: trailing path separators; the host filesystem's case sensitivity (case-insensitive on typical macOS and Windows volumes); separator style (POSIX vs Windows); and symbolic-link / real-path equivalence. A directory that is merely a path-prefix of, or is nested under, the workspace root must not match. Both the recorded working directory and the workspace root must each be independently resolved to their real (symlink-resolved) paths before comparison.

3. Sessions whose recorded working directory does not resolve to the workspace root must be excluded.

### Pipeline integration

1. Each matched session must be presented to the parsing and archiving pipeline as a self-contained unit equivalent to a single flat-file session — an independently parseable representation of exactly that one session. The pipeline must not be handed the entire shared store as a single input, and no archive output may include content from sessions belonging to other workspaces.

2. Parsing of one session must be isolated: a failure to read or parse a single session must not prevent the archiving of the other matched sessions in the same cycle.

### Normalized model mapping

1. Each OpenCode session must map to exactly one normalized session. Each conversational message must map to one normalized turn carrying: role (user or agent), textual content, optional thinking, the tool calls invoked in that turn (name, input, output), and a timestamp when the source supplies one.

2. The conversational content of a turn is not held on the message record itself; it is assembled from the message's associated content parts. The mapping must therefore compose each turn from its message's parts in their recorded order: text parts form the turn's content; reasoning parts form the turn's thinking; tool parts populate the turn's tool calls; structural/boundary parts that carry no conversational content are ignored. The message record supplies the turn's role and timestamp.

3. Each tool part must map to one tool call, with the invoked tool's name, its input, and its resulting output taken from the tool part's recorded fields.

4. Reasoning content recorded for a turn must populate that turn's thinking.

5. Sessions delegated to subagents — recorded by OpenCode as child sessions of a parent session — must be represented using the subagent-session structure defined in SPEC-002, with the following source mapping: the child session's identifier maps to the subagent identifier; the child session's agent name maps to the subagent type, falling back to `"unknown"` when the source records no agent name; and the child session's title maps to the subagent description when present. Values absent from the source must not be synthesized beyond the stated `"unknown"` fallback. The turn-composition rules of items 1–4 apply equally to each child session: a child session's turns are assembled from that child session's own messages and their parts.

6. Compaction or summarization events, when present in the source, must map to the normalized model's compaction summaries.

7. The provider must populate the optional enriched metadata defined in SPEC-001 (timestamp, agent name) where OpenCode supplies it, and leave those fields undefined when it does not. Timestamps are recorded by OpenCode as an integer epoch; the mapping must convert from the correct epoch unit (milliseconds) to the SPEC-001 ISO 8601 representation, normalized to UTC. Parsers must not synthesize values absent from the source.

### Rendering

1. Archived OpenCode sessions must render through the existing normalized-model markdown renderer, with no OpenCode-specific output format. The archive layout, file naming, and year/month organization must match every other provider.

### Change detection

1. The provider must re-archive a session whenever that session's content changes, and a session must not be re-archived when its content has not changed. Detection must not be defeated by the store's write path (for example, a deferred or journaled flush in which the primary store file's modification time does not advance on every committed write).

2. Because the store is shared across all projects, the change-detection signal must be scoped to the sessions matching the current workspace. A signal that advances on any activity anywhere in the store (e.g., a store-global modification time) is acceptable only when combined with a per-session content fingerprint that prevents re-archiving a workspace's sessions in response to unrelated activity in other workspaces.

## Constraints

1. **Read-only and non-disruptive.** Archiving must never modify, lock, or corrupt the live OpenCode store. Reads must tolerate concurrent OpenCode activity (the store may be open and being written while archiving runs).

2. **Store access model.** The store is journaled: alongside the primary store file, OpenCode maintains write-ahead journal sidecars (`opencode.db-wal` and `opencode.db-shm`). Reads must reflect the store's committed state, **including committed data not yet folded back into the primary file**, without performing a journal checkpoint and without acquiring an exclusive lock. A read strategy that ignores the journal sidecars (and therefore can miss or stale recently-written sessions) does not satisfy this constraint. The concrete read strategy is the implementation plan's responsibility and must be justified there.

3. **Portability preserved.** The addition must preserve the extension's current packaging posture: a single published package that installs and operates on macOS, Linux, and Windows with no platform-specific build step and no platform-specific install step. No mechanism may require a separate per-platform artifact tied to the editor runtime.

4. **Provider-agnostic model unchanged.** The normalized session model and the markdown output format must remain provider-agnostic. Adding OpenCode must not change the behavior or output of any existing provider, and must not require a backward-incompatible change to the shared parsing contract used by other providers.

5. **Scope boundary.** Scope is limited to OpenCode versions that persist sessions in the current shared database store. Installations that use only the earlier flat-file (per-session JSON) layout, and the separate OpenCode desktop application's data store, are out of scope. Out-of-scope stores must be handled per Session discovery item 5 (detected and signalled, never silently ignored and never parsed), not by best-effort guessing.

6. **Mechanism feasibility is a plan gate.** The implementation plan must demonstrate a single store-access mechanism that simultaneously satisfies the portability constraint (item 3) and the store-access model (item 2, journal-aware, read-only, no checkpoint/exclusive lock). If no mechanism can satisfy both, the plan must escalate the conflict for a human decision before implementation begins, rather than relaxing either constraint silently.

## Error handling

1. A session whose content cannot be parsed (malformed or unexpected message/part data) must be skipped without failing the archive cycle for the other sessions. The best-effort raw-copy fallback used by flat-file providers does not apply to OpenCode: the source has no per-session file boundary, and copying the shared store would both leak other workspaces' sessions and produce a corrupt store image (its journal sidecars omitted). The provider must not copy the store as a raw archive.

2. If the store is present but cannot be opened (locked beyond tolerance, corrupt, or permission-denied), the provider must contribute zero sessions for that cycle rather than throwing, and must surface a throttled, user-visible diagnostic distinguishing this recoverable failure from the benign absent-store case (which is a silent no-op).

3. A session with no meaningful content must be excluded. "No meaningful content" means the session has no non-empty conversational turns **and** no subagent sessions **and** no compaction summaries — matching the empty-session predicate already used by the feature, so that a session whose substance lives only in its subagents or compaction is not discarded.

## Acceptance criteria

1. With OpenCode sessions present for the current workspace, an archive cycle produces one markdown archive per matching session, under the configured archive path, in the same year/month layout as other providers, with zero additional configuration.

2. Sessions recorded for a different working directory than the workspace root are not archived — verified positively: given a store containing sessions for multiple workspaces, no session whose recorded directory does not resolve to the current workspace root ever appears in the archive output.

3. A session containing tool calls renders those tool calls (name, input, output); reasoning content renders as thinking; user and agent turns render with the correct role labels; turn content is present even though it originates from the message's parts rather than the message record.

4. A session that delegated to subagents (child sessions) renders the subagent sections, and each subagent section's heading reflects the derived subagent identifier and agent type (including the `"unknown"` fallback when the source records no agent name).

5. After an OpenCode session is updated, a subsequent archive cycle produces an updated archive — change detection works across the journaled store.

6. An archive cycle triggered solely by OpenCode activity in a different workspace produces no new or modified archives for the current workspace when none of the current workspace's sessions changed.

7. An archive cycle completes without modifying or corrupting the OpenCode store (its files are byte-unchanged) and without requiring OpenCode to be stopped — including while OpenCode is concurrently writing to the store.

8. When the OpenCode store is absent, an archive cycle completes normally, producing no OpenCode archives and no error. When a store is present but out of scope, an archive cycle produces no OpenCode archives and emits exactly one non-intrusive diagnostic identifying the unsupported layout (not repeated each cycle).

9. Given several matched sessions where one is malformed, an archive cycle produces archives for all the valid sessions and exactly one warning for the malformed one, with no exception propagating out of the cycle.

10. A session whose substance is only in subagents or compaction (empty main turns) is archived, not discarded; a session with no turns, no subagents, and no compaction is excluded.

11. A session containing compaction summaries produces an archive in which those summaries appear as distinct labeled sections, at the chronological point where they occurred.

12. When a session's most recent committed data exists only in the store's write-ahead journal (not yet checkpointed into the primary file), an archive cycle still reflects that data.

13. The normalized model and all existing providers' archives are unaffected by the addition.

## Open questions

None at this time. Support for the legacy flat-JSON layout and the desktop application are deliberately out of scope (see Constraints, item 5); the runtime behavior when such a store is encountered is specified (Session discovery item 5), not left open.

## Revision history

2026-06-22 — Initial draft. Defines OpenCode as a new archiving provider: store discovery (XDG data dir, cross-platform), workspace matching by recorded working directory, normalized-model mapping (turns, tool calls, thinking, subagents, compaction), journaled-store change detection, and read-only/portability constraints. Database-access mechanism deferred to the implementation plan.

2026-06-22 — Revised after multi-perspective review gate (pre-implementation, PASS_WITH_CONDITIONS, 8 blocking + mediums/lows). Resolutions: removed the unsafe raw-copy fallback for the shared store (F1); added a Pipeline-integration section requiring per-session self-contained parsing with no shared-interface break and per-session failure isolation (F2 — behavior-level; chosen approach for the plan: materialize each session as an independent unit without mutating the shared parsing contract); added the Store-access-model constraint naming the WAL/`-shm` sidecars and the committed-state read property (F3); scoped change detection to the workspace's sessions and added a negative criterion (F4); named the `OPENCODE_DB` and channel-DB discovery overrides (F5); specified message-parts-to-turn assembly and ordering with content-in-parts (F6); specified the subagent source-to-field mapping with an `"unknown"` agent-type fallback (F7); specified out-of-scope-store runtime detection-and-signal behavior (F8, option B); corrected the empty-session predicate (M1); fixed the timestamp epoch unit/timezone (M2, milliseconds→UTC ISO 8601); required a user-visible diagnostic for recoverable store-open failures (M3); enumerated workspace-matching normalization cases and an isolation criterion (M4); reframed change-detection and portability at the observable-property altitude (M5, M6); added the mechanism-feasibility plan gate (M7); added acceptance criteria for parse isolation, zero-config discovery/concurrent reads, compaction, and subagent labels (L1–L3); neutralized unsupported "widely used" phrasing (L4).

2026-06-22 — Verification gate returned PASS (no blocking findings). Folded the advisory clarity items: child-session turn composition applies the same parts rules (WT-002); `OPENCODE_DB` exclusivity and absent/out-of-scope path routing (BK-001/BK-003); both-sides symlink resolution before directory comparison (BK-002); "non-intrusive" defined as a log/status-bar message, never a modal (WT-004); added acceptance criteria for compaction rendering output (WT-001, criterion 11) and WAL-only committed data (WT-003, criterion 12). Promoted from draft to approved.
