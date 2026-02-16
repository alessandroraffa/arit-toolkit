# ARIT Toolkit -- Technical Context Document

> **Scope.** This document follows the arc42 template (sections 1--4, 8, 12)
> and the principles of ISO/IEC/IEEE 42010:2022 for architecture description.
> It identifies stakeholders, concerns, and viewpoints relevant to
> understanding the system. It does not replace detailed artefacts such as
> Architecture Decision Records, data-model specs, or requirement
> specifications; instead it serves as the entry point for navigating the
> full body of documentation.

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| System             | ARIT Toolkit -- VS Code Extension                          |
| Repository         | <https://github.com/alessandroraffa/arit-toolkit>          |
| Identifier         | `alessandroraffa.arit-toolkit`                             |
| Current version    | 1.4.1 (versionCode `1001004001`)                           |
| Licence            | MIT                                                        |
| Architecture style | Feature-based modular architecture, dependency injection   |
| Runtime deps       | None (VS Code API only)                                    |
| Last updated       | 2025-07-22                                                 |

---

## 1  Introduction and Goals

### 1.1  Requirements Overview

ARIT Toolkit is a VS Code extension that bundles productivity utilities
for developers working inside a single-root workspace.  Its capabilities
fall into two categories:

| Category             | Capability                                            |
| -------------------- | ----------------------------------------------------- |
| File utilities       | Create or rename files/directories with UTC timestamp prefixes in configurable formats. |
| Background services  | Periodically archive chat session files produced by AI coding assistants (Aider, Claude Code, Cline, Roo Code, GitHub Copilot Chat, Continue). |

The extension is workspace-aware: a JSONC configuration file
(`.arit-toolkit.jsonc`) at the workspace root stores the enabled state,
the extension version, and per-feature settings.  A version-aware
config-migration system ensures that users upgrading from older versions
are prompted to opt in to new configuration sections.

### 1.2  Quality Goals

| Priority | Quality attribute      | Concrete goal                                                                 |
| -------- | ---------------------- | ----------------------------------------------------------------------------- |
| 1        | Maintainability        | Strict ESLint complexity limits (max 250 lines/file, 50 lines/fn, cyclomatic complexity <= 10, max nesting 3, max params 3). Feature-per-folder isolation. |
| 2        | Reliability            | >= 80 % unit-test coverage (lines, functions, branches, statements). Strict TypeScript (`noImplicitAny`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`). |
| 3        | Extensibility          | New features register through `FeatureRegistrationContext` without touching core modules. Config sections self-register via `ConfigSectionRegistry`. |
| 4        | Security               | Zero runtime dependencies. No credential handling. No network calls. |
| 5        | Developer experience   | One-click enable/disable via status bar. Rich markdown tooltip. Conventional commits + automated semantic-release pipeline. |

### 1.3  Stakeholders

| Stakeholder          | Concern                                                    |
| -------------------- | ---------------------------------------------------------- |
| Extension users      | Stable, non-intrusive behaviour; clear onboarding; easy enable/disable; predictable timestamp formats. |
| Extension maintainer | Small surface area; automated releases; enforceable code-quality gates; low coupling between features. |
| Contributors         | Fast feedback loop (`vitest`); clear module boundaries; well-documented patterns; conventional commit discipline. |
| VS Code Marketplace  | Activation performance; no runtime deps; well-scoped permissions. |

---

## 2  Constraints

### 2.1  Technical Constraints

| Constraint                 | Detail                                                                          |
| -------------------------- | ------------------------------------------------------------------------------- |
| VS Code API surface        | The extension runs inside the VS Code extension host. All file I/O goes through `vscode.workspace.fs`; UI through `vscode.window`; commands through `vscode.commands`. |
| Single-root workspace only | Advanced features (state toggle, config migration, agent-session archiving) require a single workspace root. Multi-root and no-workspace modes degrade gracefully. |
| Node.js >= 22.22.0         | Required by `package.json` `engines` field.                                      |
| VS Code >= 1.109.0         | Minimum host version; determines available API surface.                          |
| CommonJS bundle            | VS Code extension host requires CJS. The project is authored in ESM-style TypeScript and bundled by esbuild into a single `dist/extension.js`. |
| Zero runtime dependencies  | All functionality is implemented against Node.js built-ins and the VS Code API. |

### 2.2  Organisational Constraints

| Constraint                     | Detail                                                                  |
| ------------------------------ | ----------------------------------------------------------------------- |
| Conventional Commits           | Enforced by commitlint + Husky pre-commit hook. Required for semantic-release. |
| pnpm as package manager        | Enforced by a `preinstall` script guard.                                 |
| Automated release pipeline     | semantic-release on `main` branch: version bump, changelog generation, `.vsix` packaging, Marketplace publish, GitHub release. |

### 2.3  Conventions

| Convention                    | Detail                                                                   |
| ----------------------------- | ------------------------------------------------------------------------ |
| Feature isolation             | Each feature lives under `src/features/<name>/` and exposes a single `register*Feature()` entry point. Features depend on Core and Utils, never on each other. |
| Config section self-registration | Features that add workspace-config sections register a `ConfigSectionDefinition` so the migration system can detect missing sections and offer them to users on every activation. |
| UTC timestamps                | All generated timestamps use UTC (`getUTCFullYear()`, etc.).              |
| Disposable pattern            | Every VS Code resource (watchers, event emitters, commands) is tracked via `context.subscriptions` for deterministic cleanup. |

---

## 3  Context and Scope

### 3.1  Business Context

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
                           |    ARIT Toolkit       |
                           |    Extension          |
                           +-----------+-----------+
                                       |
              +-----------+------------+-----------+-----------+
              |           |            |           |           |
              v           v            v           v           v
        Timestamped  Timestamped  Status Bar  Agent Session  Config
        File         Directory    Toggle      Archiving      Migration
        Feature      Feature      Feature     Feature        System
```

| External actor           | Interaction                                                         |
| ------------------------ | ------------------------------------------------------------------- |
| VS Code user             | Invokes commands (palette, context menu, keyboard shortcut), toggles extension via status bar, edits `.arit-toolkit.jsonc` manually. |
| `.arit-toolkit.jsonc`    | Persists workspace state (enabled flag, version, feature configs). Watched by `FileSystemWatcher` for external edits. |
| VS Code settings         | `arit.timestampFormat`, `arit.timestampSeparator`, `arit.logLevel` -- read via `ConfigManager`. |
| AI agent session files   | Read-only sources: `.aider.chat.history.md`, `~/.claude/projects/`, VS Code globalStorage/workspaceStorage directories. Only sessions belonging to the current workspace are copied to the archive path. |
| VS Code Marketplace      | Publish target for `.vsix` packages via semantic-release pipeline.   |

### 3.2  Technical Context

```text
+------------------------------------------------------------------+
|  VS Code Extension Host (Node.js >= 22.22.0)                    |
|                                                                  |
|  +--------------------------+   +-----------------------------+  |
|  |  Core                    |   |  Utils                      |  |
|  |  - Logger                |   |  - timestamp.ts             |  |
|  |  - ConfigManager         |   |  - jsonc.ts                 |  |
|  |  - CommandRegistry       |   |  - version.ts               |  |
|  |  - ExtensionStateManager |   +-----------------------------+  |
|  |  - ConfigMigration/      |                                    |
|  |    - Registry            |   +-----------------------------+  |
|  |    - MigrationService    |   |  Types                      |  |
|  +--------------------------+   |  - TimestampFormat           |  |
|              ^                  |  - LogLevel                  |  |
|              |  depends on      |  - WorkspaceMode             |  |
|              |                  |  - WorkspaceConfig           |  |
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
|  |  +------------------+ +-------------------+              |    |
|  +----------------------------------------------------------+    |
|                                                                  |
+------------------------------------------------------------------+
         |                   |                    |
         v                   v                    v
   .arit-toolkit.jsonc    workspace FS     global FS / VS Code
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

| Channel                        | Protocol / API                          | Direction |
| ------------------------------ | --------------------------------------- | --------- |
| Workspace filesystem           | `vscode.workspace.fs` (read/write/stat/copy/delete/readDirectory) | R/W |
| VS Code settings               | `vscode.workspace.getConfiguration()`   | Read      |
| VS Code commands               | `vscode.commands.registerCommand()`     | Register  |
| VS Code UI                     | `vscode.window.*` (status bar, input box, messages) | Write |
| Global filesystem              | `vscode.workspace.fs` via `vscode.Uri.file()` for `~/.claude/`, `~/.continue/`, globalStorage, workspaceStorage | Read |
| VS Code Output Channel         | `vscode.window.createOutputChannel()`   | Write     |

---

## 4  Solution Strategy

### 4.1  Technology Decisions

| Decision                       | Rationale                                                          |
| ------------------------------ | ------------------------------------------------------------------ |
| TypeScript (strict mode)       | Catches errors at compile time; enables IDE tooling; enforced by ESLint rules. |
| esbuild for bundling           | Sub-second builds; single-file output (`dist/extension.js`); tree-shaking. |
| Vitest for unit testing        | ESM-native; fast; compatible with VS Code mock pattern; V8 coverage provider. |
| JSONC for workspace config     | Human-readable; allows inline comments; familiar to VS Code users. |
| semantic-release               | Fully automated: version bump, changelog, `.vsix` package, Marketplace publish, GitHub release. |
| Zero runtime dependencies      | Minimises attack surface, install size, and compatibility risk.     |

### 4.2  Architectural Approach

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

### 4.3  Key Design Decisions

| # | Decision | Context | Consequences |
|---|----------|---------|--------------|
| 1 | Single-root workspace requirement for stateful features | Multi-root workspaces have no single root to place `.arit-toolkit.jsonc`. | Multi-root mode degrades gracefully: basic commands available, toggle and archiving disabled. Status bar shows warning. |
| 2 | Global toggle + per-feature toggles | Users need coarse-grained and fine-grained control over background services. | `enabled: false` at root level stops all background activity. Each feature's `enabled` is preserved and resumes independently when global toggle returns to `true`. |
| 3 | Presence-based config migration | Adding new config sections should not break existing users. | On activation, `ConfigMigrationService` detects sections whose keys are absent from the workspace config and prompts users individually. Declined sections are re-prompted on the next activation (only when the extension is globally enabled). |
| 4 | mtime-based change detection for archiving | Reading and hashing large session files is expensive. | `vscode.workspace.fs.stat()` is fast and sufficient. Each source session maps to exactly one archived file (latest version), replaced on mtime change. |
| 5 | Session Provider abstraction | AI agent tools store sessions in different locations and formats. | `SessionProvider` interface allows adding new agents without modifying the archive service. Each provider encapsulates discovery logic (workspace, global path, VS Code storage) and workspace filtering (only sessions belonging to the current workspace are archived). |

### 4.4  Activation and Initialisation Sequence

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
  |     |     +-- register arit.toggleEnabled command
  |     |     +-- register arit.reinitialize command
  |     +-- registerTimestampedFileFeature(registry, config, logger)
  |     +-- registerTimestampedDirectoryFeature(registry, config, logger)
  |     +-- registerAgentSessionsArchivingFeature(ctx)
  |           |
  |           +-- migrationRegistry.register(agentSessionsArchiving section)
  |           +-- getDefaultProviders(context)
  |           +-- new AgentSessionArchiveService(...)
  |           +-- registry.register(toggleCommand)
  |           +-- subscribe to onDidChangeState
  |           +-- subscribe to onConfigSectionChanged
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

stateManager.reinitialize()  [async, triggered by "Run Setup" button]
  |
  +-- readStateFromFile()
  +-- if initialised:
  |     +-- fire onDidChangeState
  |     +-- runMigration()  (unconditionally — user explicitly requested)
  +-- if not initialised:
        +-- showOnboardingNotification()
```

---

## 8  Cross-cutting Concepts

### 8.1  Workspace State Persistence

The `.arit-toolkit.jsonc` file is the single source of truth for
workspace-level state:

```jsonc
// ARIT Toolkit workspace configuration
// Managed by the ARIT Toolkit extension
{
  "enabled": true,
  "version": "1.4.0",
  "versionCode": 1001004000,
  "agentSessionsArchiving": {
    "enabled": true,
    "archivePath": "docs/archive/agent-sessions",
    "intervalMinutes": 5
  }
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

### 8.2  Config Migration

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

### 8.3  Version Code Encoding

Semantic versions are encoded as numeric codes for fast comparison:

```text
1XXXYYYZZZ = 1_000_000_000 + major * 1_000_000 + minor * 1_000 + patch
```

Examples: `1.0.0` -> `1001000000`, `1.3.0` -> `1001003000`.

Each segment (major, minor, patch) supports values 0--999.

### 8.4  Event-driven Feature Coordination

Features coordinate through events, not direct calls:

| Event                          | Emitter                | Consumers                        |
| ------------------------------ | ---------------------- | -------------------------------- |
| `onDidChangeState(boolean)`    | `ExtensionStateManager`| Status bar, Agent archiving      |
| `onConfigSectionChanged(key)`  | `ExtensionStateManager`| Agent archiving (reconfigure)    |
| `onConfigChange()`             | `ConfigManager`        | Logger (update log level)        |

This ensures features remain decoupled: they react to state changes
rather than calling each other.

### 8.5  Global Toggle Semantics

The two-level toggle system works as follows:

| Global `enabled` | Feature `enabled` | Background service state |
| ----------------- | ------------------ | ------------------------ |
| `true`            | `true`             | Running                  |
| `true`            | `false`            | Stopped                  |
| `false`           | `true`             | Stopped (paused)         |
| `false`           | `false`            | Stopped                  |

When the global toggle transitions `false` -> `true`, only features
with their own `enabled: true` resume. Individual feature `enabled`
flags are never modified by the global toggle.

### 8.6  Agent Session Archiving Model

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
```

**Workspace filtering:** Each provider filters discovered sessions to
include only those belonging to the current workspace. Workspace-scoped
providers (Aider, Claude Code, Copilot Chat) use path-based discovery;
global-scoped providers (Cline, Roo Code, Continue) read session file
content and check if it references the workspace root path.

**Replacement semantics (not accumulation):** Each source session has
exactly one archived file at any time. When the source's `mtime`
changes, the old archive file is deleted and a new one with an updated
timestamp prefix is created.

**Archive file naming:** `{YYYYMMDDHHmm}-{archiveName}{extension}`,
where the timestamp is derived from the session file's last modification
time (`mtime`), not the current time.

### 8.7  Command Guarding

Commands are registered in two modes:

- `registry.register(id, handler)` -- always available, used for basic
  file/directory utilities that should work regardless of toggle state.
- `registry.registerGuarded(id, handler)` -- checks
  `stateManager.isEnabled` before execution; shows a warning message
  if the extension is disabled for the workspace.

### 8.8  Logging

A singleton `Logger` wraps a VS Code `OutputChannel` with level-based
filtering:

| Level   | Includes                          |
| ------- | --------------------------------- |
| `off`   | Nothing                           |
| `error` | Errors                            |
| `warn`  | Errors, warnings                  |
| `info`  | Errors, warnings, informational   |
| `debug` | Everything                        |

The level is configurable via `arit.logLevel` (VS Code setting) and
updates reactively when the setting changes.

### 8.9  Testing Strategy

| Layer       | Framework  | Scope                                                   |
| ----------- | ---------- | ------------------------------------------------------- |
| Unit        | Vitest     | All modules in `src/` with mocked VS Code API. Coverage threshold: 80 %. |
| Integration | @vscode/test-electron | Extension activation and lifecycle in a real VS Code instance. |

The VS Code API mock (`test/unit/mocks/vscode.ts`) provides
deterministic implementations of `workspace.fs`, `Uri`, `window`,
`commands`, `EventEmitter`, `FileSystemWatcher`, and enum types
(`StatusBarAlignment`, `FileType`).

### 8.10  Release Pipeline

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

### 8.11  Code Quality Enforcement

| Tool         | Scope          | Key rules                                               |
| ------------ | -------------- | ------------------------------------------------------- |
| TypeScript   | Compilation    | `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| ESLint       | Source files   | max 250 lines/file (warn), 50 lines/fn (warn), complexity <= 10, max nesting 3, max params 3, 1 class/file (error) |
| ESLint       | Test files     | Relaxed complexity; `any` allowed; vitest plugin rules   |
| Prettier     | All files      | 90-char line width, 2-space indent, single quotes, trailing commas ES5 |
| commitlint   | Commit msgs    | Conventional Commits format, lowercase subject           |
| Husky        | Pre-commit     | `eslint --fix` + `prettier --write` on staged files      |

---

## 12  Glossary

| Term                    | Definition                                                                     |
| ----------------------- | ------------------------------------------------------------------------------ |
| **Archive cycle**       | A single pass of the `AgentSessionArchiveService` that queries all providers, detects mtime changes, and copies/replaces session files in the archive directory. |
| **Config migration**    | The process of detecting configuration sections missing from an older workspace config and prompting the user to add them with default values. |
| **Config section**      | A top-level key in `.arit-toolkit.jsonc` owned by a specific feature (e.g., `agentSessionsArchiving`). |
| **Feature**             | A self-contained module under `src/features/<name>/` that registers commands, UI elements, and/or background services. |
| **Global toggle**       | The top-level `enabled` boolean in `.arit-toolkit.jsonc` that controls whether all background services are active. |
| **Guarded command**     | A VS Code command that checks `stateManager.isEnabled` before executing and shows a warning if the extension is disabled. |
| **mtime**               | File modification timestamp obtained via `vscode.workspace.fs.stat()`, used for change detection without reading file contents. |
| **Onboarding**          | The first-time notification shown when a user opens a single-root workspace that does not yet have `.arit-toolkit.jsonc`. |
| **Reinitialize**        | A manual re-trigger of the initialization flow (config read, state fire, migration) via the "Run Setup" tooltip button, without reloading VS Code. Runs migration unconditionally regardless of enabled state. |
| **Session file**        | A file produced by an AI coding assistant that contains chat interaction history (not rules or configuration). |
| **Session provider**    | An implementation of `SessionProvider` that discovers session files for a specific AI coding assistant. |
| **Single-root workspace** | A VS Code workspace with exactly one root folder. Required for advanced features that persist state to disk. |
| **Version code**        | A numeric encoding of a semantic version (`1XXXYYYZZZ`) used for fast comparison in the migration system. |
| **Workspace config**    | The `.arit-toolkit.jsonc` file at the workspace root, managed by `ExtensionStateManager`. |
