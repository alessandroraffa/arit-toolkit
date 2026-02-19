# Contributing to ARIT Toolkit

Thank you for your interest in contributing to ARIT Toolkit! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

To report a security vulnerability, please see [SECURITY.md](SECURITY.md) for responsible disclosure guidelines. **Do not** open a public issue for security vulnerabilities.

## How to Contribute

### Reporting Bugs

1. Check existing [issues](https://github.com/alessandroraffa/arit-toolkit/issues) to avoid duplicates
2. Use the bug report template
3. Include:
   - Clear description of the issue
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, VS Code version, extension version)

### Suggesting Features

1. Check existing [issues](https://github.com/alessandroraffa/arit-toolkit/issues) for similar suggestions
2. Use the feature request template
3. Describe the use case and expected behavior

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting:

   ```bash
   pnpm run lint
   pnpm run test
   ```

5. Commit using [conventional commits](https://www.conventionalcommits.org/):

   ```bash
   git commit -m "feat: add amazing feature"
   ```

6. Push to your fork
7. Open a Pull Request

## Development Setup

### Prerequisites

- Node.js 22+
- pnpm 10+ (install via `corepack enable pnpm`)
- VS Code 1.109.0+

### Getting Started

```bash
# Clone the repository
git clone https://github.com/alessandroraffa/arit-toolkit.git
cd arit-toolkit

# Install dependencies
pnpm install

# Build the extension
pnpm run compile

# Run tests
pnpm run test:unit
```

> **Tip:** A [Dev Container](.devcontainer/devcontainer.json) configuration is provided. Open the project in VS Code and select "Reopen in Container" to get a pre-configured environment with the correct Node.js version, pnpm, and all recommended extensions.

### Development Workflow

```bash
# Watch mode for development
pnpm run watch

# Run linting
pnpm run lint

# Fix linting issues
pnpm run lint:fix

# Format code
pnpm run format

# Run unit tests
pnpm run test:unit

# Run unit tests with coverage
pnpm run test:unit:coverage

# Run integration tests
pnpm run test:integration
```

### Testing in VS Code

1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. Test your changes in the new VS Code window

## Project Structure

```text
arit-toolkit/
├── .devcontainer/
│   └── devcontainer.json         # Dev Container configuration
├── .github/
│   ├── ISSUE_TEMPLATE/           # Bug report / feature request templates
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── dependabot.yml            # Automated dependency updates
│   └── workflows/
│       ├── ci.yml                # CI pipeline (lint, typecheck, audit, test, build)
│       └── release.yml           # Automated release via semantic-release
├── src/
│   ├── extension.ts              # Entry point
│   ├── types/
│   │   └── index.ts              # Shared TypeScript types
│   ├── core/                     # Core infrastructure
│   │   ├── index.ts              # Barrel export
│   │   ├── logger.ts             # Centralized logging
│   │   ├── configManager.ts      # Configuration handling
│   │   ├── commandRegistry.ts    # Command registration (guarded/unguarded)
│   │   ├── extensionStateManager.ts  # Workspace state persistence
│   │   ├── git.ts                # Git utilities (gitignore, staging, commit)
│   │   ├── configAutoCommit.ts   # Config auto-commit service
│   │   └── configMigration/      # Version-aware config migration
│   │       ├── index.ts
│   │       ├── migrationService.ts
│   │       ├── registry.ts
│   │       └── types.ts
│   ├── features/                 # Feature modules (one directory per feature)
│   │   ├── index.ts              # Feature registration orchestrator
│   │   ├── timestampedFile/      # Timestamped file creation/renaming
│   │   │   ├── command.ts
│   │   │   ├── constants.ts
│   │   │   └── index.ts
│   │   ├── timestampedDirectory/ # Timestamped directory creation/renaming
│   │   │   ├── command.ts
│   │   │   ├── constants.ts
│   │   │   └── index.ts
│   │   ├── statusBarToggle/      # Status bar toggle with workspace state
│   │   │   ├── command.ts
│   │   │   ├── constants.ts
│   │   │   ├── index.ts
│   │   │   └── statusBarItem.ts  # Status bar UI management
│   │   └── agentSessionsArchiving/  # AI agent session archiving
│   │       ├── index.ts             # Feature registration
│   │       ├── archiveService.ts    # Core archive loop (ctime naming, mtime sync)
│   │       ├── constants.ts
│   │       ├── types.ts             # SessionProvider / SessionFile interfaces
│   │       ├── markdown/            # Markdown conversion
│   │       │   ├── index.ts
│   │       │   ├── types.ts
│   │       │   ├── renderer.ts
│   │       │   └── parsers/         # One parser per session format
│   │       │       ├── index.ts
│   │       │       ├── claudeCodeParser.ts
│   │       │       ├── clineRooCodeParser.ts
│   │       │       ├── continueParser.ts
│   │       │       └── copilotChatParser.ts
│   │       └── providers/           # One provider per AI assistant
│   │           ├── index.ts         # Barrel export
│   │           ├── providerUtils.ts # Shared provider utilities
│   │           ├── aiderProvider.ts
│   │           ├── claudeCodeProvider.ts
│   │           ├── clineProvider.ts
│   │           ├── continueProvider.ts
│   │           ├── copilotChatProvider.ts
│   │           └── rooCodeProvider.ts
│   └── utils/
│       ├── index.ts              # Barrel export
│       ├── jsonc.ts              # JSONC parser/formatter
│       ├── timestamp.ts          # UTC timestamp generation
│       └── version.ts            # Version code encoding/decoding
├── test/
│   ├── unit/                     # Unit tests (Vitest, mirrors src/ structure)
│   │   ├── setup.ts              # Vitest setup (mocks vscode module)
│   │   ├── mocks/vscode.ts       # Complete VS Code API mock
│   │   ├── core/                 # Core module tests
│   │   ├── features/             # Feature tests (one file per concern)
│   │   └── utils/                # Utility tests
│   └── integration/              # Integration tests (VS Code Extension Host)
│       └── suite/
│           ├── index.ts
│           └── extension.test.ts
├── .editorconfig                 # Cross-editor formatting rules
├── .markdownlint.jsonc           # Markdown linting rules
├── .markdownlint-cli2.jsonc      # markdownlint-cli2 configuration
├── .markdownlintignore           # Markdown lint ignore patterns
├── .prettierrc                   # Prettier configuration
├── .releaserc.json               # semantic-release configuration
├── commitlint.config.mjs         # Commit message validation
├── esbuild.mjs                   # esbuild bundler configuration
├── eslint.config.mjs             # ESLint flat config
├── tsconfig.json                 # TypeScript configuration
├── vitest.config.ts              # Vitest test runner configuration
└── package.json
```

## Adding a New Feature

1. Create a new directory under `src/features/<featureName>/`
2. Implement:
   - `constants.ts` - Command IDs and constants
   - `utils.ts` - Pure utility functions
   - `command.ts` - Command handler factories
   - `index.ts` - Feature registration via `FeatureRegistrationContext`
3. Write unit tests first (TDD) in `test/unit/features/<featureName>/`
4. Extend VS Code mock in `test/unit/mocks/vscode.ts` if using new VS Code APIs
5. Register the feature in `src/features/index.ts`
6. Add command to `package.json` contributes (commands, menus, keybindings)
7. Update `README.md` documentation
8. Run full verification: `pnpm run check-types && pnpm run lint && pnpm run test:unit:coverage && pnpm run compile`

## Code Quality

This project enforces strict code quality rules via ESLint. Both source files (`src/`) and test files (`test/`) are linted.

### Source file limits

| Rule                     | Limit | Purpose                             |
| ------------------------ | ----- | ----------------------------------- |
| `max-lines`              | 250   | Keep files small and focused        |
| `max-lines-per-function` | 50    | Keep functions single-purpose       |
| `complexity`             | 10    | Limit cyclomatic complexity         |
| `max-depth`              | 3     | Avoid deep nesting                  |
| `max-nested-callbacks`   | 3     | Flat callback structure             |
| `max-params`             | 3     | Use context objects for more params |
| `max-statements`         | 15    | Concise function bodies             |
| `max-classes-per-file`   | 1     | One class per file                  |

When approaching these limits, extract helper functions, use early returns, or split into smaller modules.

### Test file rules

Test files are linted with [`@vitest/eslint-plugin`](https://github.com/vitest-dev/eslint-plugin-vitest) recommended rules. Key rules:

- Every `it`/`test` block must contain at least one `expect` assertion
- No focused tests (`.only`) or disabled tests (`.skip`) left in code
- No duplicate test titles

Complexity rules are relaxed for test files (see `eslint.config.mjs` for details).

### Running the linter

```bash
# Lint source and test files
pnpm run lint

# Lint with auto-fix
pnpm run lint:fix
```

## Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) with **enforced validation**. All commits must follow this format:

```text
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Commit Types

| Type       | Description             | Version Bump  |
| ---------- | ----------------------- | ------------- |
| `feat`     | New feature             | Minor (0.X.0) |
| `fix`      | Bug fix                 | Patch (0.0.X) |
| `perf`     | Performance improvement | Patch         |
| `refactor` | Code refactoring        | Patch         |
| `docs`     | Documentation only      | No release    |
| `style`    | Code style (formatting) | No release    |
| `test`     | Adding/updating tests   | No release    |
| `build`    | Build system changes    | No release    |
| `ci`       | CI configuration        | No release    |
| `chore`    | Maintenance tasks       | No release    |
| `revert`   | Revert a commit         | Depends       |

### Examples

```bash
# Feature (triggers minor release)
git commit -m "feat: add timestamp prefix to existing files"

# Bug fix (triggers patch release)
git commit -m "fix: correct timestamp format for ISO mode"

# With scope
git commit -m "feat(timestamp): add custom date support"

# Breaking change (triggers major release)
git commit -m "feat!: change default timestamp format"
# or
git commit -m "feat: change API

BREAKING CHANGE: timestamp format options renamed"
```

### Validation

Commits are validated automatically via commitlint. Invalid commits will be rejected.

## Automated Releases

This project uses [semantic-release](https://semantic-release.gitbook.io/) for automated versioning and publishing:

1. Push to `main` branch
2. CI runs lint, type check, security audit, and tests
3. If all checks pass, semantic-release analyzes commits
4. Version is bumped based on commit types
5. CHANGELOG.md is updated automatically
6. Extension is published to VS Code Marketplace
7. GitHub Release is created with .vsix artifact

**No manual version bumping or tagging required!**

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
