---
title: 'Definitive legacy config consolidation and default archive path migration'
spec: SPEC-002
status: 'approved'
workspaces: []
created: 2026-06-21
references:
  - docs/workstreams/WS-0015-legacy-config-verify-startup.md
  - src/core/extensionStateManager.ts
  - src/features/agentSessionsArchiving/archiveService.ts
  - docs/reports/20260621-cross-project-tangyr-config-audit.md
---

## Introduction

A field audit of every workspace under `~/dev` carrying a Tangyr configuration surfaced two systemic defects in how the extension handles the transition from the pre-v1.19 identifier (`alessandroraffa.arit-toolkit`, config `.arit-toolkit.jsonc`) to the current identifier (`alessandroraffa.tangyr`, config `.tangyr.jsonc`), and in how it locates the session archive.

First, the legacy-config migration never reaches its cleanup step in the common case. The only code that removes `.arit-toolkit.jsonc` lives in `verifyLegacyConfigMigration()`, which returns early whenever `.tangyr.jsonc` is already present. But `initialize()` writes `.tangyr.jsonc` (via `runMigration()` / `ensureCurrentConfigFile()`) before that backstop runs, so for any single-root workspace that had a legacy file, the cleanup is unreachable. The observable result across the audited installs is a population of workspaces holding _both_ files indefinitely, with no `.bak` ever produced; multi-root and no-workspace activations skip migration entirely. The legacy file lingers as a stale, potentially conflicting configuration (one audited workspace carried a legacy `archivePath` differing from its current one).

Second, the historical default archive path `docs/archive/agent-sessions` places session archives inside the versioned documentation tree. The intended home for runtime, machine-managed session archives is the runtime directory `.tangyr/`. New installs and existing installs must converge on `.tangyr/agent-sessions` as the default, and existing archives must be relocated without loss.

This specification defines the behavior of a single consolidated migration pass that resolves both defects: it makes legacy-config removal reliable and definitive, and it migrates the default archive path for every install still on the historical default, relocating existing session files to the new location.

## Functional requirements

### Legacy configuration consolidation

1. On activation of a single-root workspace, after the normal configuration-read and migration flow has produced or confirmed `.tangyr.jsonc`, the extension must consolidate any coexisting legacy `.arit-toolkit.jsonc` file. Consolidation must run reliably regardless of whether `.tangyr.jsonc` was written during this activation or already existed, and regardless of whether the feature is enabled or disabled.

2. When both `.tangyr.jsonc` and `.arit-toolkit.jsonc` exist, `.tangyr.jsonc` is authoritative. The extension must not overwrite any value in `.tangyr.jsonc` with a value from the legacy file. The legacy file must be removed (see requirement 4).

3. When only `.arit-toolkit.jsonc` exists, the extension must migrate it to `.tangyr.jsonc` (bringing the configuration to the current extension version), then remove the legacy file (see requirement 4).

4. Legacy-file removal must be safe and git-aware:
   - When the legacy file is tracked by git, it must be deleted from the working tree (git history is the recovery path).
   - When the legacy file is not tracked by git — including when the workspace is not a git repository, when git is unavailable, or when tracking status cannot be determined — it must instead be renamed to `.arit-toolkit.jsonc.bak`. A timestamped suffix (`YYYYMMDDHHmm`, UTC) must be appended when the `.bak` target already exists.

5. After successful consolidation the workspace must contain `.tangyr.jsonc` and must not contain an active `.arit-toolkit.jsonc`. The operation must be idempotent: a second activation with no legacy file present must be a no-op.

### Default archive path

1. The default archive path for newly created configurations (and for the archiving config section when it is added to a configuration that lacks it) must be `.tangyr/agent-sessions`.

2. During configuration migration, the extension must rewrite the `archivePath` of an existing configuration to `.tangyr/agent-sessions` when the existing value is the historical default `docs/archive/agent-sessions`, or is absent or empty. A configuration whose `archivePath` is any other value (a deliberately customized path) must be left unchanged.

3. When the `archivePath` is rewritten, all existing session archives under the previous path must be relocated to the new path without loss, preserving the year/month directory layout and all archived files. The relocation must remove the previous archive directory only after every file has been copied successfully; on any copy failure the previous directory must be left intact for manual reconciliation.

4. The relocation of existing session files must execute silently — without a dedicated confirmation prompt for the move itself.

## Constraints

1. The scope is single-root workspaces, matching the existing activation and archiving architecture. Multi-root and no-workspace activations are out of scope for automatic consolidation and path migration; this limitation must be documented, not silently ignored.

2. `.tangyr.jsonc` is the single source of truth whenever it exists. Consolidation reads the legacy file only to migrate it when `.tangyr.jsonc` is absent; it never merges legacy values into an existing `.tangyr.jsonc`.

3. Git-tracking status must be determined by an explicit check. When the result is anything other than a definite "tracked", removal must degrade to the `.bak` rename — the extension must never hard-delete a file whose git-tracking status is unknown.

4. The archive relocation must reuse the existing loss-safe move mechanism (copy-all-then-delete-source-only-on-full-success). No new deletion path that removes archives before confirming the copy is permitted.

5. The path-migration rewrite must not disturb configurations on a customized `archivePath`, and must be a no-op for configurations already on `.tangyr/agent-sessions`.

## Error handling

1. When the legacy file cannot be parsed during the legacy-only migration case, the extension must preserve the existing malformed-file behavior: rename it to `.arit-toolkit.jsonc.malformed.bak`, surface a warning, and not fabricate a `.tangyr.jsonc` from unparseable content.

2. When legacy-file removal (delete or rename) fails, the failure must be logged and must not abort activation or the rest of the migration. The next activation re-attempts consolidation.

3. When the archive relocation encounters a copy failure for one or more files, the previous archive directory must be left in place and the condition logged; the new location holds the successfully copied subset and the next cycle reconciles.

4. A failure to determine git-tracking status must resolve to the non-tracked branch (rename to `.bak`), never to deletion.

## Acceptance criteria

1. A workspace that begins with both `.tangyr.jsonc` and a git-tracked `.arit-toolkit.jsonc` ends, after one activation, with `.tangyr.jsonc` unchanged in its values and `.arit-toolkit.jsonc` deleted from the working tree.

2. A workspace that begins with both `.tangyr.jsonc` and a non-git-tracked `.arit-toolkit.jsonc` ends, after one activation, with `.tangyr.jsonc` unchanged and the legacy file renamed to `.arit-toolkit.jsonc.bak` (timestamp-suffixed on collision).

3. A workspace that begins with only `.arit-toolkit.jsonc` (parseable) ends with a `.tangyr.jsonc` at the current version and the legacy file removed by the git-aware rule.

4. A workspace that begins with only a malformed `.arit-toolkit.jsonc` ends with `.arit-toolkit.jsonc.malformed.bak`, a warning shown, and no `.tangyr.jsonc` fabricated.

5. A newly initialized workspace receives `archivePath: ".tangyr/agent-sessions"`.

6. A configuration on the historical default `docs/archive/agent-sessions` is rewritten to `.tangyr/agent-sessions` during migration, and its existing archives are present under `.tangyr/agent-sessions` with the previous directory removed.

7. A configuration on a customized `archivePath` (any value other than the historical default) retains that value through migration; no archives are moved.

8. A configuration already on `.tangyr/agent-sessions` is unchanged and triggers no move.

9. Running activation twice on any of the above end states produces no further changes (idempotency).

10. The archive relocation produces no confirmation prompt dedicated to the move.

## Open questions

None at this time.

## Revision history

2026-06-21 — Initial specification. Captures the cross-project audit findings and the three resolved design decisions: git-aware legacy removal (delete when tracked, `.bak` otherwise); path migration scoped to the historical default only (custom paths preserved); silent archive relocation.
