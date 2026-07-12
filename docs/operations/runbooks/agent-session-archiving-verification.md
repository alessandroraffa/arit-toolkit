# Agent Session Archiving Verification

Use this runbook to rerun the WS-0011 proof against a real workspace
without relying on `.tmp` files or manual Extension Development Host
inspection. The launcher seeds an isolated VS Code profile with a copy of
the target workspace's `workspaceStorage`, starts the development
extension, waits for the startup re-archive cycle, checks the expected
Codex and Copilot outputs, and then waits for the next automatic cycle to
confirm that unchanged sessions are not rewritten.

## Prerequisites

- Install dependencies with `pnpm install`.
- Build the extension bundle with `pnpm run build`.
- Know the workspace root that owns the archive to validate.
- Know either the full `workspaceStorage` directory path for that
  workspace or the storage ID that lives under
  `$HOME/Library/Application Support/Code/User/workspaceStorage`.
- Keep the source workspace closed in other Extension Development Host
  instances while the verification is running.

## Command

```bash
cd /Users/alessandroraffa/dev/oceanus/projects/tangyr/tangyr-vscode
pnpm run build

export TANGYR_ARCHIVE_WORKSPACE="/Users/alessandroraffa/dev/oceanus"
export TANGYR_ARCHIVE_REAL_WORKSPACE_STORAGE="$HOME/Library/Application Support/Code/User/workspaceStorage/6cabd8a896839c5d7a516c90465f1d6a"
export TANGYR_ARCHIVE_INTERVAL_MINUTES=5

node scripts/agent-session-archiving/run-one-shot-rearchive-verification.cjs
```

You can provide `TANGYR_ARCHIVE_WORKSPACE_STORAGE_ID` instead of
`TANGYR_ARCHIVE_REAL_WORKSPACE_STORAGE`. The launcher also accepts
`TANGYR_ARCHIVE_KEEP_TEMP=1` when you need to inspect the temporary profile
after a failure.

## What The Runner Verifies

- The startup cycle rewrites the target archive after activation.
- Codex archive files for `019cd433`, `019d1600`, `019d06f2`, `019c9048`,
  and `019cf41f` have exactly the same number of `**User:**` sections as
  the source JSONL `user_message` events.
- Copilot session `7a54e9a3` is archived as markdown with at least seven
  user turns.
- Source-backed empty Copilot envelope sessions do not remain as raw
  `.jsonl` outputs after the re-archive.
- Source-backed Copilot stub sessions are either absent or contain at
  least one `**User:**` or `**Agent:**` section.
- A second automatic cycle leaves the verified archive files untouched
  when the corresponding source files remain unchanged.

## Expected Output

A successful run exits with code `0` and logs these milestones:

- `Archive activity detected.`
- `Archive directory is stable.`
- `Turn-count verification passed.`
- `Empty-session verification passed.`
- `No-loop verification passed.`
- `One-shot re-archive verification completed successfully.`

The current `oceanus` snapshot retains four orphan archive files because
their Copilot source sessions are no longer present in current
`workspaceStorage`: raw `.jsonl` archives `4ebac531`, `418b3bfd`,
`b5b93bb0`, and header-only stub `bae38255`. The runner reports these as
retained orphans and does not treat them as a failure.

## Manual Reconciliation Checklist (Archive Path Migration)

Use this checklist when `reconcileArchiveLocation()` reports a partial
failure (`Tangyr: some archives remain at docs/archive/agent-sessions —
see docs/operations/runbooks/agent-session-archiving-verification.md for
reconciliation steps.`), or whenever you need to manually verify a
migration from the historical `docs/archive/agent-sessions` default to
the current `.tangyr/agent-sessions` default:

1. Click **View Log** on the partial-failure notification (or open the
   **Tangyr Workbench** output channel manually) to see which entries
   diverged. Every skipped or divergent entry is logged at `warn` with
   the relative path or entry name.
2. Compare the old tree (`docs/archive/agent-sessions`) and the new tree
   (`.tangyr/agent-sessions`) file by file for every entry named in the
   log.
3. For a file reported as "destination differs", inspect both copies and
   decide, per file, whether to keep the new-tree copy, the old-tree
   copy, or merge them by hand. `relocateFile()` never overwrites an
   existing destination automatically — this decision is always a Human
   one.
4. For a file reported as "failed to compare" (a read or stat error
   during byte comparison), treat it the same as a divergent file: the
   source was preserved specifically because its true relationship to
   the destination could not be confirmed.
5. Leave any non-year top-level directory or unrecognized entry (a
   symlink, for example) in place under the old tree until you have
   reviewed it — the migration intentionally never touches these.
6. Delete the old tree (`docs/archive/agent-sessions`) only after every
   divergent or comparison-failed file named in the log has a Human
   disposition. Do not delete it based on the presence of the new tree
   alone.

**Cross-directory same-session-ID re-churn:** if two global Claude Code
config directories (for example `~/.claude` and `~/.claude-work`) hold
sessions with the same session UUID — realistic only when one profile
directory was bootstrapped from another before the copies diverged —
both sessions map to the same `claude-code-<uuid>` archive name. Because
archiving keys on the archive
name and does not deduplicate across config directories, the archived
copy of such a colliding session may be re-churned (rewritten) across
archive cycles. This is expected and benign: source session files under
either config directory are never touched, and no data is lost — only
the single shared archive entry is rewritten repeatedly.

## Troubleshooting

- If the launcher reports a missing environment variable, export the
  required path or storage ID before rerunning.
- If the runner times out waiting for archive activity, verify that
  `agentSessionsArchiving.enabled` is `true` in the target workspace's
  `.tangyr.jsonc` and that the copied `workspaceStorage` snapshot
  contains the expected Copilot `chatSessions` files.
- If the second-cycle assertion fails, check for duplicate Copilot source
  files with the same session ID. Tangyr Workbench expects the provider to keep only
  the newest source representation per `archiveName`.
- The `CrossAppIPC` warning printed by VS Code on macOS is benign for
  this runbook as long as the test host continues to launch and the
  runner reaches `Extension activated.`.
