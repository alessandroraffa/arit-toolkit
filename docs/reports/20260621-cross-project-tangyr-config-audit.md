---
title: 'Cross-project Tangyr configuration audit'
report: 20260621-cross-project-tangyr-config-audit
created: 2026-06-21
status: 'final'
scope: 'Read-only filesystem audit of every workspace under ~/dev carrying a Tangyr configuration'
references:
  - src/core/extensionStateManager.ts
  - src/features/agentSessionsArchiving/archiveService.ts
---

## Purpose

Read-only audit of all `~/dev` workspaces carrying `.tangyr.jsonc` or the legacy `.arit-toolkit.jsonc`, to establish migration state, conformance, and defects. This report is the motivation source for [SPEC-002](../specifications/SPEC-002-legacy-config-and-default-archive-path-migration.md).

## Population

- 25 distinct workspaces carry a Tangyr configuration.
- 17 carry `.tangyr.jsonc` (migrated); 8 carry only `.arit-toolkit.jsonc` (legacy); 3 carry **both**.
- No `.bak` file was found in any workspace — the legacy-cleanup step has never executed in the field.

## Migration-state categories

- **Both files present (incomplete cleanup), 3:** `dgbiotech/nexpense`, `microelettrica`, `oceanus`. The `oceanus` legacy file carries an `archivePath` differing from its active `.tangyr.jsonc` (a stale, conflicting config).
- **Migrated, single file, 14:** version stamps span 1.18.0 → 2.5.1. The extension's own repo (`oceanus/projects/tangyr/tangyr-vscode`) carries the oldest stamp (1.18.0).
- **Legacy only, 8:** `agent-coding`, `books`, `dgbiotech/ISO-2601`, `dgbiotech/filler2`, `dgbiotech/filler2/raccolta-dati`, `dgbiotech/ministero`, `lalomiagroup.it`, `oceanus-archive`. Several are multi-root / nested workspaces, which the single-root activation path never migrates.

## Findings

1. **Legacy cleanup is unreachable in the common case (root cause).** `verifyLegacyConfigMigration()` is the only code that removes `.arit-toolkit.jsonc`, and it returns early when `.tangyr.jsonc` is present. `initialize()` writes `.tangyr.jsonc` before that backstop runs, so the rename-to-`.bak` is dead code for any workspace that had a legacy file. Result: both-files state with no `.bak`, indefinitely.
2. **Multi-root / no-workspace never migrate.** `initialize()` returns early for these modes; the nested/multi-root legacy workspaces are never touched.
3. **Stale conflicting legacy config (`oceanus`).** The lingering legacy file specifies a different `archivePath` than the active config — a latent source of confusion.
4. **Non-standard archive path (`chiarivo`).** Uses `.tangyr/agent-sessions` while every other migrated install uses `docs/archive/agent-sessions`. (SPEC-002 makes `.tangyr/agent-sessions` the default for all.)
5. **Hand-edited JSONC (trailing commas).** `infobiotech/resilio-datahub` and the `oceanus` legacy file — parseable, but not extension-written.
6. **Missing archive directory (`frutteo`).** Archiving enabled, but the archive directory was never created (no sessions produced there).
7. **Non-bug confirmations.** `tokenizer: "claude"` (oceanus) is a valid `TokenizerModel`. Nested `filler2` / `raccolta-dati` configs are legitimate multi-root usage.

## Disposition

Findings 1–3 are resolved by SPEC-002 (definitive git-aware legacy consolidation). Finding 4 is resolved by SPEC-002's default-path migration. Findings 5–7 are observational; no code change is required for them beyond what SPEC-002 already entails. Multi-root migration (finding 2) remains an accepted architectural limitation, documented in SPEC-002 constraints.
