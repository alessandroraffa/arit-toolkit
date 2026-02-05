# ARIT Toolkit

[![CI](https://github.com/alessandroraffa/arit-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/alessandroraffa/arit-toolkit/actions/workflows/ci.yml)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/alessandroraffa.arit-toolkit)](https://marketplace.visualstudio.com/items?itemName=alessandroraffa.arit-toolkit)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/alessandroraffa.arit-toolkit)](https://marketplace.visualstudio.com/items?itemName=alessandroraffa.arit-toolkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A collection of productivity utilities for Visual Studio Code.

**ARIT** stands for **A**lessandro **R**affa **I**nformation **T**echnologies.

## Features

### Timestamped File Creator

Create new files with automatic timestamp prefixes. Perfect for:

- Daily notes and journals
- Meeting notes
- Log files
- Version-tracked documents

**Usage:**

- Right-click on a folder in Explorer → "ARIT: New File with Timestamp"
- Or use keyboard shortcut: `Ctrl+Alt+N` (Windows/Linux) / `Cmd+Alt+N` (macOS)

**Example output:** `202602051430-meeting-notes.md`

### Prefix Creation Timestamp

Add the file's creation timestamp as a prefix to existing files. Useful for organizing files by when they were created.

**Usage:**

- Right-click on a file in Explorer → "ARIT: Prefix Creation Timestamp"

**Example:** `report.pdf` → `202602051430-report.pdf` (using the file's actual creation date)

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

| Setting | Default | Description |
|---------|---------|-------------|
| `arit.timestampFormat` | `YYYYMMDDHHmm` | Format for the timestamp prefix |
| `arit.timestampSeparator` | `-` | Separator between timestamp and filename |
| `arit.logLevel` | `info` | Logging level for debug output |

### Timestamp Formats

| Format | Example Output |
|--------|----------------|
| `YYYYMMDDHHmm` | `202602051430` |
| `YYYYMMDD` | `20260205` |
| `YYYYMMDDHHmmss` | `20260205143022` |
| `ISO` | `2026-02-05T14-30-22-000Z` |

## Keyboard Shortcuts

| Command | Windows/Linux | macOS |
|---------|---------------|-------|
| New File with Timestamp | `Ctrl+Alt+N` | `Cmd+Alt+N` |

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
