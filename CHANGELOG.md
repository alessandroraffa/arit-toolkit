## [1.5.0](https://github.com/alessandroraffa/arit-toolkit/compare/v1.4.3...v1.5.0) (2026-02-13)

### Features

* add auto-commit service for config changes ([c3557e5](https://github.com/alessandroraffa/arit-toolkit/commit/c3557e5aec03f2a54bc02605454581338ad98e81))
* add git utilities for gitignore check and stage-commit ([98db159](https://github.com/alessandroraffa/arit-toolkit/commit/98db159b48e0ab5d8f3f01c6a5df5813b21923e6))
* add markdown renderer for archived sessions ([b6a0963](https://github.com/alessandroraffa/arit-toolkit/commit/b6a096326d6d8d8d0b131397ec718193f45e6602))
* add normalized session model for markdown conversion ([1e1a30e](https://github.com/alessandroraffa/arit-toolkit/commit/1e1a30e3b0010e6c9b86455cedae2bcc8c21db33))
* add provider name to session file model ([325741e](https://github.com/alessandroraffa/arit-toolkit/commit/325741eda7ec9b83eb0840e6357c86e56a4ad163))
* add session parsers for markdown conversion ([f87f84f](https://github.com/alessandroraffa/arit-toolkit/commit/f87f84f689e7f29af1b346924fd524ec31e3c61c))
* integrate auto-commit into extension lifecycle ([d954147](https://github.com/alessandroraffa/arit-toolkit/commit/d9541479a0bc3ca1b9cad12bc5b2ffb61a869c4d))
* integrate markdown conversion into archive service ([2319d4f](https://github.com/alessandroraffa/arit-toolkit/commit/2319d4fa6173a2834efc385399b4637b6de5927e))

## [1.4.3](https://github.com/alessandroraffa/arit-toolkit/compare/v1.4.2...v1.4.3) (2026-02-13)

### Bug Fixes

* correct copilot chat session path and support jsonl format ([3e323e2](https://github.com/alessandroraffa/arit-toolkit/commit/3e323e2bb80c328039cd8413777c6c8de22330ee))
* filter agent sessions by workspace to prevent cross-workspace archiving ([3751da1](https://github.com/alessandroraffa/arit-toolkit/commit/3751da1f91b289f81d9f9844fd9f854204c2c17a))
* use session mtime instead of current time for archive filename timestamp ([b231d62](https://github.com/alessandroraffa/arit-toolkit/commit/b231d62e98b9169de8b45b86d0dbd5faf6ff65d8))

## [1.4.2](https://github.com/alessandroraffa/arit-toolkit/compare/v1.4.1...v1.4.2) (2026-02-13)

### Bug Fixes

* override esbuild to >=0.25.0 to resolve cors vulnerability in dev server ([aa7e10a](https://github.com/alessandroraffa/arit-toolkit/commit/aa7e10a9be4d1fb8f0c0961bb3f96419c4f1823e))

## [1.4.1](https://github.com/alessandroraffa/arit-toolkit/compare/v1.4.0...v1.4.1) (2026-02-12)

### Bug Fixes

* override qs to >=6.14.2 to resolve dos vulnerability (ghsa-njh5-hf29-cjgq) ([5954167](https://github.com/alessandroraffa/arit-toolkit/commit/59541673d73103fb91341e025d5f2bc0dc97433f))

## [1.4.0](https://github.com/alessandroraffa/arit-toolkit/compare/v1.3.0...v1.4.0) (2026-02-12)

### Features

* **agentSessionsArchiving:** add archive service with mtime-based sync ([cab8f04](https://github.com/alessandroraffa/arit-toolkit/commit/cab8f046718b4e23892a4f80da5a5655b6ac39f1))
* **agentSessionsArchiving:** add constants and types ([b3ac31a](https://github.com/alessandroraffa/arit-toolkit/commit/b3ac31a65dc1ab61c6b9a5f3fb5a895a2d50f152))
* **agentSessionsArchiving:** add feature registration and toggle command ([415283f](https://github.com/alessandroraffa/arit-toolkit/commit/415283fb6146df90e34b7284367026b7420fba0e))
* **agentSessionsArchiving:** add session providers ([1fe3fb8](https://github.com/alessandroraffa/arit-toolkit/commit/1fe3fb89f5ed75d325ad56049bc6446326d53ef5))
* **agentSessionsArchiving:** add toggle command to package.json ([82bd368](https://github.com/alessandroraffa/arit-toolkit/commit/82bd368a5ef142abc0ee12bb9777ca477f6a711e))
* **configMigration:** add barrel exports ([06b10b4](https://github.com/alessandroraffa/arit-toolkit/commit/06b10b43b32708ef050c7496e472ed8ae85044df))
* **configMigration:** add config section registry and types ([998138b](https://github.com/alessandroraffa/arit-toolkit/commit/998138b365fc69cb1548df2828aa83d34a96e6be))
* **configMigration:** add migration service ([23c69ae](https://github.com/alessandroraffa/arit-toolkit/commit/23c69ae032d23260c71585844ea829503cd67b5d))
* **configMigration:** wire migration system into extension activation ([c908bf9](https://github.com/alessandroraffa/arit-toolkit/commit/c908bf9d018eb55376a8b3a301f5ac9babf770c6))
* **statusBar:** add background services section to tooltip ([00430d9](https://github.com/alessandroraffa/arit-toolkit/commit/00430d94137a45079bd222c9866468da271639c4))
* **types:** add agent sessions archiving config interface ([4cedbbd](https://github.com/alessandroraffa/arit-toolkit/commit/4cedbbd92f5ed346351c287dd54be69d7194e9dd))

### Code Refactoring

* **extensionStateManager:** support full config and per-section events ([3472390](https://github.com/alessandroraffa/arit-toolkit/commit/34723900ff807fe7f1319d78a3ca3073b1b966c8))

## [1.3.0](https://github.com/alessandroraffa/arit-toolkit/compare/v1.2.0...v1.3.0) (2026-02-09)

### Features

* **versionCode:** add version and version code fields to workspace config ([063df88](https://github.com/alessandroraffa/arit-toolkit/commit/063df8819c979eedfabb22088c3022273c09395c))
* **versionCode:** add version code computation utility ([3d1a8b1](https://github.com/alessandroraffa/arit-toolkit/commit/3d1a8b176163526263450fc9086941f093e750e6))
* **versionCode:** add version code field to package.json ([adfc5df](https://github.com/alessandroraffa/arit-toolkit/commit/adfc5df570bd593078dff2c60d9c314c7e53cf73))
* **versionCode:** add version compatibility check on workspace init ([abd8498](https://github.com/alessandroraffa/arit-toolkit/commit/abd84986497040353c7b4be930743d034f31a94d))
* **versionCode:** pass extension version to state manager on activate ([f8d13d3](https://github.com/alessandroraffa/arit-toolkit/commit/f8d13d33a3d408de96c8361f326659d3a4710384))

## [1.2.0](https://github.com/alessandroraffa/arit-toolkit/compare/v1.1.2...v1.2.0) (2026-02-09)

### Features

* **timestampedDirectory:** add command constants ([ee082fd](https://github.com/alessandroraffa/arit-toolkit/commit/ee082fd3c4b6dfd6c833e6829a9734cfc5b10553))
* **timestampedDirectory:** add commands and menus to package.json ([b34f64c](https://github.com/alessandroraffa/arit-toolkit/commit/b34f64c7b9593095e6745690d1cf998b599ca388))
* **timestampedDirectory:** add create and prefix timestamp commands ([493b9d9](https://github.com/alessandroraffa/arit-toolkit/commit/493b9d9056401d65216d049e82d3ea17e5725c30))
* **timestampedDirectory:** register feature in extension ([27a4e09](https://github.com/alessandroraffa/arit-toolkit/commit/27a4e09e150ec7566f063bdfab40da13581f1f33))

### Code Refactoring

* move timestamp generation to shared utils ([fa77c22](https://github.com/alessandroraffa/arit-toolkit/commit/fa77c22338c3c6aeb9d02e7486acfe65478c8e7e))

## [1.1.2](https://github.com/alessandroraffa/arit-toolkit/compare/v1.1.1...v1.1.2) (2026-02-06)

### Bug Fixes

* activate extension at startup and sync status bar after init ([7bde111](https://github.com/alessandroraffa/arit-toolkit/commit/7bde111c3c2e3a66545edcc36e3218516814457e))

## [1.1.1](https://github.com/alessandroraffa/arit-toolkit/compare/v1.1.0...v1.1.1) (2026-02-06)

### Code Refactoring

* use context objects to reduce function parameter count ([fd12390](https://github.com/alessandroraffa/arit-toolkit/commit/fd1239061c95fd903c10370164e5f53cdcee6e9b))

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
