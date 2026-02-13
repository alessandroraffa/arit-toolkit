# ARIT Toolkit

[![CI](https://github.com/alessandroraffa/arit-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/alessandroraffa/arit-toolkit/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/alessandroraffa/arit-toolkit/graph/badge.svg)](https://codecov.io/gh/alessandroraffa/arit-toolkit)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/alessandroraffa.arit-toolkit)](https://marketplace.visualstudio.com/items?itemName=alessandroraffa.arit-toolkit)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/alessandroraffa.arit-toolkit)](https://marketplace.visualstudio.com/items?itemName=alessandroraffa.arit-toolkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A collection of productivity utilities for Visual Studio Code.

**ARIT** stands for **A**lessandro **R**affa **I**nformation **T**echnologies.

## Features

All timestamps are generated in **UTC timezone**.

### Timestamped File Creator

Create new files with automatic timestamp prefixes. Perfect for:

- Daily notes and journals
- Meeting notes
- Log files
- Version-tracked documents

**Usage:**

- Right-click on a folder in Explorer → "ARIT: New File with Timestamp"
- Keyboard shortcut: `Ctrl+Alt+N` / `Cmd+Alt+N` (when Explorer is focused)
- Command Palette: "ARIT: New File with Timestamp"

**Example:** Creates `202602051430-meeting-notes.md`

### Timestamped Directory Creator

Create new directories with automatic timestamp prefixes. Same logic as the file creator, but for folders.

**Usage:**

- Right-click on a folder in Explorer → "ARIT: New Folder with Timestamp"
- Keyboard shortcut: `Ctrl+Alt+Shift+N` / `Cmd+Alt+Shift+N` (when Explorer is focused)
- Command Palette: "ARIT: New Folder with Timestamp"

**Example:** Creates `202602051430-project-assets/`

### Prefix Creation Timestamp

Add the creation timestamp as a prefix to existing files or directories. Useful for organizing by when they were created.

**Usage:**

- Right-click on a file in Explorer → "ARIT: Prefix Creation Timestamp"
- Right-click on a folder in Explorer → "ARIT: Prefix Creation Timestamp to Folder"

**Example (file):** `report.pdf` → `202602051430-report.pdf` (uses the file's actual creation date)

**Example (folder):** `assets/` → `202602051430-assets/` (uses the folder's actual creation date)

> **Note:** These features are only available via the Explorer context menu.

### Extension Toggle (Status Bar)

Quickly enable or disable advanced ARIT Toolkit features for the current workspace via a status bar icon.

**Status Bar:**

An "ARIT" item appears in the bottom-right status bar. It shows:

- The current enabled/disabled state
- A tooltip with feature list and active configuration on hover
- Click to toggle the extension on/off

**Usage:**

- Click the "ARIT" icon in the status bar
- Command Palette: "ARIT: Toggle Extension (Enable/Disable)"

**Workspace initialization:**

When you open a single-root workspace for the first time, ARIT Toolkit will ask if you want to initialize it for advanced features. Accepting creates a `.arit-toolkit.jsonc` configuration file at the workspace root.

### Agent Sessions Archiving

Automatically archive chat session files from AI coding assistants into your workspace. The extension periodically scans for sessions that belong to the current workspace and copies them to a configurable archive directory.

**Supported AI assistants:**

| Assistant | Session location | Workspace matching |
|-----------|------------------|-------------------|
| Aider | `.aider.chat.history.md` in workspace root | File in workspace root |
| Claude Code | `~/.claude/projects/<workspace-path>/` | Project path derived from workspace |
| Cline | VS Code global storage | Session content references workspace path |
| Roo Code | VS Code global storage | Session content references workspace path |
| GitHub Copilot Chat | VS Code workspace storage (`chatSessions/`) | Per-workspace storage (`.json` and `.jsonl`) |
| Continue | `~/.continue/sessions/` | Session content references workspace path |

**Archive behavior:**

- Sessions are copied (not moved) to the archive directory
- Each session has exactly one archived file — when the source is modified, the old archive is replaced
- Archive filenames use the session's last modification timestamp: `{YYYYMMDDHHmm}-{sessionName}{extension}`
- Only sessions belonging to the current workspace are archived

**Configuration** (in `.arit-toolkit.jsonc`):

```jsonc
{
  "agentSessionsArchiving": {
    "enabled": true,
    "archivePath": "docs/archive/agent-sessions",
    "intervalMinutes": 5
  }
}
```

**Usage:**

- Command Palette: "ARIT: Toggle Agent Sessions Archiving"

**Workspace modes:**

- **Single-root workspace:** Full functionality with toggle support. State is persisted in `.arit-toolkit.jsonc`.
- **Multi-root workspace:** Basic timestamp commands remain available. The toggle is not available and the status bar indicates limited mode.

When disabled, advanced features show a warning message. Basic timestamp commands always work regardless of the toggle state.

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Press `Ctrl+P` / `Cmd+P`
3. Type `ext install alessandroraffa.arit-toolkit`

### From VSIX File

1. Download the `.vsix` file from [Releases](https://github.com/alessandroraffa/arit-toolkit/releases)
2. In VS Code, press `Ctrl+Shift+P` / `Cmd+Shift+P`
3. Type "Install from VSIX" and select the downloaded file

## Configuration

All timestamp features share the same configuration:

| Setting | Default | Description |
|---------|---------|-------------|
| `arit.timestampFormat` | `YYYYMMDDHHmm` | Format for the timestamp prefix |
| `arit.timestampSeparator` | `-` | Separator between timestamp and filename |
| `arit.logLevel` | `info` | Logging level for debug output |

### Timestamp Formats

| Format | Example Output | Description |
|--------|----------------|-------------|
| `YYYYMMDDHHmm` | `202602051430` | Year, month, day, hour, minute |
| `YYYYMMDD` | `20260205` | Year, month, day only |
| `YYYYMMDDHHmmss` | `20260205143022` | Full timestamp with seconds |
| `ISO` | `2026-02-05T14-30-22-123Z` | ISO 8601 format (with milliseconds) |

## Keyboard Shortcuts

| Command                   | Windows/Linux       | macOS              | Context          |
|---------------------------|---------------------|--------------------|------------------|
| New File with Timestamp   | `Ctrl+Alt+N`        | `Cmd+Alt+N`        | Explorer focused |
| New Folder with Timestamp | `Ctrl+Alt+Shift+N`  | `Cmd+Alt+Shift+N`  | Explorer focused |

> **Note:** The "Prefix Creation Timestamp" commands are only available via the Explorer context menu.

## Requirements

- VS Code 1.85.0 or higher

## Security

To report a security vulnerability, please see [SECURITY.md](SECURITY.md) for responsible disclosure guidelines.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

**Alessandro Raffa**

- GitHub: [@alessandroraffa](https://github.com/alessandroraffa)
