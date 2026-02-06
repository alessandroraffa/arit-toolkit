# Contributing to ARIT Toolkit

Thank you for your interest in contributing to ARIT Toolkit! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

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
- VS Code 1.85.0+

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

```
arit-toolkit/
├── src/
│   ├── extension.ts              # Entry point
│   ├── types/
│   │   └── index.ts              # Shared TypeScript types
│   ├── core/                     # Core infrastructure
│   │   ├── index.ts              # Barrel export
│   │   ├── logger.ts             # Centralized logging
│   │   ├── configManager.ts      # Configuration handling
│   │   └── commandRegistry.ts    # Command registration
│   ├── features/                 # Feature modules
│   │   ├── index.ts              # Feature registration
│   │   └── timestampedFile/
│   │       ├── index.ts          # Feature barrel export
│   │       ├── command.ts        # Command handlers
│   │       ├── utils.ts          # Pure utility functions
│   │       └── constants.ts      # Command IDs and constants
│   └── utils/
│       └── index.ts              # Shared utilities
├── test/
│   ├── unit/                     # Unit tests (Vitest)
│   │   └── features/
│   │       └── timestampedFile/
│   │           └── utils.test.ts
│   └── integration/              # Integration tests (VS Code)
│       └── suite/
│           ├── index.ts
│           └── extension.test.ts
└── ...
```

## Adding a New Feature

1. Create a new directory under `src/features/`
2. Implement:
   - `constants.ts` - Command IDs and constants
   - `utils.ts` - Pure utility functions
   - `command.ts` - Command handler
   - `index.ts` - Feature registration
3. Register the feature in `src/features/index.ts`
4. Add command to `package.json` contributes
5. Add unit tests
6. Update documentation

## Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) with **enforced validation**. All commits must follow this format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Commit Types

| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | New feature | Minor (0.X.0) |
| `fix` | Bug fix | Patch (0.0.X) |
| `perf` | Performance improvement | Patch |
| `refactor` | Code refactoring | Patch |
| `docs` | Documentation only | No release |
| `style` | Code style (formatting) | No release |
| `test` | Adding/updating tests | No release |
| `build` | Build system changes | No release |
| `ci` | CI configuration | No release |
| `chore` | Maintenance tasks | No release |
| `revert` | Revert a commit | Depends |

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
2. CI runs tests
3. If tests pass, semantic-release analyzes commits
4. Version is bumped based on commit types
5. CHANGELOG.md is updated automatically
6. Extension is published to VS Code Marketplace
7. GitHub Release is created with .vsix artifact

**No manual version bumping or tagging required!**

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
