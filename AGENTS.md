# AGENTS.md

> Behavioral rules for AI coding agents working on this project.
> For specific versions, scripts, and config details, read the actual config files — they are the source of truth.

## Orientation

**ARIT Toolkit** is a VS Code extension. No runtime dependencies — VS Code API only.

Before making changes, read:

- `package.json` — scripts, dependencies, lint-staged config
- `tsconfig.json` — compiler options and strictness
- `eslint.config.mjs` — linting rules, complexity limits, file-scoped overrides
- `CONTRIBUTING.md` — human contributor guidelines and project structure

Follow existing patterns — look at neighboring files before writing new code.

## Development rules

### Test-driven development

1. **Red** — Write a failing test first. Test path mirrors source path.
2. **Green** — Write the minimum code to make the test pass.
3. **Refactor** — Clean up while keeping tests green.

Unit tests mock the VS Code API. If your code uses a VS Code API that isn't mocked yet, extend the mock file.

### Small files, small functions

ESLint enforces strict size and complexity limits on source files. Test files have relaxed limits. Read `eslint.config.mjs` for the exact numbers.

When approaching limits: extract helpers, use early returns, split into smaller modules.

### Domain-driven design

- **Core** (`src/core/`): Shared infrastructure. Stable, no feature-specific logic.
- **Features** (`src/features/<name>/`): Self-contained bounded contexts. Features depend on Core but **never on each other**.
- **Utils** (`src/utils/`): Pure functions with zero dependencies on VS Code API or Core.

When adding a feature, follow the structure of existing features.

### Atomic conventional commits

Every commit must be atomic (one logical change) and follow [Conventional Commits](https://www.conventionalcommits.org/).

- Subject must be **lowercase** — commitlint rejects uppercase
- Git hooks run automatically: lint-staged (pre-commit) and commitlint (commit-msg)
- If a hook fails, the commit did NOT happen — fix, re-stage, and create a **new** commit (do not amend)
- Versions are managed by semantic-release — never bump manually

### Documentation alignment

Every code change must include corresponding documentation updates in the same commit or PR. If you change behavior, update `README.md`. If you change architecture, update `CONTRIBUTING.md` and this file.

## Boundaries

### Always

- Run type-check, lint, and tests before committing
- Write tests before or alongside implementation (TDD)
- Follow existing patterns — read neighboring files first
- Use `import type` for type-only imports
- Update documentation when changing behavior

### Ask first

- Adding new dependencies (this project has zero runtime deps)
- Changing root config files (`tsconfig.json`, `eslint.config.mjs`, etc.)
- Modifying CI/CD pipelines
- Changing the extension activation flow
- Architectural changes affecting multiple features

### Never

- Commit secrets, credentials, or `.env` files
- Use `any` in source files (use `unknown` + type narrowing)
- Skip git hooks (`--no-verify`)
- Force-push to `main`
- Add runtime dependencies without explicit approval
- Modify `package.json` version manually
- Break the feature module boundary (features must not import from each other)
- Add `eslint-disable` comments for rules that are already turned off for that file scope
