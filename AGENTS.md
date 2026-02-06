# AGENTS.md

> Instructions for AI coding agents working on this project.
> See [CONTRIBUTING.md](CONTRIBUTING.md) for human contributor guidelines.

## Project overview

**ARIT Toolkit** is an open-source VS Code extension providing productivity utilities (timestamped files, workspace toggle, and more). Built with TypeScript 5.7, esbuild, Vitest, and strict linting. No runtime dependencies — VS Code API only.

## Tech stack

- **Runtime:** VS Code Extension Host (VS Code ^1.85.0)
- **Language:** TypeScript 5.7 (strict mode, `noUncheckedIndexedAccess: true`)
- **Bundler:** esbuild (CJS output to `dist/`)
- **Unit tests:** Vitest 2.1 with v8 coverage (80% threshold)
- **Integration tests:** @vscode/test-cli + Mocha (TDD)
- **Linting:** ESLint 9 + typescript-eslint 8 (strict + stylistic type-checked)
- **Formatting:** Prettier 3.4 (90 chars, single quotes, trailing commas)
- **Package manager:** pnpm 10 (enforced via preinstall script)
- **Node.js:** >= 22.22.0 (enforced via `.nvmrc`, `.node-version`, preinstall check)
- **Git hooks:** Husky 9 (pre-commit: lint-staged, commit-msg: commitlint)
- **Releases:** semantic-release on `main` branch push

## Setup

```bash
nvm use 22.22          # required — build scripts fail on older versions
pnpm install           # only pnpm is allowed (preinstall enforces it)
```

## Commands

### Full project

| Command | Purpose |
|---------|---------|
| `pnpm run compile` | Type-check + build |
| `pnpm run lint` | Lint `src/` |
| `pnpm run lint:fix` | Lint with auto-fix |
| `pnpm run format` | Format `src/` and `test/` |
| `pnpm run test:unit` | Run all unit tests |
| `pnpm run test:unit:coverage` | Unit tests + coverage report |
| `pnpm run test:integration` | VS Code integration tests |
| `pnpm run check-types` | TypeScript type-check only |
| `pnpm run package` | Production build (minified) |

### File-scoped (prefer these for speed)

```bash
# Type-check the whole project (no per-file option)
pnpm run check-types

# Lint a single file
pnpm exec eslint src/path/to/file.ts --fix

# Format a single file
pnpm exec prettier --write src/path/to/file.ts

# Run a single test file
pnpm exec vitest run test/unit/path/to/file.test.ts

# Run tests matching a pattern
pnpm exec vitest run -t "pattern"
```

## Project structure

```
src/
├── extension.ts                    # activate() / deactivate() entry point
├── types/index.ts                  # Shared types (TimestampFormat, WorkspaceMode, etc.)
├── core/                           # Infrastructure (Logger, ConfigManager, CommandRegistry, ExtensionStateManager)
├── features/                       # Feature modules (one directory per feature)
│   ├── index.ts                    # registerAllFeatures() orchestrator
│   ├── timestampedFile/            # Feature: timestamped file creation/renaming
│   └── statusBarToggle/            # Feature: status bar toggle with workspace state
└── utils/                          # Pure utilities (JSONC parser, etc.)

test/
├── unit/                           # Vitest unit tests (mirror src/ structure)
│   ├── setup.ts                    # Vitest setup (mocks vscode module)
│   └── mocks/vscode.ts            # Complete VS Code API mock
└── integration/                    # VS Code integration tests (Mocha TDD)
```

## Architecture — domain-driven design

This project follows DDD principles adapted for a VS Code extension:

### Bounded contexts

- **Core** (`src/core/`): Infrastructure services shared across features — Logger, ConfigManager, CommandRegistry, ExtensionStateManager. These are stable, rarely change, and have no feature-specific logic.
- **Features** (`src/features/<name>/`): Each feature is a self-contained bounded context with its own constants, commands, and UI logic. Features depend on Core but never on each other.
- **Utils** (`src/utils/`): Pure functions with zero dependencies on VS Code API or Core. Fully testable in isolation.

### Feature module structure

Every feature follows this pattern:

```
src/features/<featureName>/
├── constants.ts      # Command IDs, feature name, codicon names
├── command.ts        # Command handler factories (pure functions returning async handlers)
├── index.ts          # registerXxxFeature() + barrel exports
└── [optional].ts     # Feature-specific utilities (statusBarItem.ts, utils.ts, etc.)
```

### Registration pattern

Features register themselves via a `registerXxxFeature()` function called from `src/features/index.ts`:

```typescript
// src/features/myFeature/index.ts
export function registerMyFeature(
  registry: CommandRegistry,
  config: ConfigManager,
  logger: Logger
): void {
  registry.register(COMMAND_ID, myCommand(config, logger));
  logger.debug(`Registered command: ${COMMAND_ID}`);
}
```

**Two registration modes:**

- `registry.register()` — Unguarded. Command always executes. Used for timestamp features.
- `registry.registerGuarded()` — Guarded by `ExtensionStateManager.isEnabled`. Shows warning if disabled. Used for future advanced features.

### Workspace modes

| Mode | Detection | Toggle | Status bar |
|------|-----------|--------|------------|
| Single-root | `workspaceFolders?.length === 1` | Full (`.arit-toolkit.jsonc`) | Active, clickable |
| Multi-root | `workspaceFolders?.length > 1` | No | Dimmed, info message on click |
| No workspace | `undefined` or `length === 0` | No | Dimmed, info message on click |

## Test-driven development (TDD)

### Red-green-refactor cycle

1. **Red** — Write a failing test first. Test file path mirrors source: `src/core/logger.ts` → `test/unit/core/logger.test.ts`
2. **Green** — Write the minimum code to make the test pass.
3. **Refactor** — Clean up while keeping tests green.

### Testing conventions

- **Unit tests** use Vitest with the VS Code mock at `test/unit/mocks/vscode.ts`. Every VS Code API used in source code must be mocked here.
- **Test structure:** `describe` → `it`/`test` blocks. Use `beforeEach` with `vi.clearAllMocks()`.
- **Coverage thresholds** (enforced): 80% lines, functions, branches, statements. Excluded: `extension.ts`, `*.d.ts`, `**/index.ts`.
- **Integration tests** run inside a real VS Code Extension Host. Use Mocha TDD interface with `suite`/`test`.

### Adding tests for a new feature

```bash
# 1. Create test file first (TDD)
test/unit/features/<featureName>/command.test.ts

# 2. Run in watch mode while developing
pnpm exec vitest run test/unit/features/<featureName>/command.test.ts

# 3. Verify coverage after implementation
pnpm run test:unit:coverage
```

## Git workflow and commits

### Atomic conventional commits

Every commit must be atomic (one logical change) and follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

**Enforced rules (commitlint will reject violations):**

- **Subject must be lowercase** — `feat: add file creator` (not `feat: Add File Creator`)
- Subject must not be empty
- Type must be one of: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

**Version impact:**

| Type | Release |
|------|---------|
| `feat` | Minor |
| `fix`, `perf`, `refactor` | Patch |
| `docs`, `style`, `test`, `build`, `ci`, `chore` | No release |
| `feat!` or `BREAKING CHANGE` footer | Major |

### Pre-commit hooks

Husky runs automatically on every commit:

1. **pre-commit**: `lint-staged` — ESLint --fix + Prettier on staged files
2. **commit-msg**: `commitlint` — validates commit message format

If a pre-commit hook fails, the commit did NOT happen. Fix the issue, re-stage, and create a NEW commit (do not amend).

### Commit sequence for new features

```
feat(utils): add helper utility for feature X
feat(core): extend core module for feature X
feat(featureName): add feature X implementation
test(featureName): add unit tests for feature X
docs: add feature X documentation
```

## Adding a new feature (checklist)

1. Define types in `src/types/index.ts` if needed
2. Create `src/features/<featureName>/` with `constants.ts`, `command.ts`, `index.ts`
3. Write unit tests first (TDD): `test/unit/features/<featureName>/`
4. Extend VS Code mock in `test/unit/mocks/vscode.ts` if using new APIs
5. Register feature in `src/features/index.ts`
6. Add command to `package.json` → `contributes.commands` and `contributes.menus`
7. Update `README.md` with feature documentation
8. Run full verification: `pnpm run check-types && pnpm run lint && pnpm run test:unit:coverage && pnpm run compile`

## Documentation alignment

**Every code change must include corresponding documentation updates in the same commit or PR:**

- New feature → update `README.md` (features section), add JSDoc to public APIs
- New command → update `package.json` contributes, `README.md` (usage, shortcuts)
- Config change → update `README.md` (configuration table)
- Architecture change → update `CONTRIBUTING.md` (project structure), this file
- Breaking change → update `CHANGELOG.md` entry (auto-generated by semantic-release)

## TypeScript constraints

These rules are enforced by the compiler and linter. Violations will fail CI:

- **`noUncheckedIndexedAccess`** — Array/object index access may be `undefined`. Use optional chaining: `arr[0]?.prop`
- **`no-explicit-any`** — Never use `any`. Use `unknown` and narrow types.
- **`no-unnecessary-type-parameters`** — Generic `<T>` that appears only once in a signature is forbidden. Return `unknown` instead.
- **`explicit-function-return-type`** — All functions must have explicit return types.
- **`consistent-type-imports`** — Use `import type` for type-only imports.
- **`prefer-readonly`** — Class properties that are never reassigned must be `readonly`.

## Boundaries

### Always

- Run `pnpm run check-types && pnpm run lint && pnpm run test:unit` before committing
- Write tests before or alongside implementation (TDD)
- Follow existing patterns — look at neighboring files for conventions
- Use `import type` for type-only imports
- Update documentation when changing behavior
- Use `registry.register()` for always-available commands, `registry.registerGuarded()` for toggle-controlled commands

### Ask first

- Adding new dependencies (this project has zero runtime deps)
- Changing `tsconfig.json`, `eslint.config.mjs`, or other root configs
- Modifying the CI/CD pipeline (`.github/workflows/`)
- Changing the extension activation flow (`src/extension.ts`)
- Architectural changes affecting multiple features

### Never

- Commit secrets, credentials, or `.env` files
- Use `any` type (use `unknown` + type narrowing)
- Skip git hooks (`--no-verify`)
- Force-push to `main`
- Add runtime dependencies without explicit approval
- Modify `package.json` version manually (semantic-release handles this)
- Break the feature module boundary (features must not import from each other)
