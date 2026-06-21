---
title: 'Definitive config migration and archive path consolidation'
initiative: INIT-004-config-and-archive-path-consolidation
status: 'in-progress'
created: 2026-06-21
references:
  - docs/specifications/SPEC-002-legacy-config-and-default-archive-path-migration.md
  - docs/reports/20260621-cross-project-tangyr-config-audit.md
---

## Objectives

1. Make legacy `.arit-toolkit.jsonc` → `.tangyr.jsonc` migration definitive: every single-root workspace converges on a single authoritative `.tangyr.jsonc`, with the legacy file safely removed.
2. Establish `.tangyr/agent-sessions` as the archive path for every install, migrating existing archives off the historical `docs/archive/agent-sessions` location without loss.
3. Eliminate the class of field defects where the legacy file lingers indefinitely or carries a stale, conflicting configuration.

## Motivation

The cross-project audit ([report](docs/reports/20260621-cross-project-tangyr-config-audit.md)) found that the legacy-config cleanup step never executes in the common case — its only implementation is gated behind a condition (`.tangyr.jsonc` absent) that the normal activation flow has already invalidated by writing `.tangyr.jsonc` first. The visible consequence is a population of workspaces holding both config files indefinitely, with no backup ever produced, and at least one workspace whose lingering legacy file disagrees with its active configuration.

Separately, session archives default to the versioned documentation tree (`docs/archive/agent-sessions`), whereas the intended home for runtime, machine-managed archives is the `.tangyr/` runtime directory. Convergence on `.tangyr/agent-sessions` — already adopted by one install — must become the default for all, with existing archives relocated automatically.

These are not cosmetic. A stale config file can silently diverge from the active one; archives in the wrong tree pollute version control. Resolving both in one consolidated migration pass closes the transition that the earlier backstop ([WS-0015](docs/workstreams/WS-0015-legacy-config-verify-startup.md)) only partially addressed.

## Scope

Included:

- Restructuring legacy consolidation so removal of `.arit-toolkit.jsonc` runs reliably, including the both-files state, after `.tangyr.jsonc` is confirmed present
- Git-aware legacy removal: delete when tracked, rename to timestamped `.bak` otherwise
- Changing the default archive path to `.tangyr/agent-sessions`
- A configuration value-migration that rewrites the historical-default `archivePath` (and unset/empty) to the new default, preserving deliberately customized paths
- Silent relocation of existing session archives via the existing loss-safe move mechanism
- Test coverage for every consolidation and path-migration branch, including git-tracked/untracked, malformed legacy, custom-path preservation, and idempotency

Excluded:

- Multi-root and no-workspace migration (out of architectural scope; documented limitation)
- Merging legacy values into an existing `.tangyr.jsonc` (the current file is authoritative)
- Retroactive normalization of hand-edited JSONC or reconstruction of missing archive directories
- Changes to the archive markdown format, providers, parsers, or session discovery

## Success criteria

- [ ] Both-files workspaces converge to a single authoritative `.tangyr.jsonc` with the legacy file removed by the git-aware rule
- [ ] Legacy-only workspaces migrate and remove the legacy file in one activation
- [ ] New installs and historical-default installs use `.tangyr/agent-sessions`; customized paths are preserved
- [ ] Existing archives relocate to `.tangyr/agent-sessions` without loss and without a dedicated prompt
- [ ] Malformed legacy handling is preserved (`.malformed.bak`, no fabricated `.tangyr.jsonc`)
- [ ] All consolidation and migration operations are idempotent across repeated activations
