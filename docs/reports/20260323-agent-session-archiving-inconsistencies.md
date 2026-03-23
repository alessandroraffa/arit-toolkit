# Agent Session Archiving — Inconsistency Report

**Date:** 2026-03-23
**Scope:** Codex and Copilot Chat sessions archived to `docs/archive/agent-sessions/` in the oceanus workspace
**Archive location:** `/Users/alessandroraffa/dev/oceanus/docs/archive/agent-sessions/`

---

## Executive Summary

| Provider     | Archived           | Format  | Critical Issues                                                                |
| ------------ | ------------------ | ------- | ------------------------------------------------------------------------------ |
| Codex        | 37 files           | all .md | Multi-turn flattening (22/37 sessions affected)                                |
| Copilot Chat | 48 .md + 11 .jsonl | mixed   | Envelope parsing failure (11 raw copies), empty stubs (4), turn mismatches (3) |

Two **critical parser bugs** cause systematic data loss:

1. **CodexParser** flattens all multi-turn sessions into a single User/Agent turn
2. **CopilotChatParser** fails to unwrap VS Code's `{kind, v}` serialization envelope

---

## 1. Codex Issues

### 1.1 Multi-Turn Flattening (CRITICAL)

**Root cause:** `CodexParser.parse()` in `src/features/agentSessionsArchiving/markdown/parsers/codexParser.ts` accumulates ALL JSONL events into a single `ParseState`, then calls `buildTurns()` which produces at most 1 user turn + 1 assistant turn.

- `state.userContent` is **overwritten** by each new `user_message` event → only the LAST user message survives
- All `function_call` / `custom_tool_call` events from ALL turns are merged into a single `pendingCalls` list
- The archived `.md` output shows `U:1 A:1 T:1` for every session regardless of actual content

**Impact:** 22 out of 37 archived Codex sessions are multi-turn. Data loss ranges from minor (2 user messages → 1) to severe (10 user messages → 1):

| Archived File                         | Original User Messages | Original Tool Calls | Archived |
| ------------------------------------- | ---------------------- | ------------------- | -------- |
| 202603092004-codex-019cd433.md        | **10**                 | 138                 | U:1 A:1  |
| 202603221444-codex-019d1600.md        | **6**                  | 77                  | U:1 A:1  |
| 202603191634-codex-019d06f2.md        | **5**                  | 102                 | U:1 A:1  |
| 202603131013-codex-019ce6ae.md        | **5**                  | 61                  | U:1 A:1  |
| 202603160922-codex-019cf5f0.md        | **5**                  | 162                 | U:1 A:1  |
| 202603211654-codex-019d1151.md        | **5**                  | 53                  | U:1 A:1  |
| 202603200203-codex-019d08fb.md        | **4**                  | 154                 | U:1 A:1  |
| 202602241532-codex-019c9048.md        | **3**                  | 65                  | U:1 A:1  |
| 202603120942-codex-019ce16b.md        | **3**                  | 138                 | U:1 A:1  |
| 202603160054-codex-019cf41f.md        | **3**                  | 34                  | U:1 A:1  |
| 202603172221-codex-019cfde3.md        | **3**                  | 64                  | U:1 A:1  |
| 202603212129-codex-019d124d.md        | **3**                  | 50                  | U:1 A:1  |
| (+ 10 more with 2 user messages each) |                        |                     |          |

**Fix needed:** The parser must detect `user_message` events as turn boundaries. Each user message should emit the accumulated assistant turn (with its tool calls) before starting a new cycle.

### 1.2 Missing Reasoning Sections

Only 5 out of 37 Codex sessions have `<summary>Reasoning</summary>` sections in the archive:

- 3 early sessions (2026-02-24, 2026-02-28) → have reasoning
- 1 session (2026-03-16, 019cf5f0) → has 26 reasoning blocks
- 1 session (2026-03-20, 019d08fb) → has 1 reasoning block
- 31 sessions → no reasoning at all

This may indicate:

- A Codex API change (reasoning format evolved)
- The parser's `handleReasoning()` only handles `summary_text` type, newer reasoning may use a different structure
- Or Codex sessions without explicit reasoning enabled genuinely lack this data

### 1.3 Sessions Not in Archive (Expected)

~55 Codex sessions exist in `~/.codex/sessions/` but aren't archived. These belong to other workspaces (nexpense, resilio-datahub, books, etc.). The `CodexProvider.cwdMatches()` correctly filters by workspace — this is expected behavior, not a bug.

---

## 2. Copilot Chat Issues

### 2.1 VS Code Envelope Parsing Failure (CRITICAL)

**Root cause:** `CopilotChatParser.parseContent()` in `src/features/agentSessionsArchiving/markdown/parsers/copilotChatParser.ts`:

```typescript
private parseContent(content: string): CopilotSession {
    try {
      return JSON.parse(content) as CopilotSession;  // succeeds with {kind, v}
    } catch {
      return this.tryJsonl(content);  // never reached for single-line JSON
    }
  }
```

VS Code serializes Copilot Chat sessions with a `{kind: 0, v: {...}}` envelope. `JSON.parse()` succeeds (doesn't throw), returning the envelope object. The parser then checks `data.requests` at the top level — which doesn't exist (`requests` is at `data.v.requests`). Result: `status: 'unrecognized'` → falls back to `copyRawArchive()`.

The `copilotJsonlReconstructor.ts` actually handles this correctly (processes `kind=0` → extracts `v` as root), but it's never reached because `JSON.parse()` doesn't throw.

**Impact:** 11 files archived as raw `.jsonl` instead of parsed `.md`:

| File                                     | Size       | v.requests                              |
| ---------------------------------------- | ---------- | --------------------------------------- |
| 202602240445-copilot-chat-7a54e9a3.jsonl | **2.9 MB** | **7 requests with content** — DATA LOSS |
| 202602240445-copilot-chat-4ebac531.jsonl | 1.3 KB     | 0 (empty)                               |
| 202602282042-copilot-chat-e3380c93.jsonl | 1.3 KB     | 0 (empty)                               |
| 202603010900-copilot-chat-ee0e73f7.jsonl | 1.3 KB     | 0 (empty)                               |
| 202603020032-copilot-chat-e2f0429e.jsonl | 1.3 KB     | 0 (empty)                               |
| 202603101420-copilot-chat-1bc4538f.jsonl | 1.4 KB     | 0 (empty)                               |
| 202603130226-copilot-chat-418b3bfd.jsonl | 1.3 KB     | 0 (empty)                               |
| 202603160058-copilot-chat-b5b93bb0.jsonl | 1.4 KB     | 0 (empty)                               |
| 202603181517-copilot-chat-9901b84a.jsonl | 1.3 KB     | 0 (empty)                               |
| 202603191800-copilot-chat-f62147e7.jsonl | 1.3 KB     | 0 (empty)                               |
| 202603221444-copilot-chat-4a4d1d26.jsonl | 1.3 KB     | 0 (empty)                               |

All 11 files are single-line JSON with `{kind: 0, v: {...}}` structure. 10 have empty `requests[]` (genuinely empty sessions). 1 has actual conversation data that was not converted to markdown.

**Fix needed:** `parseContent()` should check for the `{kind, v}` envelope and unwrap it:

```typescript
const raw = JSON.parse(content);
const data = raw.v && typeof raw.v === 'object' ? raw.v : raw;
```

### 2.2 Empty Stub .md Files

4 files have only the markdown header (136-181 bytes) with no conversation content:

| File                                  | Size  | Content                                                             |
| ------------------------------------- | ----- | ------------------------------------------------------------------- |
| 202603090513-copilot-chat-b7311380.md | 136 B | Header only, no turns                                               |
| 202603131614-copilot-chat-6be6586b.md | 136 B | Header only, no turns                                               |
| 202603171421-copilot-chat-bae38255.md | 136 B | Header only, no turns                                               |
| 202509250719-copilot-chat-b6145e31.md | 181 B | Header + 1 user message "converti la tabella in lista", no response |

These are sessions that were successfully parsed but contained no meaningful content. The archiver writes them anyway, creating noise in the archive.

**Suggestion:** Add a minimum-content threshold — skip archiving sessions with 0 agent turns or < 200 bytes of content.

### 2.3 User/Agent Turn Mismatches

3 `.md` files where the number of user turns doesn't match agent turns:

| File                                  | User Turns | Agent Turns | Gap                  |
| ------------------------------------- | ---------- | ----------- | -------------------- |
| 202504051500-copilot-chat-9d33fd10.md | 12         | 11          | 1 missing response   |
| 202509250719-copilot-chat-b6145e31.md | 1          | 0           | Empty stub (see 2.2) |
| 202603221254-copilot-chat-6c25d312.md | 6          | 3           | 3 missing responses  |

The 6c25d312 case is noteworthy: 6 user turns but only 3 agent responses. This could indicate:

- Streaming responses that hadn't completed when the session was archived
- Parser logic dropping response items that don't match expected `kind` values
- Copilot Chat format changes not handled by the parser

---

## 3. Cross-Cutting Observations

### 3.1 Format Distribution

| Format                    | Count | Quality                                      |
| ------------------------- | ----- | -------------------------------------------- |
| Codex .md (parsed)        | 37    | All structurally valid but content-flattened |
| Copilot .md (parsed)      | 48    | 44 good, 4 empty stubs                       |
| Copilot .jsonl (raw copy) | 11    | 10 empty sessions, 1 with lost content       |

### 3.2 Archive Naming Convention

All files follow `YYYYMMDDHHmm-<provider>-<UUID>.<ext>` consistently. The timestamp uses file `ctime` (creation time), not session start time from the content. No naming inconsistencies found.

### 3.3 Agent Text Fragmentation

Early Copilot `.md` files (notably `9d33fd10` from 2025-04) exhibit fragmented agent text where inline code references were stripped during JSON-to-markdown conversion, leaving broken sentences. Later files do not show this issue, suggesting the parser or renderer was improved over time.

### 3.4 Deduplication

The `deduplicateAndHydrate()` method groups by `archiveName` and keeps only the latest timestamp version. No duplicate entries found in the current archive.

---

## 4. Recommended Fixes (Priority Order)

### P0 — Critical Data Loss

1. **Fix CodexParser multi-turn flattening**: Refactor `parse()` to detect `user_message` events as turn boundaries. Each boundary should emit the accumulated turns before starting a new state. Affects 22/37 sessions.

2. **Fix CopilotChatParser envelope unwrapping**: In `parseContent()`, detect and unwrap the `{kind: 0, v: {...}}` envelope before returning. Affects 11 sessions (1 with actual content).

### P1 — Quality Improvements

1. **Investigate Copilot turn mismatches**: Analyze sessions 9d33fd10 and 6c25d312 against their originals to determine whether the parser drops valid response items.

2. **Investigate missing Codex reasoning**: Compare the raw JSONL of sessions with/without reasoning to determine whether this is a parser issue or an upstream format change.

### P2 — Noise Reduction

1. **Add empty session filter**: Skip archiving sessions with 0 agent turns or below a content-size threshold.

2. **Re-archive after fixes**: Once parsers are fixed, trigger a re-archive cycle to regenerate all affected `.md` files from the originals (which are still intact in their provider locations).
