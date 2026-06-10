# Tangyr Workbench -- Technical Context Document

> **Scope.** This document follows the arc42 template (sections 1--4, 8, 12)
> and the principles of ISO/IEC/IEEE 42010:2022 for architecture description.
> It identifies stakeholders, concerns, and viewpoints relevant to
> understanding the system. It does not replace detailed artefacts such as
> Architecture Decision Records, data-model specs, or requirement
> specifications; instead it serves as the entry point for navigating the
> full body of documentation.

| Field              | Value                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| System             | Tangyr Workbench -- VS Code Extension                                                                                                       |
| Repository         | <https://github.com/alessandroraffa/tangyr-vscode>                                                                                          |
| Identifier         | `alessandroraffa.tangyr`                                                                                                                    |
| Current version    | 1.10.2 (versionCode `1001010002`)                                                                                                           |
| Licence            | MIT                                                                                                                                         |
| Architecture style | Feature-based modular architecture, dependency injection                                                                                    |
| Runtime deps       | None at runtime (VS Code API only). `js-tiktoken` and `@anthropic-ai/tokenizer` are dev dependencies bundled into the extension by esbuild. |
| Last updated       | 2026-05-28                                                                                                                                  |

---

## 1 Introduction and Goals

### 1.1 Requirements Overview

Tangyr Workbench is a VS Code extension that bundles productivity utilities
for developers working inside a single-root workspace. Its capabilities
fall into four categories:

| Category            | Capability                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File utilities      | Create or rename files/directories with UTC timestamp prefixes in configurable formats.                                                                               |
| Background services | Periodically archive chat session files produced by AI coding assistants (Aider, Claude Code, Cline, Roo Code, GitHub Copilot Chat, Continue).                        |
| Status bar services | Display real-time text statistics (characters, tokens, words, lines, paragraphs, reading time, file size) with selection awareness and configurable tokenizer models. |
| Editing utilities   | Increment or decrement markdown heading levels across selected text via command palette and keybindings.                                                              |

The extension is workspace-aware: a JSONC configuration file
(`.tangyr.jsonc`) at the workspace root stores the enabled state,
the extension version, and per-feature settings. A version-aware
config-migration system ensures that users upgrading from older versions
are prompted to opt in to new configuration sections.

### 1.2 Quality Goals

| Priority | Quality attribute    | Concrete goal                                                                                                                                                                                                                                      |
| -------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Maintainability      | Strict ESLint complexity limits (max 250 lines/file, 50 lines/fn, cyclomatic complexity <= 10, max nesting 3, max params 3). Feature-per-folder isolation.                                                                                         |
| 2        | Reliability          | >= 80 % unit-test coverage (lines, functions, branches, statements). >= 60 % integration-test coverage on textStats (lines, functions, statements). Strict TypeScript (`noImplicitAny`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`). |
| 3        | Extensibility        | New features register through `FeatureRegistrationContext` without touching core modules. Config sections self-register via `ConfigSectionRegistry`.                                                                                               |
| 4        | Security             | Zero runtime dependencies. Tokenizer vocabularies bundled at build time — no network calls. No credential handling.                                                                                                                                |
| 5        | Developer experience | One-click enable/disable via status bar. Rich markdown tooltip. Conventional commits + automated semantic-release pipeline.                                                                                                                        |

### 1.3 Stakeholders

| Stakeholder          | Concern                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Extension users      | Stable, non-intrusive behaviour; clear onboarding; easy enable/disable; predictable timestamp formats.            |
| Extension maintainer | Small surface area; automated releases; enforceable code-quality gates; low coupling between features.            |
| Contributors         | Fast feedback loop (`vitest`); clear module boundaries; well-documented patterns; conventional commit discipline. |
| VS Code Marketplace  | Activation performance; no runtime deps; well-scoped permissions.                                                 |

## 2 Constraints

### 2.1 Technical Constraints

| Constraint                 | Detail                                                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VS Code API surface        | The extension runs inside the VS Code extension host. All file I/O goes through `vscode.workspace.fs`; UI through `vscode.window`; commands through `vscode.commands`.                                                                                  |
| Single-root workspace only | Advanced features (state toggle, config migration, agent-session archiving, text stats) require a single workspace root. Multi-root and no-workspace modes degrade gracefully.                                                                          |
| Node.js >= 22.22.0         | Required by `package.json` `engines` field.                                                                                                                                                                                                             |
| VS Code >= 1.109.0         | Minimum host version; determines available API surface.                                                                                                                                                                                                 |
| CommonJS bundle            | VS Code extension host requires CJS. The project is authored in ESM-style TypeScript and bundled by esbuild into a single `dist/extension.js`.                                                                                                          |
| Zero runtime dependencies  | All functionality is implemented against Node.js built-ins and the VS Code API. Tokenizer libraries (`js-tiktoken`, `@anthropic-ai/tokenizer`) are dev dependencies bundled by esbuild — they do not appear in the extension's runtime dependency tree. |

### 2.2 Organisational Constraints

| Constraint                 | Detail                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Conventional Commits       | Enforced by commitlint + Husky pre-commit hook. Required for semantic-release.                                                 |
| pnpm as package manager    | Enforced by a `preinstall` script guard.                                                                                       |
| Automated release pipeline | semantic-release on `main` branch: version bump, changelog generation, `.vsix` packaging, Marketplace publish, GitHub release. |

### 2.3 Conventions

| Convention                       | Detail                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature isolation                | Each feature lives under `src/features/<name>/` and exposes a single `register*Feature()` entry point. Features depend on Core and Utils, never on each other.                    |
| Config section self-registration | Features that add workspace-config sections register a `ConfigSectionDefinition` so the migration system can detect missing sections and offer them to users on every activation. |
| UTC timestamps                   | All generated timestamps use UTC (`getUTCFullYear()`, etc.).                                                                                                                      |
| Disposable pattern               | Every VS Code resource (watchers, event emitters, commands) is tracked via `context.subscriptions` for deterministic cleanup.                                                     |

### 2.4 Dependency overrides

**Dependency overrides:** `package.json` declares a `pnpm.overrides` block
that forces vulnerable transitive packages to their patched versions.
The block is updated whenever `pnpm audit` reports an advisory not
already covered. Removal of an override entry is allowed only after
verifying — via `pnpm why <package>` — that no remaining ancestor in the
resolution tree pulls in a vulnerable range. The override block is the
project's surgical fix path for transitive vulnerabilities; the
Dependabot security-update PRs targeting the same packages are
superseded once the overrides are merged and may be closed without
merge.

## 3 Context and Scope

### 3.1 Business Context

```txt<>
                           +-----------------------+
                           |    VS Code Editor     |
                           |   (Extension Host)    |
                           +-----------+-----------+
                                       |
                      activates on     |  onStartupFinished
                      workspace open   |
                                       v
                           +-----------------------+
                           |    Tangyr Workbench       |
                           |    Extension          |
                           +-----------+-----------+
                                       |
        +----------+-----------+-------+-------+-----------+-----------+
        |          |           |               |           |           |
        v          v           v               v           v           v
  Timestamped Timestamped Status Bar    Text Stats   Agent Session  Config
  File        Directory   Toggle        Feature      Archiving      Migration
  Feature     Feature     Feature                    Feature        System
```

| External actor         | Interaction                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VS Code user           | Invokes commands (palette, context menu, keyboard shortcut), toggles extension via status bar, edits `.tangyr.jsonc` manually.                                                                           |
| `.tangyr.jsonc`        | Persists workspace state (enabled flag, version, feature configs). Watched by `FileSystemWatcher` for external edits.                                                                                    |
| VS Code settings       | `tangyr.timestampFormat`, `tangyr.timestampSeparator`, `tangyr.logLevel` -- read via `ConfigManager`.                                                                                                    |
| Active text editor     | Source for real-time text statistics. Text Stats listens to editor change, document change, and selection change events.                                                                                 |
| AI agent session files | Read-only sources: `.aider.chat.history.md`, `~/.claude/projects/`, VS Code globalStorage/workspaceStorage directories. Only sessions belonging to the current workspace are copied to the archive path. |
| VS Code Marketplace    | Publish target for `.vsix` packages via semantic-release pipeline.                                                                                                                                       |

### 3.2 Technical Context

```text
+------------------------------------------------------------------+
|  VS Code Extension Host (Node.js >= 22.22.0)                    |
|                                                                  |
|  +--------------------------+   +-----------------------------+  |
|  |  Core                    |   |  Utils                      |  |
|  |  - Logger                |   |  - timestamp.ts             |  |
|  |  - ConfigManager         |   |  - timestampPrefix.ts       |  |
|  |  - CommandRegistry       |   |  - jsonc.ts                 |  |
|  |  - ExtensionStateManager |   |  - version.ts               |  |
|  |  - ConfigMigration/      |   +-----------------------------+  |
|  |    - Registry            |   +-----------------------------+  |
|  |    - MigrationService    |   |  Types                      |  |
|  +--------------------------+   |  - TimestampFormat           |  |
|              ^                  |  - LogLevel                  |  |
|              |  depends on      |  - WorkspaceMode             |  |
|              |                  |  - WorkspaceConfig           |  |
|              |                  |  - TokenizerModel            |  |
|              |                  |  - MetricKey                 |  |
|              |                  |  - TextStatsConfig           |  |
|  +-----------+----------------------------------------------+    |
|  |  Features                                                |    |
|  |  +------------------+ +-------------------+              |    |
|  |  | timestampedFile  | | timestampedDir    |              |    |
|  |  +------------------+ +-------------------+              |    |
|  |  +------------------+ +-------------------+              |    |
|  |  | statusBarToggle  | | agentSessions     |              |    |
|  |  |                  | | Archiving         |              |    |
|  |  |                  | |  - ArchiveService |              |    |
|  |  |                  | |  - Providers (x6) |              |    |
|  |  |                  | |  - Parsers (x4+1) |              |    |
|  |  +------------------+ +-------------------+              |    |
|  |  +------------------+ +-------------------+              |    |
|  |  | textStats        | | markdownHeadings  |              |    |
|  |  |  - Controller    | |  - Increment/     |              |    |
|  |  |  - Metrics (x7)  | |    Decrement      |              |    |
|  |  |  - Tokenizers    | |    commands       |              |    |
|  |  +------------------+ +-------------------+              |    |
|  +----------------------------------------------------------+    |
|                                                                  |
+------------------------------------------------------------------+
         |                   |                    |
         v                   v                    v
   .tangyr.jsonc    workspace FS     global FS / VS Code
   (workspace root)       (file create/    storage (agent
                           rename)          session sources)
```

**Dependency rules:**

- `Features` --> `Core`, `Utils`, `Types` (allowed)
- `Features` --> `Features` (forbidden)
- `Core` --> `Utils`, `Types` (allowed)
- `Core` --> `Features` (forbidden)
- `Utils` --> nothing (pure functions, no VS Code imports)

**External I/O channels:**

| Channel                | Protocol / API                                                                                                  | Direction |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| Workspace filesystem   | `vscode.workspace.fs` (read/write/stat/copy/delete/readDirectory)                                               | R/W       |
| VS Code settings       | `vscode.workspace.getConfiguration()`                                                                           | Read      |
| VS Code commands       | `vscode.commands.registerCommand()`                                                                             | Register  |
| VS Code UI             | `vscode.window.*` (status bar, input box, messages)                                                             | Write     |
| Global filesystem      | `vscode.workspace.fs` via `vscode.Uri.file()` for `~/.claude/`, `~/.continue/`, globalStorage, workspaceStorage | Read      |
| VS Code Output Channel | `vscode.window.createOutputChannel()`                                                                           | Write     |

---

## 4 Solution Strategy

### 4.1 Technology Decisions

| Decision                   | Rationale                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript (strict mode)   | Catches errors at compile time; enables IDE tooling; enforced by ESLint rules.                                                                                       |
| esbuild for bundling       | Sub-second builds; single-file output (`dist/extension.js`); tree-shaking.                                                                                           |
| Vitest for unit testing    | ESM-native; fast; compatible with VS Code mock pattern; V8 coverage provider.                                                                                        |
| Vitest for integration     | Same runner as unit tests; separate config (`vitest.integration.config.ts`); no mocks; exercises real bundled deps post-build.                                       |
| JSONC for workspace config | Human-readable; allows inline comments; familiar to VS Code users.                                                                                                   |
| semantic-release           | Fully automated: version bump, changelog, `.vsix` package, Marketplace publish, GitHub release.                                                                      |
| Zero runtime dependencies  | Minimises attack surface and compatibility risk. Tokenizer vocabularies are bundled at build time (increasing bundle from ~72 KB to ~6 MB) to avoid runtime fetches. |

### 4.2 Architectural Approach

**Feature-based modular architecture** with explicit dependency boundaries:

1. **Core layer** provides infrastructure (logger, config, state, commands,
   migration) that is stable and feature-agnostic.
2. **Feature layer** contains self-contained bounded contexts, each
   exposing a single `register*Feature(ctx)` function that receives a
   `FeatureRegistrationContext` (dependency injection).
3. **Utils layer** contains pure functions with zero VS Code imports,
   testable in isolation.
4. **Extension entry point** (`src/extension.ts`) wires everything
   together: creates core instances, builds the context, calls
   `registerAllFeatures()`, then triggers async initialisation.

### 4.3 Key Design Decisions

| #   | Decision                                                | Context                                                                      | Consequences                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Single-root workspace requirement for stateful features | Multi-root workspaces have no single root to place `.tangyr.jsonc`.          | Multi-root mode degrades gracefully: basic commands available, toggle and archiving disabled. Status bar shows warning.                                                                                                                                                   |
| 2   | Global toggle + per-feature toggles                     | Users need coarse-grained and fine-grained control over background services. | `enabled: false` at root level stops all background activity. Each feature's `enabled` is preserved and resumes independently when global toggle returns to `true`.                                                                                                       |
| 3   | Presence-based config migration                         | Adding new config sections should not break existing users.                  | On activation, `ConfigMigrationService` detects sections whose keys are absent from the workspace config and prompts users individually. Declined sections are re-prompted on the next activation (only when the extension is globally enabled).                          |
| 4   | mtime-based change detection for archiving              | Reading and hashing large session files is expensive.                        | `vscode.workspace.fs.stat()` is fast and sufficient. Each source session maps to exactly one archived file (latest version), replaced on mtime change.                                                                                                                    |
| 5   | Session Provider abstraction                            | AI agent tools store sessions in different locations and formats.            | `SessionProvider` interface allows adding new agents without modifying the archive service. Each provider encapsulates discovery logic (workspace, global path, VS Code storage) and workspace filtering (only sessions belonging to the current workspace are archived). |

### 4.4 Activation and Initialisation Sequence

```text
activate(context)
  |
  +-- Logger.getInstance() + ConfigManager
  +-- ConfigSectionRegistry + ConfigMigrationService
  +-- ExtensionStateManager(logger, migrationService)
  +-- CommandRegistry(context, stateManager)
  +-- registerAllFeatures(ctx)
  |     |
  |     +-- registerStatusBarToggleFeature(ctx)
  |     |     +-- register tangyr.toggleEnabled command
  |     |     +-- register tangyr.checkup command
  |     +-- registerTimestampedFileFeature(registry, config, logger)
  |     +-- registerTimestampedDirectoryFeature(registry, config, logger)
  |     +-- registerAgentSessionsArchivingFeature(ctx)
  |     |     |
  |     |     +-- migrationRegistry.register(agentSessionsArchiving section)
  |     |     +-- getDefaultProviders(context)
  |     |     +-- new AgentSessionArchiveService(...)
  |     |     +-- registry.register(toggleCommand)
  |     |     +-- subscribe to onDidChangeState
  |     |     +-- subscribe to onConfigSectionChanged
  |     +-- registerTextStatsFeature(ctx)
  |     |     |
  |     |     +-- migrationRegistry.register(textStats section)
  |     |     +-- stateManager.registerService(textStats)
  |     |     +-- createTextStatsStatusBarItem()
  |     |     +-- new TextStatsController()
  |     |     +-- wireCommands (toggle + changeTokenizer)
  |     |     +-- subscribe to onDidChangeState
  |     |     +-- subscribe to onConfigSectionChanged
  |     |     +-- subscribe to editor/document/selection change events
  |     +-- registerMarkdownHeadingsFeature(registry, logger)
  |           +-- register tangyr.markdownHeadings.increment command
  |           +-- register tangyr.markdownHeadings.decrement command
  |
  +-- stateManager.initialize(extensionVersion)  [async]
        |
        +-- readStateFromFile()
        +-- setupFileWatcher()
        +-- if initialised:
        |     +-- fire onDidChangeState
        |     +-- runMigration()
        |           +-- migrationService.migrate(fullConfig, versionCode, version)
        |           +-- promptForSections() if missing sections detected
        |           +-- writeFullConfig() with merged result
        |           +-- notify section listeners
        +-- if not initialised:
              +-- showOnboardingNotification()
              +-- if accepted: runMigration()
        +-- verifyLegacyConfigMigration()  [backstop: no-op if .tangyr.jsonc present]

stateManager.checkup()  [async, triggered by "Checkup" button]
  |
  +-- guard: skip if not single-root, no workspace root, or no extension version
  +-- autoCommitService.suspend()
  +-- readStateFromFile()
  +-- if not initialised:
  |     +-- showOnboardingNotification()
  |     +-- if declined: resume auto-commit and return
  +-- fire onDidChangeState
  +-- runMigration()  (unconditionally — user explicitly requested)
  +-- autoCommitService.commitIfNeeded()
  +-- autoCommitService.resume()  (in finally)
  +-- return CheckupResult { configUpdated, commitResult }
```

---

## 8 Cross-cutting Concepts

### 8.1 Workspace State Persistence

The `.tangyr.jsonc` file is the single source of truth for
workspace-level state:

```jsonc
// Tangyr Workbench workspace configuration
// Managed by the Tangyr Workbench extension
{
  "enabled": true,
  "version": "1.4.0",
  "versionCode": 1001004000,
  "agentSessionsArchiving": {
    "enabled": true,
    "archivePath": "docs/archive/agent-sessions",
    "intervalMinutes": 5,
    "ignoreSessionsBefore": "20250101",
  },
  "textStats": {
    "enabled": true,
    "delimiter": " | ",
    "unitSpace": true,
    "wpm": 200,
    "tokenizer": "o200k",
    "includeWhitespace": true,
    "tokenSizeLimit": 500000,
    "visibleMetrics": [
      "chars",
      "tokens",
      "words",
      "lines",
      "paragraphs",
      "readTime",
      "size",
    ],
  },
}
```

**Read path:** `readStateFromFile()` parses JSONC, stores the full
config object, extracts top-level `enabled`/`versionCode`, and
notifies per-section listeners for any changed sections.

**Write path:** `writeStateToFile(enabled)` merges the new `enabled`
state into the existing `_fullConfig`, preserving all custom sections.
`writeFullConfig()` serialises back to JSONC with the standard header.

**External edit detection:** A `FileSystemWatcher` on the config file
re-reads on change/create and fires `onDidChangeState`.

**Self-write suppression:** Self-writes are suppressed via content-equality: `writeFullConfig` stores the exact formatted content string it wrote in `_lastWrittenConfigContent`; the watcher reload handler reads the file, decodes it, and on an exact string match clears the field and returns early without firing — preventing the extension's own config writes from triggering restart churn. A read error or content mismatch causes normal reload processing, bounding false-negative suppression to a single redundant reload.

### 8.2 Config Migration

The migration system enables forward-compatible config evolution:

```text
ConfigSectionRegistry          ConfigMigrationService
  .register(definition)  --->    .findMissingSections(config)
                                 .promptForSections(missing)
                                 .mergeIntoConfig(config, accepted, version)
```

- A section is "missing" if its key is absent from the config.
- Users are prompted per section; declined sections are not written but
  will be re-prompted on the next extension activation (only when the
  extension is globally enabled).
- The merge is non-destructive: existing values are never overwritten.
- `version` and `versionCode` are always updated.

### 8.3 Version Code Encoding

Semantic versions are encoded as numeric codes for fast comparison:

```text
1XXXYYYZZZ = 1_000_000_000 + major * 1_000_000 + minor * 1_000 + patch
```

Examples: `1.0.0` -> `1001000000`, `1.3.0` -> `1001003000`.

Each segment (major, minor, patch) supports values 0--999.

### 8.4 Event-driven Feature Coordination

Features coordinate through events, not direct calls:

| Event                         | Emitter                 | Consumers                                                                                                                     |
| ----------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `onDidChangeState(boolean)`   | `ExtensionStateManager` | Status bar, Agent archiving (idempotent — skips `start()` when service is already running with deep-equal config), Text Stats |
| `onConfigSectionChanged(key)` | `ExtensionStateManager` | Agent archiving (reconfigure), Text Stats                                                                                     |
| `onConfigChange()`            | `ConfigManager`         | Logger (update log level)                                                                                                     |

This ensures features remain decoupled: they react to state changes
rather than calling each other.

### 8.5 Global Toggle Semantics

The two-level toggle system works as follows:

| Global `enabled` | Feature `enabled` | Background service state |
| ---------------- | ----------------- | ------------------------ |
| `true`           | `true`            | Running                  |
| `true`           | `false`           | Stopped                  |
| `false`          | `true`            | Stopped (paused)         |
| `false`          | `false`           | Stopped                  |

When the global toggle transitions `false` -> `true`, only features
with their own `enabled: true` resume. Individual feature `enabled`
flags are never modified by the global toggle.

### 8.6 Agent Session Archiving Model

```text
  Source                          Archive directory
  (read-only)                     (workspace-relative)
  +-----------------------+
  | .aider.chat.history.md|       docs/archive/agent-sessions/
  | ~/.claude/projects/   | --->  202602111319-aider-chat-history.md
  | globalStorage/cline/  |       202602110800-claude-code-abc123.jsonl
  | workspaceStorage/     |       202602111200-cline-task-xyz789.json
  |   chatSessions/       |       202602111430-copilot-chat-sess01.json
  | ~/.continue/sessions/ |       ...
  +-----------------------+

  lastArchivedMap: Map<archiveName, { mtime, archiveFileName }>
  (archiveFileName is YYYY/MM/YYYYMMDDHHmm-name.ext relative to archiveUri)
```

**Workspace filtering:** Each provider filters discovered sessions to
include only those belonging to the current workspace. Workspace-scoped
providers (Aider, Claude Code, Copilot Chat) use path-based discovery;
global-scoped providers (Cline, Roo Code, Continue) read session file
content and check if it references the workspace root path.

**Format-aware parsing (`ParseResult`):** Each session parser returns a
`ParseResult` discriminated union: `{ status: 'parsed', session: NormalizedSession }`
or `{ status: 'unrecognized', reason: string }`. When a parser cannot
interpret a file (unexpected format or schema), `ArchiveService` logs a
warning and falls back to copying the raw file instead of generating
markdown. The Copilot Chat parser detects and unwraps the VS Code
`{kind, v}` serialization envelope before accessing session fields: when
the parsed JSON contains a `v` property that is a non-null object, the
parser uses `v` as the session root; otherwise it uses the object
directly, preserving backward compatibility with the direct format.

**Empty session filtering:** After parsing, the archive service checks
whether all turns in the session have empty content, no tool calls, no
thinking, and no file references. If every turn is empty, the session
write is skipped and the skip is logged at `info` level. The session's
`mtime` is still recorded in `lastArchivedMap` (with an empty
`archiveFileName`) so the session is not reprocessed on subsequent
archive cycles.

**Codex parser multi-turn handling:** The Codex parser detects each
`user_message` event as a turn boundary. When a new user message arrives,
the parser emits the accumulated turn pair (user turn plus any assistant
content, tool calls, and reasoning accumulated so far) into a completed
turns list and resets the state before starting the new turn, so
multi-turn sessions produce distinct user and assistant turn pairs in
their original sequence.

**JSONL delta reconstruction (`copilotJsonlReconstructor.ts`):** GitHub
Copilot Chat stores newer sessions as append-only JSONL delta files. The
reconstructor processes three event kinds — `0` (init), `1` (set field),
`2` (append to field) — to produce a complete in-memory session object
before it is passed to the standard `copilotChatParser`.

**Copilot source deduplication:** `CopilotChatProvider` watches both
`.json` and `.jsonl` files under `chatSessions`. When both
representations exist for the same session ID, the provider deduplicates
them by `archiveName`, keeps the newest source by `mtime`, and prefers
`.jsonl` on equal mtimes. This prevents startup re-archive loops caused
by alternating between two source files that would otherwise map to the
same archive file.

**Replacement semantics (not accumulation):** Each source session has
exactly one archived file at any time. When the source's `mtime`
changes, the old archive file is deleted and a new one with an updated
timestamp prefix is created.

**Orphan archive retention:** Replacement only applies to session IDs
returned by the current provider scan. If a historical archive file no
longer has a corresponding source session in provider storage, Tangyr Workbench
retains the archive file instead of pruning it automatically. This keeps
the archive append-preserving for historical sessions even when the
source store has already dropped them.

**One-shot re-archive on startup:** On each extension startup,
`deduplicateAndHydrate` reads all archive files from disk and stores
`mtime: 0` for each one in `lastArchivedMap`. Because real source file
`mtime` values are always positive integers, the skip guard
(`entry?.mtime === session.mtime`) never triggers for any session
hydrated from disk — every session is re-processed on the first archive
cycle after startup. After that cycle completes, `lastArchivedMap` is
updated with the actual source `mtime` values, and subsequent cycles
resume normal mtime-based skip behavior. This design ensures that a
patched extension automatically re-archives previously affected sessions
on its first cycle without requiring any persistent flag or manual
intervention.

**Idempotent flat-layout migration sweep:** On every cold start and
after every `reconfigure` (any time `_needsDedup` is reset to `true`),
`deduplicateAndHydrate` runs `migrateFlatLayout` before scanning
year/month subdirectories. `migrateFlatLayout` reads the top-level
entries of `archiveUri`; for each file whose name matches
`^(\d{4})(0[1-9]|1[0-2])\d{6}-.+\.\w+$` (a flat-layout archive file
with a valid month), it extracts `YYYY` and `MM` from the first four
and next two characters of the filename, creates the target
`YYYY/MM/` subdirectory, and moves the file there (`copy` with
`overwrite: true` followed by `delete` of the source). A failed copy
is logged at `warn` level; the source file is left in place and the
migration continues with the next file. The sweep is idempotent: once
the tree is fully migrated, no files at the top level match the flat
pattern, so subsequent invocations are no-ops. After the sweep,
`deduplicateAndHydrate` re-reads the top-level entries before scanning
year/month subdirectories.

**Archive file naming:** `{YYYY}/{MM}/{YYYYMMDDHHmm}-{archiveName}{extension}`,
where the timestamp is derived from the session file's creation time
(`ctime`), not the modification time or the current time. `YYYY` and
`MM` are extracted as `timestamp.substring(0,4)` and
`timestamp.substring(4,6)` from the `generateTimestamp('YYYYMMDDHHmm',
...)` result. The `archiveFileName` stored in `lastArchivedMap` is the
full path relative to `archiveUri` (e.g.,
`2026/05/202605251830-foo.md`) so that delete and replace operations
resolve correctly via
`vscode.Uri.joinPath(archiveUri, entry.archiveFileName)`.

**Cycle observability:** `runArchiveCycle()` emits `debug`-level log
entries at cycle start and end. `archiveSession()` emits a `debug`-level
entry when it skips a session due to an unchanged `mtime`.

**Force re-archive:** `runArchiveCycle()` accepts an optional `force`
boolean parameter. When `true`, the `mtime` guard in `archiveSession()`
is bypassed, causing all sessions to be reprocessed regardless of their
cached `mtime`. The "Archive Now" command passes `force = true`; the
automatic timer and file-watcher callbacks use the default
`force = false`.

**`archivePath` validation:** The `archivePath` field of
`AgentSessionsArchivingConfig` is validated by `validateArchivePath()`
(`src/features/agentSessionsArchiving/archivePathValidation.ts`) at every
site that consumes it: `checkAndPromptGitignore` (Step 0),
`writeGitignoreEntry` (defense-in-depth), `runArchiveCycle` (entry
guard), and `moveArchive` (oldPath and newPath guards). The validator
rejects: empty or whitespace-only paths, leading or trailing whitespace,
strings exceeding 1024 characters, control characters (`\n`, `\r`,
`\0`, `\t`, etc.), leading `#` or `!` (which would alter `.gitignore`
interpretation), glob metacharacters (`*`, `?`, `[`, `]`), absolute
paths (Unix `/…` or Windows `C:\…`), and `..` path-traversal segments.
On validation failure, the calling method logs at `warn` level (or in
the case of `writeGitignoreEntry`, throws an error that the enclosing
`try/catch` in `checkAndPromptGitignore` translates to a warn log) and
skips the operation without performing any filesystem or `.gitignore`
mutation.

**Git-aware gitignore prompt:** When the archive feature transitions to
the running state (global enabled + feature enabled) or when
`archivePath` changes, the extension checks whether the workspace is a
git repository using `isGitRepository(workspaceRootUri.fsPath)`. If it
is a repository and `archivePath` is not already git-ignored, and no
previous decision exists for that path, the extension presents a VS
Code information message asking the user to add the path to
`.gitignore`. Accepting appends a two-line block to `.gitignore` — a
provenance comment `# Managed by Tangyr Workbench (agent sessions
archive)` followed by `{archivePath}/` and a trailing newline; a single
leading newline is inserted only when the existing file does not
already end with one. The file is created if absent. The provenance
comment makes the entry self-describing so a user reading the file
later understands its origin and does not remove it as an apparent
orphan (which would silently lose gitignore protection because the
stored `'ignored'` decision blocks the prompt from re-appearing for
that path). Declining (explicit click on the `Skip` button) stores
`'declined'` in the `gitignoreDecisions` field of
`AgentSessionsArchivingConfig`, keyed by `archivePath`, so the prompt
does not re-appear for that path. Dismissing the dialog without
choosing a button (X-close, ESC, focus loss — VS Code returns
`undefined`) is intentionally treated as "no decision yet": no entry
is written to `gitignoreDecisions`, and the prompt re-appears on the
next activation. This separation prevents an accidental dismissal from
silently binding the user to a sticky decline. A new `archivePath`
value produces a new key and triggers a fresh evaluation; an unchanged
path with a recorded decision is never re-prompted. A failed
`.gitignore` write is logged at `warn` level and the decision is not
stored, so the prompt re-appears on the next activation. The write is
a non-atomic read-modify-write — concurrent writes by other VS Code
extensions or external processes between the read and the write can
result in last-write-wins behavior on the `.gitignore` file. This is
accepted as best-effort; collision probability is low for typical
workflows. The duplicate-entry guard
(`existing.split('\n').some(line => line.trim() === entryLine)`)
prevents redundant appends on subsequent activations even after manual
edits. When `archivePath` changes (detected in
`AgentSessionArchiveService.reconfigure`), the prompt runs after the
archive directory has been moved to the new path and before the
archive service restarts with the new config. `reconfigure` is guarded
against re-entrancy: when the prompt's `updateConfig` callback (on
accept) writes the config and the section listener fires
`reconfigure` again on the same instance, the inner invocation
short-circuits at a `_reconfiguring` flag (set in the outer call's
try-block, reset in its finally-block). Only the outer call mutates
timer state and runs `start()`.

**Change detection:** When a session file's `mtime` changes, the old
archive file is deleted and a new one (with the same ctime-based prefix)
is created with updated content.

**Date cutoff filtering:** The optional `ignoreSessionsBefore` field
(format `YYYYMMDD`) sets a UTC date cutoff. Sessions whose creation time
(`ctime`) is before midnight UTC of that date are skipped during the
archive cycle. When omitted, all sessions are archived.

### 8.7 Command Guarding

Commands are registered in two modes:

- `registry.register(id, handler)` -- always available, used for basic
  file/directory utilities that should work regardless of toggle state.
- `registry.registerGuarded(id, handler)` -- checks
  `stateManager.isEnabled` before execution; shows a warning message
  if the extension is disabled for the workspace.

### 8.8 Logging

A singleton `Logger` wraps a VS Code `OutputChannel` with level-based
filtering:

| Level   | Includes                        |
| ------- | ------------------------------- |
| `off`   | Nothing                         |
| `error` | Errors                          |
| `warn`  | Errors, warnings                |
| `info`  | Errors, warnings, informational |
| `debug` | Everything                      |

The level is configurable via `tangyr.logLevel` (VS Code setting) and
updates reactively when the setting changes.

### 8.9 Testing Strategy

| Layer        | Framework             | Config                         | Scope                                                                                                              |
| ------------ | --------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Unit         | Vitest                | `vitest.config.ts`             | All modules in `src/` with mocked VS Code API. Coverage threshold: 80 %.                                           |
| Integration  | Vitest (no mocks)     | `vitest.integration.config.ts` | Post-build verification: bundle smoke tests, real tokenizer exercising, full metrics pipeline, asset verification. |
| VS Code Host | @vscode/test-electron | `.vscode-test.mjs`             | Extension activation and lifecycle in a real VS Code instance.                                                     |

**Unit tests** (`test/unit/`) mock the VS Code API via
`test/unit/mocks/vscode.ts`, which provides deterministic implementations
of `workspace.fs`, `Uri`, `window`, `commands`, `EventEmitter`,
`FileSystemWatcher`, and enum types (`StatusBarAlignment`, `FileType`).

**Vitest integration tests** (`test/integration/vitest/`) exercise real
modules with real dependencies — no mocks. They were introduced after a
production bug where the Claude tokenizer silently failed because
`@anthropic-ai/tokenizer` required a WASM binary that esbuild didn't
bundle, but unit test mocks completely hid the failure. These tests cover:

- **Bundle smoke** — verifies `dist/extension.js` structure (no WASM refs,
  CJS format, vscode externalized, claude BPE ranks inlined)
- **Bundle assets** — ensures the bundle is self-contained with no missing
  runtime dependencies (no `.wasm`, no `.node` addons, no `readFileSync`)
- **Tokenizer** — exercises all 3 tokenizer models (o200k, cl100k, claude)
  with the real `js-tiktoken` library and real BPE ranks
- **Metrics pipeline** — full text → metrics → formatter pipeline without
  mocks, verifying no em-dash fallback appears in formatted output
- **Text extraction** — selection joining with real gap separator logic

Coverage thresholds for integration tests are independently configured
at 60 % lines/functions/statements and 50 % branches (targeting
`src/features/textStats/`). The `pnpm run test:integration:vitest`
script builds the bundle first, then runs the tests.

### 8.10 Release Pipeline

```text
git push main
  |
  v
semantic-release
  +-- @semantic-release/commit-analyzer   (determine version bump)
  +-- @semantic-release/release-notes-generator
  +-- @semantic-release/changelog         (update CHANGELOG.md)
  +-- @semantic-release/npm               (update package.json, no npm publish)
  +-- @semantic-release/exec              (run scripts/update-version-code.mjs)
  +-- semantic-release-vsce               (package .vsix, publish to Marketplace)
  +-- @semantic-release/git               (commit package.json + CHANGELOG.md)
  +-- @semantic-release/github            (create GitHub release with .vsix)
```

Release rules: `feat:` -> minor, `fix:|perf:|refactor:` -> patch,
all others -> no release.

### 8.11 Code Quality Enforcement

| Tool       | Scope        | Key rules                                                                                                          |
| ---------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| TypeScript | Compilation  | `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`                                           |
| ESLint     | Source files | max 250 lines/file (warn), 50 lines/fn (warn), complexity <= 10, max nesting 3, max params 3, 1 class/file (error) |
| ESLint     | Test files   | Relaxed complexity; `any` allowed; vitest plugin rules                                                             |
| Prettier   | All files    | 90-char line width, 2-space indent, single quotes, trailing commas ES5                                             |
| commitlint | Commit msgs  | Conventional Commits format, lowercase subject                                                                     |
| Husky      | Pre-commit   | `eslint --fix` + `prettier --write` on staged files                                                                |

### 8.12 Text Stats Architecture

Text Stats displays real-time text statistics in a dedicated status bar
item. The feature follows the standard lifecycle pattern but adds
editor-event-driven updates with debouncing.

**Module decomposition:**

| Module             | Responsibility                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `index.ts`         | Feature registration, lifecycle wiring, state management (`FeatureState`).                |
| `updateHandler.ts` | Editor data extraction, file size computation, metric assembly, display update.           |
| `controller.ts`    | `TextStatsController`: debounced scheduling (300 ms), `TokenCounter` instance management. |
| `command.ts`       | Toggle command (show/hide status bar item), tokenizer quick-pick command.                 |
| `statusBarItem.ts` | Status bar item creation (left-aligned), display update, show/hide.                       |
| `formatter.ts`     | Formats `MetricsResult` into status bar text and rich markdown tooltip.                   |
| `textExtractor.ts` | Selection-aware text extraction: full document or boundary-preserving multi-selection.    |
| `gapSeparator.ts`  | Gap inference: determines minimal separator between non-contiguous selections.            |
| `constants.ts`     | Config key, command IDs, default values, `INTRODUCED_AT_VERSION_CODE`.                    |
| `metrics/`         | Seven metric functions: characters, words, lines, paragraphs, readingTime, size, tokens.  |

**Tokenizer lazy-loading:**

`TokenCounter` loads tokenizer vocabularies on first use, not at
activation time. Each model (`cl100k`, `o200k`, `claude`) is cached
independently. When the user changes tokenizer model via the quick-pick
command, the controller invalidates the cache and a new encoder is
loaded on the next update. Files exceeding `tokenSizeLimit` characters
skip token counting entirely.

**Debounce strategy:**

Editor events (active editor change, document change, selection change)
trigger `controller.scheduleUpdate()` which debounces with a 300 ms
delay. Only the last pending update executes. This prevents excessive
computation during rapid typing.

**Selection awareness:**

When one or more non-empty selections exist, all metrics are computed
on the joined selection text. Selections are sorted by document offset
and joined with context-aware separators inferred by `gapSeparator.ts`:
paragraph breaks (`\n\n`) for gaps containing double newlines, line
breaks (`\n`) for single newlines, spaces for other whitespace, or no
separator for adjacent/overlapping selections. Line count uses
`aggregateSelectionLines()` to avoid double-counting overlapping
selection ranges. File size switches from `vscode.workspace.fs.stat()`
to `Buffer.byteLength()` on the selection text.

**Bundled dependencies:**

`js-tiktoken` (OpenAI tokenizers) and `@anthropic-ai/tokenizer`
(Claude tokenizer) are dev dependencies bundled by esbuild into the
extension. The bundled vocabularies increase the extension size from
~72 KB to ~6 MB. No runtime network calls are made.

### 8.13 Legacy Config Verify on Startup

`verifyLegacyConfigMigration()` is a private method on `ExtensionStateManager` invoked at the end of `initialize()`, after the normal `readStateFromFile` / `runMigration` / `ensureCurrentConfigFile` / `showOnboardingNotification` flow. It is a defensive backstop that fires only when `.tangyr.jsonc` is still absent at the end of activation.

**Detection:** the method probes `.tangyr.jsonc` via `vscode.workspace.fs.stat`. If the file is present, the method returns immediately (no-op). If absent, it probes `.arit-toolkit.jsonc` by the same mechanism. If the legacy file is also absent, the method returns immediately (no-op).

**Path A — parseable legacy:** `readConfigFile(LEGACY_CONFIG_FILENAME)` succeeds. The parsed content is written to `.tangyr.jsonc` via `writeFullConfig`. The legacy file is renamed to `.arit-toolkit.jsonc.bak`. Internal state (`_fullConfig`, `_isInitialized`, `_isEnabled`, `_loadedLegacyConfigFile`) is updated and `_onDidChangeState` is fired. An information message is shown to the user.

**Path B — malformed legacy:** `readConfigFile(LEGACY_CONFIG_FILENAME)` throws (JSON/JSONC parse failure). `.tangyr.jsonc` is NOT created. The legacy file is renamed to `.arit-toolkit.jsonc.malformed.bak`. A warning message is shown to the user, prompting them to create `.tangyr.jsonc` via the onboarding prompt.

**Backup collision:** if the target `.bak` (or `.malformed.bak`) path already exists, `findAvailableBackupPath()` appends a UTC timestamp suffix `YYYYMMDDHHmm` before returning the path (e.g., `.arit-toolkit.jsonc.bak.202605271045`).

**Scope:** single-root workspaces only. Multi-root and no-workspace modes are skipped by the upstream guard in `initialize()` and by a `_workspaceRoot` null-check inside the method itself. The check fires once per activation — no file-watcher-based re-check is performed.

---

## 12 Glossary

| Term                      | Definition                                                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Archive cycle**         | A single pass of the `AgentSessionArchiveService` that queries all providers, detects mtime changes, and copies/replaces session files in the archive directory.                                                                                      |
| **Config migration**      | The process of detecting configuration sections missing from an older workspace config and prompting the user to add them with default values.                                                                                                        |
| **Config section**        | A top-level key in `.tangyr.jsonc` owned by a specific feature (e.g., `agentSessionsArchiving`).                                                                                                                                                      |
| **Feature**               | A self-contained module under `src/features/<name>/` that registers commands, UI elements, and/or background services.                                                                                                                                |
| **Global toggle**         | The top-level `enabled` boolean in `.tangyr.jsonc` that controls whether all background services are active.                                                                                                                                          |
| **Guarded command**       | A VS Code command that checks `stateManager.isEnabled` before executing and shows a warning if the extension is disabled.                                                                                                                             |
| **mtime**                 | File modification timestamp obtained via `vscode.workspace.fs.stat()`, used for change detection without reading file contents.                                                                                                                       |
| **Onboarding**            | The first-time notification shown when a user opens a single-root workspace that does not yet have `.tangyr.jsonc`.                                                                                                                                   |
| **Checkup**               | A comprehensive health check triggered via the "Checkup" tooltip button. Reads config, runs migration, preserves user customizations, and optionally commits the updated config file. Suspends auto-commit during execution to avoid race conditions. |
| **Session file**          | A file produced by an AI coding assistant that contains chat interaction history (not rules or configuration).                                                                                                                                        |
| **Session provider**      | An implementation of `SessionProvider` that discovers session files for a specific AI coding assistant.                                                                                                                                               |
| **Single-root workspace** | A VS Code workspace with exactly one root folder. Required for advanced features that persist state to disk.                                                                                                                                          |
| **Text Stats**            | A status bar feature that displays real-time text metrics (characters, tokens, words, lines, paragraphs, reading time, file size) for the active editor, with selection awareness and debounced updates.                                              |
| **Token counter**         | A lazy-loaded component in the Text Stats feature that counts tokens using a configurable tokenizer model (`cl100k`, `o200k`, or `claude`). Encoders are cached per model and invalidated on model change.                                            |
| **Tokenizer model**       | One of three supported token-counting schemes: `cl100k` (OpenAI cl100k_base), `o200k` (OpenAI o200k_base), or `claude` (Anthropic Claude). Selected via the `textStats.tokenizer` config or the quick-pick command.                                   |
| **Version code**          | A numeric encoding of a semantic version (`1XXXYYYZZZ`) used for fast comparison in the migration system.                                                                                                                                             |
| **Workspace config**      | The `.tangyr.jsonc` file at the workspace root, managed by `ExtensionStateManager`.                                                                                                                                                                   |
