## [1.10.3](https://github.com/alessandroraffa/arit-toolkit/compare/v1.10.2...v1.10.3) (2026-02-26)

### Bug Fixes

* prevent features from activating before config migration completes ([419b66b](https://github.com/alessandroraffa/arit-toolkit/commit/419b66bf8af19aba41df3acf6846f4b180bdf4ca))

## [1.10.2](https://github.com/alessandroraffa/arit-toolkit/compare/v1.10.1...v1.10.2) (2026-02-26)

### Bug Fixes

* **text-stats:** add gap separator inference for multi-selection joining ([1ce2bb1](https://github.com/alessandroraffa/arit-toolkit/commit/1ce2bb16abf252b361e5b97114945566af33cd02))
* **text-stats:** preserve boundaries when joining multi-cursor selections ([1ae6362](https://github.com/alessandroraffa/arit-toolkit/commit/1ae6362af124c539653d179e4de1570bb7a7c163))

## [1.10.1](https://github.com/alessandroraffa/arit-toolkit/compare/v1.10.0...v1.10.1) (2026-02-25)

### Bug Fixes

* **text-stats:** use double cast in test to satisfy strict type check ([902f650](https://github.com/alessandroraffa/arit-toolkit/commit/902f650dec3ab2af3870c60cf3584112657ad51d))

## [1.10.0](https://github.com/alessandroraffa/arit-toolkit/compare/v1.9.3...v1.10.0) (2026-02-25)

### Features

* **text-stats:** add character count metric ([b647102](https://github.com/alessandroraffa/arit-toolkit/commit/b64710236a4f431ddf7a5ce14cdea26b409ccc83))
* **text-stats:** add debounced update controller ([7254769](https://github.com/alessandroraffa/arit-toolkit/commit/72547695ccb3539b60273f2ec03935e27f580135))
* **text-stats:** add line count metric ([c70a3d9](https://github.com/alessandroraffa/arit-toolkit/commit/c70a3d956326c10deed0d86d528f71886e566d21))
* **text-stats:** add metrics barrel and formatter ([939f001](https://github.com/alessandroraffa/arit-toolkit/commit/939f001374e43dd00235574ad5321e2404c493b4))
* **text-stats:** add paragraph count metric ([d75364a](https://github.com/alessandroraffa/arit-toolkit/commit/d75364a3250eb36fb2f23f2e8c8ea5286aaf6b98))
* **text-stats:** add reading time metric ([2efd09f](https://github.com/alessandroraffa/arit-toolkit/commit/2efd09f3b1a1473dc6deaad666ca4a20a0ab1ee7))
* **text-stats:** add size formatting metric ([261a557](https://github.com/alessandroraffa/arit-toolkit/commit/261a55793bca769d7d2a73369139d52b5903353e))
* **text-stats:** add status bar item ([d2bb05b](https://github.com/alessandroraffa/arit-toolkit/commit/d2bb05b86ba8233b3fd7e311e2eae17d291509eb))
* **text-stats:** add text extraction helpers ([3446620](https://github.com/alessandroraffa/arit-toolkit/commit/34466206b1fbe16b24ad116738d1c6e95e253fcb))
* **text-stats:** add toggle and tokenizer quick pick commands ([21f4a35](https://github.com/alessandroraffa/arit-toolkit/commit/21f4a358e728d55e372614db58cc4cf6ac8ea375))
* **text-stats:** add token count metric with lazy loading ([75f772c](https://github.com/alessandroraffa/arit-toolkit/commit/75f772cbfec709a3276b69df5aebd55375ad09ab))
* **text-stats:** add tokenizer dependencies ([67be2db](https://github.com/alessandroraffa/arit-toolkit/commit/67be2db2dcca1260ff86dd525c2d8c6b5d04883e))
* **text-stats:** add types and constants ([a7e3302](https://github.com/alessandroraffa/arit-toolkit/commit/a7e3302bc0d01fb8b7c0f9f192a7b8af85c319c4))
* **text-stats:** add word count metric ([e2e9ca6](https://github.com/alessandroraffa/arit-toolkit/commit/e2e9ca6ec88ab77e564e24a54d5cd2c7657bd208))
* **text-stats:** register feature and wire lifecycle ([32f5c4f](https://github.com/alessandroraffa/arit-toolkit/commit/32f5c4f6873c57206bbafe6951547bfad44b9f09))

## [1.9.3](https://github.com/alessandroraffa/arit-toolkit/compare/v1.9.2...v1.9.3) (2026-02-22)

### Code Refactoring

* add parseresult type for format-aware session parsing ([1bfb952](https://github.com/alessandroraffa/arit-toolkit/commit/1bfb952edd5de1e5bcfc9103c79e903393d3e2b7))

## [1.9.2](https://github.com/alessandroraffa/arit-toolkit/compare/v1.9.1...v1.9.2) (2026-02-22)

### Bug Fixes

* add jsonl format support to copilot chat session parser ([dc286c5](https://github.com/alessandroraffa/arit-toolkit/commit/dc286c5003eff8669e57bf4bcafae62ff304ccef))

## [1.9.1](https://github.com/alessandroraffa/arit-toolkit/compare/v1.9.0...v1.9.1) (2026-02-21)

### Bug Fixes

* **configAutoCommit:** skip git hooks on programmatic config commits ([9972d65](https://github.com/alessandroraffa/arit-toolkit/commit/9972d65cea2cb8876d9de0db6108bc74e6022759))

## [1.9.0](https://github.com/alessandroraffa/arit-toolkit/compare/v1.8.0...v1.9.0) (2026-02-20)

### Features

* **agentSessionsArchiving:** deduplicate archived sessions on cycle start ([748b055](https://github.com/alessandroraffa/arit-toolkit/commit/748b05599c45424ac9916ba7b4b0cc684e41ddb1))

## [1.8.0](https://github.com/alessandroraffa/arit-toolkit/compare/v1.7.4...v1.8.0) (2026-02-20)

### Features

* **checkup:** implement comprehensive config health check ([a05a831](https://github.com/alessandroraffa/arit-toolkit/commit/a05a831047e87046620f72730dc21fafd8a0ae7b))
* **configAutoCommit:** add suspend/resume and explicit commit method ([3e26f24](https://github.com/alessandroraffa/arit-toolkit/commit/3e26f248eb93af9f73afb6da6164320e94c6ad1f))

### Bug Fixes

* **agentSessionsArchiving:** handle current copilot chat session format ([8c9ca5c](https://github.com/alessandroraffa/arit-toolkit/commit/8c9ca5c18a79b33bb891a26a7c759ab72574848f))
* **configAutoCommit:** show error notification when commit fails ([c942709](https://github.com/alessandroraffa/arit-toolkit/commit/c9427090d0c6a420a0b4c412b004a48e5ac6c4e7))
* **git:** unstage file when commit fails after staging ([b1a029c](https://github.com/alessandroraffa/arit-toolkit/commit/b1a029c5ff0b16123b3b6add21d9aa26eae4d048))

### Code Refactoring

* rename "run setup" command to "checkup" ([bab01fa](https://github.com/alessandroraffa/arit-toolkit/commit/bab01fa454a9233237217a6f3b6045d74e749304))

## [1.7.4](https://github.com/alessandroraffa/arit-toolkit/compare/v1.7.3...v1.7.4) (2026-02-19)

### Bug Fixes

* **extensionStateManager:** preserve config sections during reinitialize ([c22f90b](https://github.com/alessandroraffa/arit-toolkit/commit/c22f90bbc4e3340c254672560a17e26dffb1ce58))

## [1.7.3](https://github.com/alessandroraffa/arit-toolkit/compare/v1.7.2...v1.7.3) (2026-02-19)

### Code Refactoring

* **core:** move git utilities from utils to core ([adfaedd](https://github.com/alessandroraffa/arit-toolkit/commit/adfaedd52d13e0a669972096ce989279bd4b4df4))
* **statusBarToggle:** remove cross-feature dependency via service registry ([726ec38](https://github.com/alessandroraffa/arit-toolkit/commit/726ec388577f4cba83082f699892790282b0c619))

## [1.7.2](https://github.com/alessandroraffa/arit-toolkit/compare/v1.7.1...v1.7.2) (2026-02-18)

### Bug Fixes

* **configAutoCommit:** skip commit prompt when config file has no changes ([b6da927](https://github.com/alessandroraffa/arit-toolkit/commit/b6da927fd4c5f8430630441263b52a1a88fba397))

## [1.7.1](https://github.com/alessandroraffa/arit-toolkit/compare/v1.7.0...v1.7.1) (2026-02-18)

### Bug Fixes

* **agentSessionsArchiving:** filter non-jsonl files in claude code provider ([31704f7](https://github.com/alessandroraffa/arit-toolkit/commit/31704f773fff55f9989d6549419ce216fc7fd29e))
* **agentSessionsArchiving:** skip empty turns in markdown renderer ([9f7df34](https://github.com/alessandroraffa/arit-toolkit/commit/9f7df34deec1720de6bb9077bd1a5562e50b44fe))
* **agentSessionsArchiving:** use creation time for archive filename prefix ([d786260](https://github.com/alessandroraffa/arit-toolkit/commit/d7862606104ac06c9a921ec3e2ccbad8a6a48dfa))

## [1.7.0](https://github.com/alessandroraffa/arit-toolkit/compare/v1.6.0...v1.7.0) (2026-02-18)

### Features

* **agentSessionsArchiving:** add date cutoff filter for session archiving ([7251bf5](https://github.com/alessandroraffa/arit-toolkit/commit/7251bf5948b7375a35f2356bcbdc9a2d12318385))

### Bug Fixes

* **extensionStateManager:** run config migration after onboarding acceptance ([88b306b](https://github.com/alessandroraffa/arit-toolkit/commit/88b306bdb83dd01e667b30f966a58155cc31f287))

## [1.6.0](https://github.com/alessandroraffa/arit-toolkit/compare/v1.5.2...v1.6.0) (2026-02-16)

### Features

* **statusBarToggle:** add run setup button to status bar tooltip ([e2d402a](https://github.com/alessandroraffa/arit-toolkit/commit/e2d402a097db48531d414938367f229b98cf4fd1))

### Bug Fixes

* **configMigration:** re-prompt for declined config sections on reload ([f814882](https://github.com/alessandroraffa/arit-toolkit/commit/f8148828f14349e95b233828b2d40dc15d7e3cef))

## [1.5.2](https://github.com/alessandroraffa/arit-toolkit/compare/v1.5.1...v1.5.2) (2026-02-15)

### Bug Fixes

* add node types to tsconfig for global api resolution ([8a2e0e4](https://github.com/alessandroraffa/arit-toolkit/commit/8a2e0e4c22fa7fff3d929df6d5729b3be429f8fb))
* **archiveService:** add debug logging to silent error paths ([1eb4d1f](https://github.com/alessandroraffa/arit-toolkit/commit/1eb4d1f1db149e08b0c091d9de2ffd6920cee6d0))
* **archiveService:** remove no-op loop in move archive ([726f962](https://github.com/alessandroraffa/arit-toolkit/commit/726f962b3c36ec91b73ab2157aa4a66ce3f68431))
* **deps:** override markdown-it to >=14.1.1 for security fix ([d0bb927](https://github.com/alessandroraffa/arit-toolkit/commit/d0bb927cae61941363ac9534151df5238a9d13d7))

### Code Refactoring

* **agentSessionsArchiving:** extract migration registration into helper ([995464c](https://github.com/alessandroraffa/arit-toolkit/commit/995464c1f277c808bed2faabe00eeacc49632b97))
* **providers:** extract shared utilities and improve path matching ([61a1138](https://github.com/alessandroraffa/arit-toolkit/commit/61a11381cb54092c0e35edf5392a8441068f2c19))
* **statusBarToggle:** redesign tooltip with action-oriented layout ([1d21e9f](https://github.com/alessandroraffa/arit-toolkit/commit/1d21e9f91f05a0ed015a2fd01424457b2d0907a4))
* **statusBarToggle:** remove features and configuration from tooltip ([387145e](https://github.com/alessandroraffa/arit-toolkit/commit/387145e5283bf62890cbf7cd588e3228a2001060))

## [Unreleased](https://github.com/alessandroraffa/arit-toolkit/compare/v1.5.1...HEAD)

### Bug Fixes

* **archiveService:** remove no-op loop in move archive
* **archiveService:** add debug logging to silent error paths
* add node types to tsconfig for global api resolution
* **configMigration:** re-prompt for declined config sections on every reload
* **extensionStateManager:** run config migration after onboarding acceptance

### Features

* **agentSessionsArchiving:** add ignoreSessionsBefore config option to skip old sessions
* **statusBarToggle:** add run setup button to status bar tooltip

### Code Refactoring

* **statusBarToggle:** redesign tooltip with action-oriented layout
* **statusBarToggle:** remove features and configuration from tooltip
* **providers:** extract shared utilities and improve path matching
* **agentSessionsArchiving:** extract migration registration into helper

### Tests

* **extensionStateManager:** split test file into two focused modules
* improve coverage for archive service and claude code parser

### Chores

* update extension icon

### Build

* upgrade minimum VS Code version from 1.85.0 to 1.109.0 to align with @types/vscode

### Documentation

* update README status bar description and prefix command access note

## [1.5.1](https://github.com/alessandroraffa/arit-toolkit/compare/v1.5.0...v1.5.1) (2026-02-14)

### Code Refactoring

* **agentSessionsArchiving:** replace turn headings with bold role prefixes ([3227096](https://github.com/alessandroraffa/arit-toolkit/commit/322709604b8cccfd80a460c3be72d7456baa606b))

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
