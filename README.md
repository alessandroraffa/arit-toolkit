# ARIT Toolkit

[![CI](https://github.com/alessandroraffa/arit-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/alessandroraffa/arit-toolkit/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/alessandroraffa/arit-toolkit/graph/badge.svg)](https://codecov.io/gh/alessandroraffa/arit-toolkit)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/alessandroraffa.arit-toolkit)](https://marketplace.visualstudio.com/items?itemName=alessandroraffa.arit-toolkit)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/alessandroraffa.arit-toolkit)](https://marketplace.visualstudio.com/items?itemName=alessandroraffa.arit-toolkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Chat sessions with Claude Code, Cline, Aider, Roo Code, GitHub Copilot Chat, and Continue are scattered across your filesystem — global storage, hidden directories, workspace storage. They don't survive a machine change, they aren't versioned with your code, and they're invisible to your team. ARIT Toolkit collects them automatically into your workspace, organized by date, as project artifacts.

In the context of agentic coding, documentation is not an afterthought — it is a project artifact. Decision logs, meeting notes, AI session transcripts: they all belong in the repository alongside the code they shaped. ARIT Toolkit automates the production and organization of these artifacts, whether you are archiving a Claude Code session or creating a timestamped notes file.

## Agent Sessions Archiving

AI coding assistants store their session files in different locations and formats. Agent Sessions Archiving scans these sources periodically and copies the sessions that belong to the current workspace into a single archive directory, turning them into versionable project artifacts.

**Supported assistants:**

| Assistant           | Session location                                                      | Workspace matching                           |
| ------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| Aider               | `.aider.chat.history.md` and `.aider.input.history` in workspace root | Files in workspace root                      |
| Claude Code         | `~/.claude/projects/<workspace-path>/`                                | Project path derived from workspace          |
| Cline               | VS Code global storage                                                | Session content references workspace path    |
| Roo Code            | VS Code global storage                                                | Session content references workspace path    |
| GitHub Copilot Chat | VS Code workspace storage (`chatSessions/`)                           | Per-workspace storage (`.json` and `.jsonl`) |
| Continue            | `~/.continue/sessions/`                                               | Session content references workspace path    |

Missing your assistant? [Open an issue](https://github.com/alessandroraffa/arit-toolkit/issues) to request support.

**How it works:**

- Sessions are copied (not moved) to the archive directory
- Sessions from Claude Code, Cline, Roo Code, GitHub Copilot Chat, and Continue are automatically converted to structured markdown during archiving; Aider sessions are archived as-is
- Each session maps to exactly one archived file — when the source changes, the old archive is replaced
- Archive filenames use the session's creation timestamp: `{YYYYMMDDHHmm}-{name}.md`
- Only sessions belonging to the current workspace are archived

**Configuration** (in `.arit-toolkit.jsonc`):

```jsonc
{
  "agentSessionsArchiving": {
    "enabled": true,
    "archivePath": "docs/archive/agent-sessions",
    "intervalMinutes": 5,
    "ignoreSessionsBefore": "20250101",
  },
}
```

Set `ignoreSessionsBefore` to a `YYYYMMDD` date to skip sessions created before that date. Omit the field to archive everything.

**Toggle:** Command Palette → "ARIT: Toggle Agent Sessions Archiving"

## Timestamped Files and Folders

Create new files or directories with an automatic UTC timestamp prefix. Useful for meeting notes, decision logs, daily journals, or any artifact that benefits from chronological ordering.

**New file:** Right-click a folder → "ARIT: New File with Timestamp" or `Ctrl+Alt+N` / `Cmd+Alt+N`
Creates `202602051430-meeting-notes.md`

**New folder:** Right-click a folder → "ARIT: New Folder with Timestamp" or `Ctrl+Alt+Shift+N` / `Cmd+Alt+Shift+N`
Creates `202602051430-project-assets/`

## Prefix Creation Timestamp

Add the creation timestamp to existing files or directories. The timestamp is derived from the item's actual creation date. These commands are available only via the Explorer context menu (right-click), not from the Command Palette.

Right-click a file → "ARIT: Prefix Creation Timestamp"
`report.pdf` → `202602051430-report.pdf`

Right-click a folder → "ARIT: Prefix Creation Timestamp to Folder"
`assets/` → `202602051430-assets/`

## Extension Toggle

An **ARIT** status bar item (bottom-right) shows the current state and lets you enable or disable advanced features with a click. Hover for a tooltip with active services and their status, with quick toggle buttons. A **Run Setup** button in the tooltip re-triggers initialization checks (version, config migration, section prompts) without reloading VS Code.

Command Palette → "ARIT: Toggle Extension (Enable/Disable)" or "ARIT: Run Setup"

**Workspace initialization:** When you open a single-root workspace for the first time, ARIT Toolkit offers to create a `.arit-toolkit.jsonc` configuration file at the workspace root. When the extension updates and introduces new configuration sections, you will be prompted to add them.

**Config auto-commit:** In a Git repository, when the extension writes changes to `.arit-toolkit.jsonc` and the file is not gitignored, you are prompted to commit the change automatically. If the file has no actual Git changes, the prompt is skipped.

**Workspace modes:**

- **Single-root workspace:** Full functionality. State persisted in `.arit-toolkit.jsonc`.
- **Multi-root workspace:** Timestamp commands available. Toggle and archiving disabled; status bar shows limited mode.

## Why ARIT Toolkit

- Archives sessions from 6 AI coding assistants into one place — no other extension does this
- Archived files live in your workspace: version them with Git, share them with your team
- Timestamps give you a consultable timeline of the work done on a project
- Minimal configuration: one `.arit-toolkit.jsonc` file, sensible defaults
- Zero runtime dependencies — VS Code API only

## What's Next

- Support for additional assistants (Cursor, Windsurf)
- Full-text search across archived sessions
- Dashboard summarizing session activity per project

## Configuration

| Setting                   | Default        | Description                              |
| ------------------------- | -------------- | ---------------------------------------- |
| `arit.timestampFormat`    | `YYYYMMDDHHmm` | Format for the timestamp prefix          |
| `arit.timestampSeparator` | `-`            | Separator between timestamp and filename |
| `arit.logLevel`           | `info`         | Logging level for debug output           |

**Timestamp formats:**

| Format           | Example                    | Description                    |
| ---------------- | -------------------------- | ------------------------------ |
| `YYYYMMDDHHmm`   | `202602051430`             | Year, month, day, hour, minute |
| `YYYYMMDD`       | `20260205`                 | Year, month, day only          |
| `YYYYMMDDHHmmss` | `20260205143022`           | Full timestamp with seconds    |
| `ISO`            | `2026-02-05T14-30-22-123Z` | ISO 8601 (with milliseconds)   |

## Keyboard Shortcuts

| Command                   | Windows/Linux      | macOS             | Context          |
| ------------------------- | ------------------ | ----------------- | ---------------- |
| New File with Timestamp   | `Ctrl+Alt+N`       | `Cmd+Alt+N`       | Explorer focused |
| New Folder with Timestamp | `Ctrl+Alt+Shift+N` | `Cmd+Alt+Shift+N` | Explorer focused |

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Press `Ctrl+P` / `Cmd+P`
3. Type `ext install alessandroraffa.arit-toolkit`

### From VSIX File

1. Download the `.vsix` file from [Releases](https://github.com/alessandroraffa/arit-toolkit/releases)
2. In VS Code, press `Ctrl+Shift+P` / `Cmd+Shift+P`
3. Type "Install from VSIX" and select the downloaded file

## Requirements

- VS Code 1.109.0 or higher

## Security

To report a security vulnerability, please see [SECURITY.md](SECURITY.md) for responsible disclosure guidelines.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## About ARIT

**ARIT** stands for **A**lessandro **R**affa **I**nformation **T**echnologies.

**Alessandro Raffa** — [@alessandroraffa](https://github.com/alessandroraffa)
