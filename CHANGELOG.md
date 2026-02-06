## [1.1.0](https://github.com/alessandroraffa/arit-toolkit/compare/v1.0.0...v1.1.0) (2026-02-06)

### Features

* **core:** add registerguarded method for toggleable commands ([7ef792a](https://github.com/alessandroraffa/arit-toolkit/commit/7ef792acac9eb818d13cf1de68aee006aa033023))
* **core:** add workspace state manager with file persistence and onboarding ([55fe282](https://github.com/alessandroraffa/arit-toolkit/commit/55fe282ba7a7a8cae6316c5ccd82d7d3b025f6e8))
* **statusbar:** add status bar toggle with workspace mode support ([b54b0f1](https://github.com/alessandroraffa/arit-toolkit/commit/b54b0f1ac0d64cb39704c9f13b2b902c3233801d))
* **utils:** add jsonc parser utility for workspace config ([e4bc368](https://github.com/alessandroraffa/arit-toolkit/commit/e4bc36828cf06456a9741ed08d6064865f352d78))
* wire status bar toggle into extension activation ([74ce35a](https://github.com/alessandroraffa/arit-toolkit/commit/74ce35a743c0ea06d953f33ceae03a823ca61e2d))

## 1.0.0 (2026-02-06)

### Features

* add core extension infrastructure ([d9f678d](https://github.com/alessandroraffa/arit-toolkit/commit/d9f678dc3090102ce330aac7b0efebb2d0338de2))
* add timestamped file features ([8eea9cc](https://github.com/alessandroraffa/arit-toolkit/commit/8eea9cc524081bb53872000d8e65670294df7888))

### Code Refactoring

* **timestamp:** simplify feature name constant ([a060c4b](https://github.com/alessandroraffa/arit-toolkit/commit/a060c4bfc914244253d09fec713b7d1c784b14c2))
* **types:** remove unused feature interface ([1596b3b](https://github.com/alessandroraffa/arit-toolkit/commit/1596b3b00fb571628981eb43690fcc0ed25f95d0))

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
