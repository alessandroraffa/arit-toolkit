---
title: 'OpenCode session provider — implementation plan'
initiative: INIT-005-opencode-provider
status: 'approved'
workspaces: []
created: 2026-06-22
references:
  - docs/specifications/SPEC-003-opencode-session-provider.md
  - docs/initiatives/INIT-005-opencode-provider.md
---

## Business requirements and constraints

Per SPEC-003 (approved) and INIT-005, the plan must deliver an OpenCode provider that: discovers OpenCode's shared store cross-platform (honoring `OPENCODE_DB` and channel files; absent = silent no-op; out-of-scope = detect-and-signal); matches sessions to the workspace by recorded working directory with exact, both-sides real-path normalization; presents each matched session as a self-contained, independently parseable unit with per-session failure isolation and no shared-contract break; maps OpenCode's message/parts structure to the normalized model (turns, tool calls, thinking, subagents, compaction, enriched metadata); detects change correctly across the journaled store, scoped to the workspace's sessions; is read-only/non-disruptive; preserves single-package portability; and leaves the model/renderer and other providers unchanged. It must resolve the store-access mechanism gate (SPEC-003 Constraints §6). **This plan demonstrates a mechanism satisfying portability and journal-correctness simultaneously (Architectural decisions §1); the gate is cleared, no escalation required.**

## Schema verification status

Claims about the OpenCode store, marked verified (empirically, against a live v1.17.9 store) or to-be-verified (TBV) in a named increment:

| Claim                                                                                                             | Status                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Store path `~/.local/share/opencode/opencode.db` + `-wal`/`-shm`; XDG honored on macOS/Linux                      | **Verified**                                                                        |
| WAL-correct read-only via `node:sqlite` (11 msg/52 part = WAL-aware; 10/44 main-only)                             | **Verified**                                                                        |
| `session(directory NOT NULL, parent_id, agent, title, time_created/updated epoch-ms, summary_*, time_compacting)` | **Verified**                                                                        |
| `message.data` JSON envelope, discriminator `role ∈ {user, assistant}` (no `type` in this version)                | **Verified**                                                                        |
| `part.data` `$.type ∈ {text, reasoning, tool, step-start, step-finish}`; content lives in parts                   | **Verified**                                                                        |
| tool part: `$.tool`→name, `$.state.input`→input, `$.state.output`→output, `$.state.status`                        | **Verified**                                                                        |
| part/message order: `id` is creation-sortable, monotonic with `rowid` and `time_created`                          | **Verified**                                                                        |
| Compaction representation (per-event message/part vs session-level `summary_*`/`time_compacting`)                 | **TBV — increment 1** (no compaction in available store; defensive absence default) |
| Windows store path (`%USERPROFILE%\.local\share\opencode` vs `%LOCALAPPDATA%`)                                    | **TBV — increment 1** (degrades to absent-store no-op if wrong)                     |
| Extension-host `node:sqlite` availability across the `^1.109.0` range                                             | **TBV — increment 1 smoke-check** (graceful degradation covers the negative)        |
| Deferred-read snapshot isolation under `node:sqlite` (concurrent write not visible across an open read txn)       | **TBV — increment 1 smoke-check** (underpins the torn-read mitigation, §1)          |
| `time_updated` advances on an in-place session edit (else fall back to a SHA-1 of the materialized JSON)          | **TBV — increment 1** (names the fingerprint fallback condition, §5)                |

## Alternatives considered

**Store-access mechanism** (SPEC-003 §6). Empirical: the live store carried a 716 KB WAL; main-file-only read was ~45 min stale (10 msg/44 part) vs WAL-aware (11/52) — WAL-correctness is mandatory.

| Option                                | Portable (single package)   | WAL-correct read-only                              | New npm/native dependency | Verdict    |
| ------------------------------------- | --------------------------- | -------------------------------------------------- | ------------------------- | ---------- |
| **A — `node:sqlite` (Node built-in)** | Yes                         | **Yes — empirically verified**                     | **None** (built-in)       | **Chosen** |
| B — `sql.js` (WASM)                   | Yes                         | No (cannot read `-wal` without bespoke WAL replay) | Yes (~1 MB)               | Rejected   |
| C — `better-sqlite3` (native)         | No (per-platform prebuilds) | Yes                                                | Yes (native)              | Rejected   |

`node:sqlite` is unflagged on Node ≥ 24 (VS Code 1.125 / Electron 42 = Node 24); behind the `^1.109.0` floor it may be absent — handled by feature-detection + graceful degradation (§1), not an engine bump or a dependency.

**Ingestion of a non-file source** (SPEC-003 Pipeline integration): (A, chosen) extend `SessionFile` so content comes from an optional in-memory accessor — additive, no shared-contract break; (B) DB-aware `SessionParser` — rejected (mutates the shared contract); (C) OpenCode-only `readAndParse` fork — rejected.

**Change-detection signal**: (A, chosen) the per-session fingerprint IS the `SessionFile.compositeMtime`, computed from the DB row — this scopes re-archiving per-session with no cross-workspace churn and no redundant file-stats; store-file watch patterns trigger cycles separately. (B) a store-triplet file-mtime folded into compositeMtime — rejected as redundant once the per-session fingerprint is authoritative (it would fire on any cross-workspace write).

**Materialized-session format**: a closed internal JSON contract between `OpenCodeProvider` (producer) and `OpenCodeParser` (consumer) — chosen and specified in §3 — over an unspecified "deterministic serialization," because producer and consumer are distinct components and an unnamed format is a silent integration bug.

## Architectural decisions and rationale

### 1. Store access: `node:sqlite`, read-only, feature-detected, two-tier failure handling

- Open with `node:sqlite` `DatabaseSync(path, { readonly: true })` — no checkpoint, no exclusive lock, journal-aware (SPEC-003 §1/§2). Confine all `node:sqlite` use to one thin read-only adapter module (open, prepare, get/all, exec, close) so any experimental-API change has a single touch-point.
- **Snapshot consistency:** a single session's reads (session row + its messages + their parts) execute inside **one deferred read transaction** (`BEGIN DEFERRED … COMMIT` via the adapter) so a concurrent OpenCode commit cannot interleave a message with missing/orphaned parts (the live WAL makes this real). Increment 1's smoke-check verifies this snapshot isolation actually holds under `node:sqlite`'s binding (a concurrent write during an open read transaction is not visible at transaction close) before the mitigation is relied upon.
- **`-shm` / open mode:** read-only WAL reads require the `-shm` sidecar to be readable; the adapter opens read-only (never `immutable`, which would ignore the WAL) and treats the store triplet as read-only. The smoke-check (increment 1) asserts `opencode.db`, `-wal`, and `-shm` are byte-unchanged after a cycle (SPEC-003 AC-7/AC-12).
- **Two-tier failure taxonomy** (SPEC-003 Error-handling §2):
  - _Tier 1 — `node:sqlite` module absent_ (older runtime): the feature-detect guard (`require('node:sqlite')` in try/catch) leaves the provider inactive and emits **one** deduped, non-intrusive signal (§ below). Distinct from a store problem.
  - _Tier 2 — store present but unopenable_ (locked beyond tolerance, corrupt, permission-denied): the `DatabaseSync` construction/query sits in a **per-store try/catch outside** the module guard; failure contributes zero sessions for that store and emits a throttled, user-visible diagnostic distinct from the absent-store no-op.
- **Degradation signal (Tier 1)** (SPEC-003 OR-001): surfaced via the output channel plus a one-time informational notification (not a modal), naming the cause and remediation ("OpenCode session archiving needs a newer VS Code whose bundled runtime provides SQLite; other archiving is unaffected"). A module-level once-guard dedups it; it is distinct from the out-of-scope-store signal and from the Tier-2 diagnostic.
- **Experimental warning:** `node:sqlite` emits a one-time `ExperimentalWarning` to the extension-host **stderr** (the extension log), which is not user-facing; no fragile suppression is attempted. On runtimes lacking the module the warning never arises (provider inactive).

### 2. `OpenCodeProvider` (`providers/openCodeProvider.ts`, name `open-code`)

- **`resolveStores()`:** if `OPENCODE_DB` is set non-empty, use only that path; else enumerate `opencode*.db` (default + per-channel) under `$XDG_DATA_HOME/opencode` or the platform default (`~/.local/share/opencode`; Windows path TBV per the verification table, degrading safely to absent if wrong). No `*.db` present but a legacy flat-JSON tree present → out-of-scope detect-and-signal. Absent → no sessions. A non-existent `OPENCODE_DB` path is treated as absent (silent no-op); a present `OPENCODE_DB` path that is not a readable OpenCode store routes to Tier-2 (user-visible diagnostic). The out-of-scope signal uses the same surface as Tier-1 (output channel + one-time deduped notification), distinct from Tier-1 and Tier-2.
- **`findSessions(workspaceRootPath)`:** for each store, open read-only and `SELECT` session rows; keep those whose `directory` resolves (real path) to the real path of `workspaceRootPath`. **Directory guard:** require an absolute `directory` before `realpath` (a relative/empty value is skipped with a debug log — `realpath` on a relative value would resolve against the host cwd and risk a false match). Normalize both sides: real-path resolve, case-fold on case-insensitive volumes, separator-normalize, strip trailing separators; reject prefix/nested matches.
- Each kept session → a `SessionFile` with `providerName: 'open-code'`, a stable `archiveName` from the sanitized session id, `ctime`/`mtime` from the session epoch fields, `compositeMtime` = the per-session fingerprint (§5), and the content accessor (§3). `SessionFile.uri` is made **optional** (see §3); OpenCode sessions omit it.

### 3. Ingestion seam — optional `SessionFile` content accessor

- Extend `SessionFile`: add optional `readContent?(): Promise<string>` and make `uri` optional (`uri?`). Additive — existing providers keep `uri` + `fs.readFile` and omit `readContent`; their behavior is unchanged.
- In `archiveService.readAndParse`: when `readContent` is present, use its result as the raw content for `parser.parse(content, archiveName, companionContext)`; else the existing `fs.readFile(session.uri)` path.
- **`readContent()` exception isolation:** in `readAndParse`, the `readContent()` call is wrapped in its own try/catch; a throw emits a per-session warn-level log and skips that session (Tier-2 isolation semantics) without propagating to the outer exception-catch or aborting the cycle. Tested: a `readContent` that throws skips its session while the next session in the same cycle still processes.
- **`copyRawArchive` is unreachable for content-backed sessions.** The reviewer found three sites that reach `copyRawArchive(session.uri, …)`: the no-parser path, the `unrecognized`-result path, and the outer exception-catch. At all three, when `readContent` is present (no real file backing), the session is **skipped** — no copy, no file written, warn-level log (SPEC-003 Error-handling §1). This holds even if the parser is not yet registered (increment ordering).
- **Companion resolution guard:** `resolveCompanionData` is a Claude-Code file optimization keyed on `session.uri`; content-backed sessions skip it and pass an empty companion context.
- **Materialized format (closed internal contract `OpenCodeProvider` ⇄ `OpenCodeParser`):** `readContent` returns a deterministic JSON document:

  ```json
  {
    "schemaVersion": 1,
    "session": {
      "id": "...",
      "directory": "...",
      "title": "...",
      "agent": "...",
      "parentId": null,
      "timeCreated": 0,
      "timeUpdated": 0,
      "timeCompacting": null,
      "summary": { "additions": 0, "deletions": 0, "files": 0, "diffs": "" }
    },
    "messages": [
      {
        "id": "...",
        "role": "user|assistant",
        "timeCreated": 0,
        "parts": [{ "id": "...", "type": "text|reasoning|tool|...", "data": {} }]
      }
    ],
    "subagents": [
      {
        "session": { "id": "...", "agent": "...", "title": "...", "parentId": "..." },
        "messages": []
      }
    ]
  }
  ```

  Messages are ordered by `(time_created, id)`; parts within a message by `(time_created, id)` — the verified creation-sortable order. The parser consumes only this document.

### 4. `OpenCodeParser` (`markdown/parsers/openCodeParser.ts`, providerName `open-code`)

- Each `message` → one turn: role `user`→user, `assistant`→agent. Turn content assembled from the message's ordered parts — `text`→content, `reasoning`→thinking, `tool`→a tool call (**verified** mapping: `$.tool`→name, `$.state.input`→input, `$.state.output`→output; `$.state.status` is informational and not rendered — an incomplete tool with no output renders without one, never fabricated), `step-start`/`step-finish` ignored. Timestamp from `message.timeCreated` (epoch **milliseconds**) → UTC ISO 8601 (SPEC-001/SPEC-003 §7). Defensive about envelope roles other than user/assistant.
- **Subagents:** child sessions (`parentId`) → `subagentSessions[]` (SPEC-002 structure): child `id`→agentId, child `agent`→agentType (fallback `"unknown"`), child `title`→description; child turns assembled by the same parts rules.
- **Compaction (TBV):** OpenCode keeps a session-level summary (`summary_*`, `time_compacting`) rather than a verified per-event compaction message in the available store. Increment 1 confirms whether a per-event compaction marker exists; if it does, it maps to `compactionSummaries[]` with a chronological position indicator the serialization carries; if OpenCode has no mid-conversation compaction events, `compactionSummaries` is empty (SPEC-003 AC-11 is then vacuously satisfied) — the parser must not fabricate one.
- **Empty-session predicate:** a session is excluded when it has no non-empty turns AND no subagent sessions AND no compaction summaries (SPEC-003 Error-handling §3 / AC-10).
- Register in `markdown/parsers/index.ts` (`PARSERS`) and `providers/index.ts` (`getDefaultProviders`).

### 5. Change detection

- `SessionFile.compositeMtime` = a **per-session fingerprint** string `"<timeUpdated>:<messageCount>:<partCount>"`, computed from the DB during `findSessions` with `messageCount`/`partCount` read inside the same per-session deferred read transaction as the content, so the fingerprint cannot drift from the snapshot it describes. This is authoritative for the re-archive decision and is inherently scoped to the workspace's sessions, so unrelated cross-workspace activity causes no re-archive (SPEC-003 Change-detection §2 / AC-6). Known limitation: a same-millisecond in-place edit that does not change counts would not be detected — acceptable for OpenCode's append-oriented model; a content hash is reserved as a documented fallback only if `time_updated` is found not to advance on edits.
- The **watch patterns** for triggering cycles cover `opencode.db` and `opencode.db-wal` — not `-shm`, which churns on every lock/frame event — under the existing watch debounce, so a write prompts a cycle; the re-archive decision is then made per-session by the fingerprint. (Trigger and re-archive-decision are separate concerns; only the latter must be workspace-scoped.)

## Concern assessment

- **Read-only / isolation / snapshot:** read-only open, per-session deferred read transaction, per-session try/catch; no write/lock/checkpoint on the source (AC-7/AC-9/AC-12).
- **Privacy / cross-workspace integrity:** exact both-sides real-path matching + absolute-directory guard prevents leaking another workspace's sessions into versioned output; positive isolation tests gate it (AC-2/AC-6).
- **Portability / dependency posture:** built-in only; single VSIX, no per-platform build; feature-detected degradation (AC depends on it).
- **Performance:** read-only queries over a small local DB; per-session materialization bounded by the existing max-archive-bytes ceiling.
- **Provider-agnostic:** the only shared change is additive (`readContent?`, `uri?` optional) on `SessionFile`; model, renderer, other providers untouched (AC-13).

## Increments

Single workstream (the producer/consumer materialized-format contract in §3 couples the seam and parser tightly; splitting risks an integration seam across workstream agents). Internal increment order:

1. **Store access + discovery + matching** — `node:sqlite` read-only adapter + feature-detect/two-tier failure; `resolveStores()`; `findSessions` with absolute-directory guard and both-sides real-path matching; provider skeleton emitting `SessionFile`s (no uri, fingerprint compositeMtime). Increment-1 also runs the schema-discovery subtasks: compaction representation, Windows path, and the extension-host `node:sqlite` smoke-check. Unit tests with a fixture store.
2. **Ingestion seam** — additive `readContent?`/`uri?`; `readAndParse` use of `readContent`; the three `copyRawArchive` skip guards; companion-resolution guard; session materialization to the §3 JSON. Seam tests with a stub parser (string passed through, copy skipped); existing providers unaffected.
3. **Parser + registration** — `OpenCodeParser` (parts→turn assembly, verified tool mapping, subagents, compaction-if-present, ms→UTC), registered. Fixture tests: tool calls, reasoning, subagents, role labels, empty-session predicate.
4. **Change detection + signalling + docs** — fingerprint compositeMtime + store-triplet watch patterns; Tier-1/Tier-2/out-of-scope/absent signalling (deduped); `docs/technical-context.md` + README provider list. Tests: re-archive-on-update, no cross-workspace churn, the signal paths.

## Risks and mitigations

- **`node:sqlite` absent in some target runtimes** → feature-detect + graceful no-op + Tier-1 signal; documented minimum-runtime note. Non-blocking by design.
- **`node:sqlite` API churn (experimental)** → confined to one read-only adapter module.
- **OpenCode schema evolution** → parser targets the verified v1.17.9 schema; unknown/changed shapes route to detect-and-signal rather than corrupt archives.
- **Torn read under live WAL** → per-session deferred read transaction.
- **Matching false positive (cross-workspace leak)** → exact both-sides real-path + absolute-directory guard + positive isolation tests as a release gate.
- **Compaction model uncertainty** → increment-1 discovery + defensive absence default; no fabrication.

## Open items at completion

None blocking. The three TBV items (compaction representation, Windows path, extension-host `node:sqlite` availability) are resolved within increment 1 by schema discovery and a smoke-check; each has a safe default (defensive absence; absent-store no-op; graceful degradation), so none gates the plan.
