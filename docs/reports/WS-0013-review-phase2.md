---
title: 'WS-0013 multi-perspective review — Phase 2 synthesis'
artifact: docs/workstreams/WS-0013-archive-gitignore-and-yyyymm-layout.md
gate: pre-implementation
risk_classification: high
produced_at: 2026-05-25
---

## 1. Phase 1 inputs (recap)

- **artifact_type**: workstream
- **gate_name**: pre-implementation
- **risk_classification**: high
- **perspectives_activated**: white (Mendeleev), black (Cassandra), green (Archimedes), orange (Katniss)
- **relevant patterns**: KZ-2026-04-18-013 (line-number re-verification — White), KZ-2026-04-18-014 (multi-surface commit atomicity — Green/Black)

## 2. Per-hat finding counts and signals

| Hat    | Signal    | Findings | Critical | High | Medium | Low |
| ------ | --------- | -------- | -------- | ---- | ------ | --- |
| White  | satisfied | 4        | 0        | 0    | 3      | 1   |
| Black  | concerned | 6        | 0        | 2    | 3      | 1   |
| Green  | satisfied | 4        | 0        | 0    | 2      | 2   |
| Orange | concerned | 5        | 0        | 0    | 4      | 1   |

Totals before dedup: 19 findings.
Totals after dedup and merge: 16 findings (3 multi-hat merges).

---

## 3. White Hat findings (Mendeleev — facts, data, evidence)

### WT-001 — Line-number citations: VERIFIED against current state

- **severity**: low
- **confidence**: high
- **category**: factual-accuracy
- **evidence**: every line-number citation in the workstream (`src/core/git.ts` line 29; `src/types/index.ts` lines 27-32; `src/features/agentSessionsArchiving/archiveService.ts` lines 18, 21, 31, 52, 67, 73, 139, 144, 151, 157, 191, 192, 213, 218, 219, 230, 256-273, 275-293, 309-315; `src/features/agentSessionsArchiving/index.ts` lines 100-111, 104, 113-121; `test/unit/core/git.test.ts` line 355; `test/unit/features/agentSessionsArchiving/archiveService.test.ts` line 448, 457, 473, 491, 513, 530; `test/unit/features/agentSessionsArchiving/archiveService.dedup.test.ts` test count = 10; `test/unit/mocks/vscode.ts` `Uri.joinPath` line 84-86; `docs/technical-context.md` section 8.6 line 415, "Force re-archive" line 512, "Archive file naming" line 504, "One-shot re-archive" line 491, `lastArchivedMap` diagram line 429; section 4.3 line 228).
- **rationale**: confirms KZ-2026-04-18-013 is satisfied — no stale citations.
- **proposed_action**: none (positive finding).
- **blocking**: false

### WT-002 — "One-shot migration" terminology is imprecise

- **severity**: medium
- **confidence**: high
- **category**: precision
- **evidence**: workstream lines 11 and 965 describe the flat-layout migration as "one-shot" and "on the first archive cycle after upgrade". The actual mechanism (Task 3.2 + Task 3.1) is: `_needsDedup = true` is reset in `start()`; `deduplicateAndHydrate` (which calls `migrateFlatLayout`) runs once per `start()`. `start()` is invoked on every `reconfigure`, on extension activation, and after `moveArchive`. So the migration scan runs many times — not "one-shot". It is **idempotent** (a no-op after first successful migration), which is the intended behavior, but "one-shot" mis-describes it.
- **rationale**: terminology drift between intent ("idempotent migration sweep on every start") and label ("one-shot migration"). Risk: future readers infer the wrong mechanism and add ad-hoc gating.
- **proposed_action**: replace "one-shot" with "idempotent migration sweep that runs on every cold start and reconfigure, no-op once the tree is fully migrated" in workstream intro (line 11) and `docs/technical-context.md` paragraph (Task 4.2).
- **blocking**: false

### WT-003 — `migrateFlatLayout` regex accepts invalid month values

- **severity**: low
- **confidence**: high
- **category**: correctness
- **evidence**: Task 3.2 line 457 — `const FLAT_PATTERN = /^(\d{4})(\d{2})\d{8}-.+\.\w+$/`. The `\d{2}` capture for month accepts `00`, `13`, ..., `99`. A pathological filename `202099310000-foo.md` would be "migrated" into `2020/99/`, creating an invalid month directory.
- **rationale**: this is unlikely to occur from `generateTimestamp('YYYYMMDDHHmm', ...)` outputs (which always produce valid months), but a manual file landing in the archive could be moved to an invalid location and silently succeed.
- **proposed_action**: tighten regex to `^(\d{4})(0[1-9]|1[0-2])\d{8}-.+\.\w+$` — accept only valid month values.
- **blocking**: false

### WT-004 — Task 4.1 test scaffold incomplete for one assertion

- **severity**: medium
- **confidence**: medium
- **category**: completeness
- **evidence**: workstream lines 951-955, test `'should leave the source in place and continue when copy fails'`: chains `mockRejectedValueOnce(new Error('disk full'))` then `mockResolvedValueOnce(undefined)`. The test asserts `workspace.fs.delete` was called exactly once. But `migrateFlatLayout` reads top entries (one pre-migrate call); the rejection comes from `workspace.fs.copy`, not `readDirectory`. The post-migrate re-read is `mockResolvedValueOnce([['202605251830-foo.md', FileType.File]])` (the failed source). The chain has only 2 `readDirectory` returns. After the post-migrate re-read, `deduplicateAndHydrate` proceeds to scan for `^\d{4}$` year directories at the top level — the entry `'202605251830-foo.md'` is `FileType.File`, not `Directory`, so the year loop is empty. No further `readDirectory` calls. Verified correct, but the test fixture deserves a comment noting that the failed-source file at top level is correctly skipped by the year-dir regex.
- **rationale**: test setup is non-obvious; a future maintainer changing the dedup body might assume the year scan iterates over file entries and add an erroneous third `readDirectory` mock.
- **proposed_action**: add a `// Note:` comment in the test body explaining why the top-level `File` entry is naturally ignored by `^\d{4}$` after migration failure.
- **blocking**: false

---

## 4. Black Hat findings (Cassandra — risks, failure modes, security)

### BK-001 — `moveArchive` unconditional source deletion on partial copy failure (potential data loss)

- **severity**: high
- **confidence**: high
- **category**: data-integrity
- **evidence**: Task 3.3 lines 643-649 — `moveArchive` body. After the for-loop attempts per-file copies (which catch errors and log at `warn`), the method unconditionally calls `await vscode.workspace.fs.delete(oldUri, { recursive: true })`. There is no tracking of failed copies; the recursive delete proceeds even when some files failed to copy. Compare with `migrateFlatLayout` (Task 3.2 lines 472-481): on copy failure, the source file is `left in place`. Asymmetric failure semantics for the same primitive (copy-then-delete).
- **rationale**: if a user changes `archivePath` while one of the source files is locked (Windows: VS Code holding a read handle), or the destination disk is full mid-copy, the copy fails for that file but the per-file try/catch swallows the error. Then the recursive delete wipes the source tree — including the file whose copy just failed. The user has lost the archive. The `warn` log is the only signal, and Output Channel discoverability is low.
- **proposed_action**: refactor `moveArchive` to track failed copies and skip the recursive delete (or skip it for the failed file's parent directory) when any copy failed. Minimum: track `let allCopiesSucceeded = true;` updated to `false` in each catch; gate the final `vscode.workspace.fs.delete(oldUri, { recursive: true })` on `allCopiesSucceeded`. When false, log at `warn` with explicit guidance: "left source archive in place at `${oldPath}` — manual cleanup required after verifying `${newPath}` is complete".
- **blocking**: true (deduplicated with GR-001 — same code path, complementary view)

### BK-002 — Recursive `reconfigure` via `updateConfig` callback (re-entrancy)

- **severity**: medium
- **confidence**: high
- **category**: re-entrancy
- **evidence**: Activity 2 Task 2.1 wires `checkAndPromptGitignore` inside `reconfigure`. When the user accepts the prompt, the `updateConfig` callback in Task 2.2 calls `stateManager.updateConfigSection(CONFIG_KEY, ...)`. `ExtensionStateManager.updateConfigSection` (verified at `src/core/extensionStateManager.ts` lines 109-117) writes the value AND calls `notifySectionListeners`. The section listener for `CONFIG_KEY` (registered in `index.ts` line 113-121) calls `service.reconfigure(oldConfig, newConfig, updateConfig)` again. In the recursive call, `oldConfig.archivePath === newConfig.archivePath` (only `gitignoreDecisions` differs), so `moveArchive` is skipped. But `start(newConfig)` runs in the recursive call, restarting the timer and triggering a fresh `runArchiveCycle()` (which now includes migration scan via `_needsDedup = true`). Control returns to the outer `reconfigure`, which proceeds past the `await checkAndPromptGitignore(...)` and calls `start(newConfig)` AGAIN. Net effect: `start()` called twice in sequence, timer churned twice, `_needsDedup` reset twice. Wasteful, and the second `start()` overwrites the first's interval handle without clearing it (line 39-41) — but `this.stop()` is called at line 31 of `start()`, which clears the previous timer. So no leaked interval, but two `runArchiveCycle()` invocations within microseconds, both racing on `lastArchivedMap`.
- **rationale**: not data-corrupting (operations are idempotent), but expensive and unintuitive. Future maintainers adding state initialization to `start()` could introduce real races.
- **proposed_action**: add a guard `private _reconfiguring = false;` to `AgentSessionArchiveService.reconfigure`. Set true at entry, false at exit, and early-return if already true. Alternatively, defer the `updateConfig` callback's side-effect to next tick using `queueMicrotask` or `setImmediate` and gate the outer `reconfigure`'s `start()` on a "no recursive reconfigure occurred" flag. Document the chosen mechanism in `technical-context.md`.
- **blocking**: false

### BK-003 — `.gitignore` write race with concurrent VS Code extensions

- **severity**: medium
- **confidence**: medium
- **category**: concurrency
- **evidence**: Task 1.3 — `writeGitignoreEntry` performs a non-atomic read-modify-write (`fs.readFile` → decode → check → encode → `fs.writeFile`). If another VS Code extension or external process modifies `.gitignore` between the read and the write, the write clobbers the other change. No file locking, no compare-and-swap, no `fs.append`.
- **rationale**: VS Code extension ecosystem includes other tools that write to `.gitignore` (e.g., Git extension's "ignore" command, Husky, lint-staged installers). Probability low but non-zero.
- **proposed_action**: option A: use `fs.append` via `fs.writeFile(uri, encoded, { append: true })` — but VS Code's `workspace.fs.writeFile` does not support append mode. Option B: re-read inside a retry loop and bail out after N attempts. Option C: accept the limitation, document it in `technical-context.md` as "best-effort, last-write-wins". Pick option C with explicit documentation.
- **blocking**: false

### BK-004 — `.gitignore` entry has no trailing-comment provenance — no user signal for who wrote it

- **severity**: medium
- **confidence**: high
- **category**: operability
- **evidence**: Task 1.3 step "no comment is added" (workstream line 174 and explicit in step "Build the entry line: ``const entryLine = `${archivePath}/`;``"). Resulting `.gitignore` line is opaque (just `docs/archive/agent-sessions/`).
- **rationale**: a user inspecting `.gitignore` six months later sees an unattributed entry. If they remove it (thinking it was orphaned), the extension will re-prompt (because the path is no longer ignored, and the decision is still `'ignored'` — wait, the decision IS `'ignored'`, so Step 2 of `checkAndPromptGitignore` short-circuits, the prompt does NOT re-appear, and the user has silently lost the gitignore protection). This is a real operability footgun.
- **proposed_action**: change `entryLine` to two lines: `\n# Managed by Tangyr Workbench (agent sessions archive)\n${archivePath}/\n`. Adjust the existing-entry check to look only at the path line. Update tests.
- **blocking**: false (deduplicated with OR-002)

### BK-005 — `ConfigMigrationService` interaction with new sparse `gitignoreDecisions` field

- **severity**: low
- **confidence**: high
- **category**: backward-compatibility
- **evidence**: verified at `src/core/configMigration/migrationService.ts` lines 13-18 — `findMissingSections` operates at SECTION key granularity, not field granularity. Adding a new optional field `gitignoreDecisions?` to `AgentSessionsArchivingConfig` (Task 1.2) does NOT trigger any migration prompt; existing users with the section present simply have an absent field, which the reader code handles via `config.gitignoreDecisions ?? {}` (Task 1.3 Step 2). The `defaultValue` registered in `registerWithCore` (verified at `src/features/agentSessionsArchiving/index.ts` lines 22-32) does NOT include the field, which is correct per Task 1.2's explicit instruction.
- **rationale**: confirms the sparse-field design is compatible with the existing config migration model. Positive finding.
- **proposed_action**: none.
- **blocking**: false

### BK-006 — `ensuredDirectories` cache key collision under test mock (latent)

- **severity**: low
- **confidence**: medium
- **category**: testability
- **evidence**: Task 3.1 — cache keyed on `uri.fsPath`. Mock at `test/unit/mocks/vscode.ts` lines 84-86 produces `fsPath` as `${base.fsPath}/${pathSegments.join('/')}`. For real `vscode.Uri.joinPath(base, '2026/05')` in tests with `base = { fsPath: '/workspace/docs/archive/agent-sessions' }`, the resulting fsPath is `/workspace/docs/archive/agent-sessions/2026/05`. Now `vscode.Uri.joinPath(base, '2026', '05')` also produces `/workspace/docs/archive/agent-sessions/2026/05` — consistent. Cache keying is robust. But the mock never canonicalizes (e.g., `'./2026/05'` vs `'2026/05'`), so a production code path using a relative segment with `./` prefix would cache as a different key from one without — though no such code path exists today.
- **rationale**: no current bug. Latent risk for future refactors.
- **proposed_action**: add a JSDoc comment on `ensuredDirectories` noting "keys are raw `uri.fsPath`; do not introduce relative-segment normalization without invalidating the cache".
- **blocking**: false

---

## 5. Green Hat findings (Archimedes — alternatives, simplification)

### GR-001 — `moveArchive` failure semantics asymmetry — unify with `migrateFlatLayout`

- **severity**: high
- **confidence**: high
- **category**: consistency
- **evidence**: Task 3.3 `moveArchive` deletes the source on completion regardless of per-file copy outcome (workstream lines 643-649). Task 3.2 `migrateFlatLayout` (lines 472-481) leaves the source on per-file copy failure. Two related operations (both do copy-then-delete of an archive subtree) with opposite failure handling.
- **rationale**: any reader of the code who learns the `migrateFlatLayout` contract ("failed copies leave source in place") will be surprised by `moveArchive`. The asymmetry is also a maintenance trap: a future refactor that unifies the helpers may pick the wrong default.
- **proposed_action**: factor a shared private helper `private async copyOrLeaveInPlace(srcUri, destUri): Promise<{ copied: boolean }>` returning success/failure; have both `moveArchive` and `migrateFlatLayout` use it; let `moveArchive` aggregate results and skip the recursive delete when any copy failed (see BK-001 mitigation).
- **blocking**: true (deduplicated with BK-001 — Black Hat: data-integrity; Green Hat: consistency. Same code site, complementary lenses.)

### GR-002 — `groupArchiveFiles` dual-form regex — simplify post-migration

- **severity**: low
- **confidence**: medium
- **category**: simplification
- **evidence**: Task 3.2 — `PATTERN = /^(?:\d{4}\/\d{2}\/)?(\d{12})-(.+)\.\w+$/`. The optional `(?:\d{4}\/\d{2}\/)?` prefix is necessary only for the (now-impossible) transitional state where a flat-layout file appears in `combined`. Post-migration, `combined` only contains paths from the YYYY/MM scan (always prefixed). The optional adds regex complexity for zero benefit after migration.
- **rationale**: minor simplification.
- **proposed_action**: keep the optional prefix BUT add a code comment: `// optional prefix retained for safety during transitional cycles where migrateFlatLayout fails to migrate one file; that file is left at top level and is NOT included in 'combined' (it's only File at top, not under YYYY/MM), so the optional is currently unreachable. Remove if proven unreachable after release N+1.`
- **blocking**: false

### GR-003 — `writeGitignoreEntry` defensive validator call is currently unreachable

- **severity**: medium
- **confidence**: high
- **category**: simplification
- **evidence**: Task 1.3 helper `writeGitignoreEntry` re-validates `archivePath` at entry. The only call site is `checkAndPromptGitignore` Step 4, which has ALREADY validated at Step 0 and short-circuited on failure. The defensive re-validation is justified ("the helper may be called from other code paths in the future") but is dead code today.
- **rationale**: dead code carries maintenance cost. If never exercised, future refactors may break it silently.
- **proposed_action**: keep the defensive call AND add a unit test exercising it directly (call `writeGitignoreEntry` with an invalid path, assert it throws). This makes the defense provable.
- **blocking**: false

### GR-004 — Activity 1 & 2 commit boundaries could be merged

- **severity**: medium
- **confidence**: medium
- **category**: commit-atomicity
- **evidence**: Activity 1 introduces `checkAndPromptGitignore` and wires it into the activation path (`onDidChangeState`). Activity 2 changes `reconfigure`'s signature and wires the prompt into reconfigure. Both touch `index.ts` and produce `feat:` commits. Each commit must independently pass `pnpm run check-types && pnpm run lint && pnpm run test:unit` (workstream lines 262, 345). Between commit 1 and commit 2, the prompt fires on activation but NOT on reconfigure — a partial-feature state visible to anyone who checks out the intermediate SHA. This is correct per multi-surface commit atomicity (KZ-2026-04-18-014), but the partial-feature state has questionable value for review/bisect.
- **rationale**: the work could be packaged as one commit per activity OR one commit per feature. Current packaging optimizes for git history granularity at the cost of intermediate-state coherence.
- **proposed_action**: accept current packaging (4 commits) — the per-activity quality gate is documented and enforceable. No change.
- **blocking**: false

---

## 6. Orange Hat findings (Katniss — impact, adoption, value)

### OR-001 — Decline path is sticky with no user-facing reset command

- **severity**: medium
- **confidence**: high
- **category**: adoption-friction
- **evidence**: Task 1.3 Step 4 — on `'Skip'` or dismissal, the decision is stored as `'declined'`. Step 2 (`existing[archivePath]` defined) short-circuits future prompts. There is no command, palette entry, or settings UI to clear the decision. The only recovery is editing `.tangyr.jsonc` manually to remove the `gitignoreDecisions` entry. Workstream lines 166-171 confirm this design ("dialog dismissed" → `'declined'`).
- **rationale**: a user who clicks "Skip" by accident or impulse loses the prompt forever. The dismissal-equals-decline conflation (line 167 comment "response is 'Skip' or undefined (dialog dismissed)") treats two semantically distinct user actions identically.
- **proposed_action**: option A: distinguish dismissal (undefined) from explicit Skip — store dismissal as a re-promptable state (next session, prompt re-appears). Option B: add a command `tangyr.archiving.resetGitignorePrompt` that clears the decision for the current `archivePath`. Pick option B for explicit user control. Add to the workstream as a new task in Activity 1.
- **blocking**: false

### OR-002 — `.gitignore` entry lacks provenance comment — discoverability + footgun

- **severity**: medium
- **confidence**: high
- **category**: operability
- **evidence**: workstream line 174 explicitly states "The entry written is the path line only (no surrounding comment)". The resulting `.gitignore` shows `docs/archive/agent-sessions/` with no indication of who added it or why.
- **rationale**: deduplicated with BK-004 — same evidence, both hats flag the same concern with different lenses: Black Hat flags the silent-loss-of-protection failure mode; Orange Hat flags the user discoverability and adoption friction.
- **proposed_action**: see BK-004 mitigation. Add `# Managed by Tangyr Workbench (agent sessions archive)` comment above the path entry.
- **blocking**: false (merged with BK-004)

### OR-003 — Migration without progress UI on large archives

- **severity**: medium
- **confidence**: medium
- **category**: adoption-friction
- **evidence**: Task 3.2 `migrateFlatLayout` iterates top-level entries; for each match, performs a `copy` + `delete`. No progress notification (`vscode.window.withProgress` not used). For a user with 1000+ archived sessions, the first cycle after upgrade blocks the timer for the duration of the migration (sequential copies). VS Code does not show any indication that work is happening.
- **rationale**: extension activation already shows a brief indicator, but post-activation work is silent. A user wondering "why is my disk thrashing?" has no answer.
- **proposed_action**: wrap `migrateFlatLayout` in `vscode.window.withProgress({ location: ProgressLocation.Window, title: 'Migrating archive layout...' }, ...)` when the iteration count exceeds a threshold (e.g., 50 entries). Show progress per file. Add to workstream Task 3.2.
- **blocking**: false

### OR-004 — Three feat: commits produce three minor version bumps via semantic-release

- **severity**: medium
- **confidence**: high
- **category**: release-friction
- **evidence**: Activities 1, 2, 3 each produce a `feat:` commit (workstream lines 263, 346, 936). Activity 4 produces a `test:` commit (line 972). Per the workstream's note at line 972 ("semantic-release will not produce a release entry from it"), only `feat:` commits trigger minor bumps. Three `feat:` commits on `main` produce three sequential minor version bumps. End users see three release entries for what is conceptually one feature pair (gitignore prompt + YYYY/MM layout).
- **rationale**: release notes pollution; downstream signal-to-noise reduced.
- **proposed_action**: option A: squash the three `feat:` commits into one at PR merge time (PM-controlled, allowed by project convention if documented). Option B: convert Activity 2's commit to `refactor:` since it extends a method signature without adding standalone user-visible behavior (the prompt was already added in Activity 1). Pick option B AND adjust the workstream commit message in Task 2.5 to `refactor(archiving): extend reconfigure to invoke gitignore prompt on archivePath change`.
- **blocking**: false

### OR-005 — Recovery and operability documentation gap

- **severity**: low
- **confidence**: high
- **category**: documentation-gap
- **evidence**: Tasks 1.6, 2.4, 3.6, 4.2 update `docs/technical-context.md` with implementation detail. None of them add user-facing operability guidance: where to find logs (Output Channel name), how to undo a gitignore decision, what to do if migration leaves the tree in a mixed state.
- **rationale**: technical-context is internal; users won't read it. The extension's user-facing docs (README, Marketplace description) are not updated by this workstream — appropriate scope, but the gap should at least be acknowledged.
- **proposed_action**: add a follow-up task (or PM-controlled separate workstream) to update user-facing README with a "Troubleshooting archive" section. Do not block this workstream on it.
- **blocking**: false

---

## 7. Conflict resolutions

No reviewer-vs-reviewer conflicts. Black and Green Hat findings BK-001 and GR-001 reference the same code site (`moveArchive` source deletion) with complementary framings — merged into a single multi-hat finding (see deduplication below). Black and Orange Hat findings BK-004 and OR-002 reference the same code site (`.gitignore` entry comment) — merged into a single multi-hat finding.

---

## 8. Deduplicated finding list

| ID        | Title                                                               | Severity | Confidence | Hats           | Blocking |
| --------- | ------------------------------------------------------------------- | -------- | ---------- | -------------- | -------- |
| **F-001** | `moveArchive` unconditional source deletion on partial copy failure | high     | high       | Black + Green  | **yes**  |
| **F-002** | `.gitignore` entry lacks provenance comment                         | medium   | high       | Black + Orange | no       |
| F-003     | Recursive `reconfigure` via `updateConfig` callback                 | medium   | high       | Black          | no       |
| F-004     | `.gitignore` write race with concurrent extensions                  | medium   | medium     | Black          | no       |
| F-005     | `ConfigMigrationService` interaction with sparse field (positive)   | low      | high       | Black          | no       |
| F-006     | `ensuredDirectories` cache key collision (latent)                   | low      | medium     | Black          | no       |
| F-007     | `groupArchiveFiles` dual-form regex (post-migration simplification) | low      | medium     | Green          | no       |
| F-008     | `writeGitignoreEntry` defensive validator currently unreachable     | medium   | high       | Green          | no       |
| F-009     | Activity 1 & 2 commit-boundary partial-state visibility             | medium   | medium     | Green          | no       |
| F-010     | Decline path is sticky — no reset command                           | medium   | high       | Orange         | no       |
| F-011     | Migration without progress UI on large archives                     | medium   | medium     | Orange         | no       |
| F-012     | Three feat: commits produce three minor version bumps               | medium   | high       | Orange         | no       |
| F-013     | Recovery and operability documentation gap                          | low      | high       | Orange         | no       |
| F-014     | Line-number citations verified (positive)                           | low      | high       | White          | no       |
| F-015     | "One-shot migration" terminology is imprecise                       | medium   | high       | White          | no       |
| F-016     | `migrateFlatLayout` regex accepts invalid month values              | low      | high       | White          | no       |
| F-017     | Task 4.1 test scaffold needs comment for non-obvious skip           | medium   | medium     | White          | no       |

Blocking findings (severity ≥ high AND confidence = high): **F-001 only**.

---

## 9. Verdict

**Verdict: PASS_WITH_CONDITIONS**

```yaml
verdict:
  result: 'PASS_WITH_CONDITIONS'
  artifact_type: 'workstream'
  gate_name: 'pre-implementation'
  artifact_version: 'WS-0013 draft @ 2026-05-25'
  risk_classification: 'high'
  perspectives_activated: [white, black, green, orange]
  blocking_findings: [F-001]
  conditions:
    - 'Address F-001 (data-loss vector in moveArchive): modify Task 3.3 to gate the final recursive delete on per-file copy success. Track failures; on any failure, log explicit guidance and skip the source-tree delete. Add a unit test asserting the source survives when one of N copies fails.'
  conflicts: []
  summary: |
    The workstream is well-structured, with verified line-number citations
    (satisfies KZ-2026-04-18-013), bounded scope, clear per-task contracts,
    and explicit quality-gate enforcement per commit (satisfies
    KZ-2026-04-18-014). One blocking finding (F-001) exists: moveArchive's
    Task 3.3 body unconditionally deletes the source tree after the per-file
    copy loop, even when individual copies failed. This creates a data-loss
    vector that contradicts migrateFlatLayout's symmetric "leave source on
    failure" semantics. The fix is mechanical and limited to Task 3.3. All
    other findings (medium and low) are non-blocking and can be addressed
    in-stream or deferred. Two multi-hat merges (F-001 = BK-001+GR-001,
    F-002 = BK-004+OR-002) confirm the cross-perspective convergence on
    the same code sites.
  next_actions:
    - 'PM disposes F-001: accept condition (modify Task 3.3 in the workstream draft before promoting to idle).'
    - 'PM optionally disposes F-002, F-003, F-010, F-011, F-012 as in-stream improvements (recommended) or defers to follow-up.'
    - 'Author updates Task 3.3 with the BK-001/GR-001 mitigation; adds the missing test case; re-runs draft-review skill.'
    - 'Author updates Task 3.2 (regex tightening F-016) and workstream intro (terminology F-015) as low-cost in-stream fixes.'
    - 'After Task 3.3 fix, the workstream may be promoted from draft → idle.'
```

---

## 10. Improvement record

```yaml
improvement_record:
  gate: 'pre-implementation'
  artifact_type: 'workstream'
  produced_at: '2026-05-25'
  immediate:
    - classification: 'fix-now'
      description: 'Modify Task 3.3 moveArchive body to track per-file copy failures and skip recursive source delete when any copy failed; add corresponding unit test.'
    - classification: 'fix-now'
      description: 'Update Task 1.3 writeGitignoreEntry to add provenance comment "# Managed by Tangyr Workbench (agent sessions archive)" above the path entry; update existing-entry check; update tests.'
    - classification: 'next-iteration'
      description: 'Replace "one-shot" terminology with "idempotent migration sweep" in workstream intro and technical-context.md to align label with mechanism.'
  process:
    - classification: 'checklist-update'
      pattern: 'Workstreams that perform copy-then-delete primitives over a tree should document the failure semantics for partial-copy failure explicitly. The current workstream does so for migrateFlatLayout but not for moveArchive, producing asymmetric handling of related operations.'
      proposed_change: 'Add a workstream-authoring checklist item: "For each copy-then-delete primitive, document the failure-mode contract explicitly. When multiple primitives operate on related state, ensure the contracts are consistent or document the reason for asymmetry."'
      target: 'skills/workstream-authoring/SKILL.md (checklist-update)'
      owner: 'PM'
    - classification: 'instruction-update'
      pattern: 'Sticky decision-memory fields (e.g., gitignoreDecisions) require a corresponding user-facing reset path (command, settings entry, or doc). The current workstream stores decisions sticky without exposing a reset, creating a permanent footgun for accidental dismissal.'
      proposed_change: 'Add an authoring-standards note: "When a workstream introduces a persistent decision-memory field that gates a user prompt, the workstream must include a reset mechanism (command or settings UI) or explicitly justify its absence."'
      target: 'skills/workstream-authoring/SKILL.md (instruction-update)'
      owner: 'PM'
    - classification: 'template-update'
      pattern: 'Workstreams that produce N sequential feat: commits trigger N semantic-release minor bumps for what is conceptually one feature. The workstream template does not surface this trade-off at authoring time.'
      proposed_change: 'Add to the workstream template a "Release strategy" subsection that explicitly lists the commit-message-types in execution order and projects the resulting semantic-release outcome (e.g., "3 feat: commits → 3 minor bumps"). Author can then decide whether to squash or refactor commit types.'
      target: 'templates/workstream.md (template-update)'
      owner: 'PM'
```

---

## 11. Appendix — verification evidence

- `src/core/git.ts` read; line 29 confirmed as `isGitIgnored` closing brace.
- `src/types/index.ts` read; `AgentSessionsArchivingConfig` at lines 27-32 confirmed.
- `src/features/agentSessionsArchiving/archiveService.ts` read in full; all cited line numbers (18, 21, 31, 52, 67, 73, 139, 144, 151, 157, 191, 192, 213, 218, 219, 230, 256-273, 275-293, 309-315) confirmed.
- `src/features/agentSessionsArchiving/index.ts` read in full; lines 100-111, 104, 113-121 confirmed.
- `test/unit/core/git.test.ts` line 355 confirmed as EOF.
- `test/unit/features/agentSessionsArchiving/archiveService.test.ts` line 448 (describe 'reconfigure'), lines 457, 473, 491, 513, 530 (reconfigure invocations) confirmed.
- `test/unit/features/agentSessionsArchiving/archiveService.dedup.test.ts` 10 tests confirmed (lines 52, 76, 103, 118, 130, 142, 157, 175, 216, 241).
- `test/unit/mocks/vscode.ts` `Uri.joinPath` lines 84-86 confirmed.
- `docs/technical-context.md` section 8.6 line 415, section 4.3 line 228, "Force re-archive" line 512, "Archive file naming" line 504, "One-shot re-archive" line 491, `lastArchivedMap` diagram line 429 confirmed.
- `src/core/extensionStateManager.ts` `updateConfigSection` lines 109-117 confirmed as `set` semantics with listener notification.
- `src/core/configMigration/migrationService.ts` `findMissingSections` lines 13-18 confirmed as section-key granularity.
