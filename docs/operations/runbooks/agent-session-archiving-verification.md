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
