# Changelog

All notable changes to "ARIT Toolkit" will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Prefix Creation Timestamp** feature
  - Add file's creation timestamp as prefix to existing files
  - Uses the same configurable timestamp format and separator
  - Explorer context menu integration (right-click on files)

## [1.0.0] - 2026-02-05

### Added

- Initial release of ARIT Toolkit
- **Timestamped File Creator** feature
  - Create files with automatic UTC timestamp prefix
  - Multiple timestamp format options (YYYYMMDDHHmm, YYYYMMDD, YYYYMMDDHHmmss, ISO)
  - Configurable separator between timestamp and filename
  - Explorer context menu integration
  - Command palette support
  - Keyboard shortcut (`Ctrl+Alt+N` / `Cmd+Alt+N`)
- Configuration options for timestamp format, separator, and log level
- Output channel for debugging and logging

[Unreleased]: https://github.com/alessandroraffa/arit-toolkit/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/alessandroraffa/arit-toolkit/releases/tag/v1.0.0
