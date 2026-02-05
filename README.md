# ARIT Toolkit

[![CI](https://github.com/alessandroraffa/arit-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/alessandroraffa/arit-toolkit/actions/workflows/ci.yml)
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

### Prefix Creation Timestamp

Add the file's creation timestamp as a prefix to existing files. Useful for organizing files by when they were created.

**Usage:**

- Right-click on a file in Explorer → "ARIT: Prefix Creation Timestamp"

**Example:** `report.pdf` → `202602051430-report.pdf` (uses the file's actual creation date)

> **Note:** This feature is only available via the Explorer context menu.

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

Both features share the same timestamp configuration:

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

| Command | Windows/Linux | macOS | Context |
|---------|---------------|-------|---------|
| New File with Timestamp | `Ctrl+Alt+N` | `Cmd+Alt+N` | Explorer focused |

> **Note:** The "Prefix Creation Timestamp" command is only available via the Explorer context menu (right-click on a file).

## Requirements

- VS Code 1.85.0 or higher

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

**Alessandro Raffa**

- GitHub: [@alessandroraffa](https://github.com/alessandroraffa)
