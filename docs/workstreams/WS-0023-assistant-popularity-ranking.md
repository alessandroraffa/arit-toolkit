---
title: 'Assistant popularity ranking — single-source ordering mechanism'
plan: PLAN-006-assistant-popularity-ranking
workstream: WS-0023
status: 'in-progress'
workspaces: []
dependencies: []
created: 2026-06-23
references:
  - docs/plans/PLAN-006-assistant-popularity-ranking.md
  - docs/specifications/SPEC-004-assistant-popularity-ranking.md
  - docs/initiatives/INIT-006-assistant-popularity-ranking.md
---

This workstream implements [SPEC-004](../specifications/SPEC-004-assistant-popularity-ranking.md) by following the four internal increments defined in [PLAN-006](../plans/PLAN-006-assistant-popularity-ranking.md): pure scoring and ordering component (Activity 1), versioned data artifact shape and runtime registry sort (Activity 2), build-time fetch tool and first real artifact (Activity 3), and README generated regions, consistency gate, swap-invariance, staleness probe, and discoverability (Activity 4).

## Execution instructions

> Re-read this section at the start of every execution session. For the full protocol, see `execution-protocol skill`.

**When starting a session on this StepLedger** — if the status is `draft`, do NOT execute — follow `skills/draft-review/SKILL.md`. If `deferred`, `canceled`, or `failed`, return to the Human. Read PLAN-006, SPEC-004, `docs/project-context.md`, and the execution protocol. Run `source ~/.nvm/nvm.sh && nvm use 22.22` before any pnpm script. The branch for this plan does not yet exist — create `feat/assistant-popularity-ranking` from `main` on first execution. If the status is `idle`, set it to `in-progress`.

**Before each activity** — read every task and subtask in the activity, and read each target file in full, before writing any code.

**During execution** — always read a file before modifying it. Follow TDD: write failing tests first, then implement. Mark each subtask `[x]` immediately on completion, then the task, then the activity — never batch. After each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" before continuing.

**Before each commit** — run the full quality gate: `source ~/.nvm/nvm.sh && nvm use 22.22 && pnpm run check-types && pnpm run lint && pnpm run test:unit && pnpm run test:integration:vitest`. All four commands must pass with zero errors and zero failures, and the existing test count must not decrease. The integration test suite (`pnpm run test:integration:vitest`) runs `pnpm run build` first — a failing build blocks the gate.

**When completing the last activity** — compile the Reflection sub-block, set status to `completed`, verify the full suite, then propose the PR to the Human (the agent cannot merge).

## Architectural decisions

These decisions are settled in PLAN-006. Do not re-open them during execution; record any forced deviation as a divergence.

1. **Normalization formula.** `position = maxDenseRank > 1 ? (denseRank - 1) / (maxDenseRank - 1) : 0` (PLAN-006 Decision 1, Alternative A). Best end is 0, worst end is 1, sole possessor maps to 0. Ordering is ascending — lowest average score sorts first.

2. **Versioned data artifact.** A single generated TypeScript module at `src/features/agentSessionsArchiving/providers/popularityData.ts`. Exports a typed, frozen data structure. Marked do-not-hand-edit. Compiled in by esbuild — zero new runtime dependency, no runtime read (PLAN-006 Decision 2, Alternative A).

3. **Build-time tool.** A TypeScript script at `scripts/refresh-popularity.ts` invoked via `npx tsx scripts/refresh-popularity.ts`. Invoked via the `refresh:popularity` package script and a new scheduled monthly CI workflow at `.github/workflows/popularity-refresh.yml`. Imports the scoring component directly from `src/features/agentSessionsArchiving/providers/popularityScoring.ts` (tsx resolves to the TypeScript source). Uses only Node built-ins for HTTP. Opens a pull request; never pushes directly to the published branch (PLAN-006 Decision 3, Alternative A).

4. **Runtime registry sort.** `getDefaultProviders()` in `src/features/agentSessionsArchiving/providers/index.ts` is the single ordering chokepoint: it sorts the composed provider list by stable provider `name` against the artifact's resolved order. Unranked providers sort after all ranked ones, then alphabetically by `name` (PLAN-006 Decision 4, Alternative A). The eight stable `name` values are: `aider`, `claude-code`, `codex`, `open-code`, `cline`, `roo-code`, `continue`, `copilot-chat`.

5. **README generated regions.** The build-time tool regenerates four order-bearing fragments, each wrapped in its own delimited generated region rewritten in place from the single resolved order (PLAN-006 Decision 5, Alternative A). The four delimiter pairs are:
   - `<!-- POPULARITY-TABLE:START -->` / `<!-- POPULARITY-TABLE:END -->` — the "Supported assistants" table rows (all eight in popularity order) plus the not-an-endorsement disclaimer, method-pointer, and "as of `<last refresh>`" marker block.
   - `<!-- POPULARITY-INTRO:START -->` / `<!-- POPULARITY-INTRO:END -->` — the intro prose enumeration of supported assistants (all eight in order).
   - `<!-- POPULARITY-FEATURES:START -->` / `<!-- POPULARITY-FEATURES:END -->` — the "Why Tangyr Workbench" feature-bullet enumeration (all eight in order).
   - `<!-- POPULARITY-COUNT:START -->` / `<!-- POPULARITY-COUNT:END -->` — the count claim ("8 assistants").

6. **Swap-invariance test permutations.** Natural order vs. fully reversed order as the baseline; and the targeted Cline (`name: 'cline'`) / RooCode (`name: 'roo-code'`) adjacent-pair swap (PLAN-006 Decision 6).

7. **Staleness window.** One calendar month beyond the monthly cadence. The staleness-probe job reads `refreshedAt` from the artifact and opens a GitHub issue when more than two cadence periods (two months) have elapsed (PLAN-006 Decision 7).

8. **Scoring component location and reuse.** A pure TypeScript module at `src/features/agentSessionsArchiving/providers/popularityScoring.ts`. No external access — pure functions. Reused by the build-time tool via direct import using tsx (PLAN-006 Decision 8).

9. **Artifact fixture for Activity 2 tests.** A local TypeScript fixture at `test/unit/features/agentSessionsArchiving/providers/fixtures/popularityDataFixture.ts` satisfying the `PopularityData` interface. The fixture is the runtime sort's test input; it does not replace the real artifact (which arrives in Activity 3).

10. **PR template path.** `.github/PULL_REQUEST_TEMPLATE/popularity-refresh.md`. The scheduled workflow passes this template when opening the refresh PR via `gh pr create`.

11. **Refresh branch naming.** The workflow creates branch `chore/popularity-refresh-YYYY-MM` where `YYYY-MM` is the current month. This follows the project branch-naming convention (`chore/short-description`).

## Activities, Tasks and Subtasks

### [x] Activity 1: Pure scoring and ordering component with unit tests

Deliver the deterministic dense-ranking, normalization, averaging, and total-ordering logic as a pure TypeScript module with no external access, and prove it with unit tests covering every behavioral property fixed in SPEC-004 Aggregation model §§1–8 and PLAN-006 Decision 1.

#### [x] Task 1.1: Write failing unit tests for the scoring component

Create `test/unit/features/agentSessionsArchiving/providers/popularityScoring.test.ts`. Write failing tests against the not-yet-implemented module `src/features/agentSessionsArchiving/providers/popularityScoring.ts`. The tests must cover all of the following cases — do not omit any:

- **Dense ranking with a shared rank**: three targets with raw values `[100, 80, 80]` on one signal produce dense ranks `[1, 2, 2]`; the two rank-2 targets each receive normalized position `(2-1)/(2-1) = 1.0`; the rank-1 target receives position `0`.
- **Pool-size-comparable normalization — sole possessor**: one target possesses a signal with raw value `500`; `maxDenseRank = 1`; the `maxDenseRank > 1` guard evaluates false; `position = 0`.
- **Pool-size-comparable normalization — two-target pool**: two targets with distinct raw values produce positions `0` and `1`; `maxDenseRank = 2`.
- **All-tied pool**: four targets all share the same raw value on a signal; all receive dense rank 1; `maxDenseRank = 1`; all positions are `0`.
- **Average over possessed signals only**: a target that lacks the CLI signal has `cli` absent from `TargetSignals`; its `score` averages only `ext` and `stars` positions; the missing signal does not contribute a `0` or alter the denominator.
- **Ascending order, lowest average first**: given two targets with scores `0.3` and `0.7`, the target with score `0.3` appears at index 0 in the resolved order.
- **Alphabetical tie-break, case-insensitive ASCII ascending**: two targets with identical average scores and canonical names `'Cline'` and `'Aider'` resolve with `'Aider'` at index 0 regardless of input order.
- **Input-order independence**: the same set of eight target descriptors shuffled into three different orderings produces the identical resolved order each time (use `JSON.stringify` comparison).
- **Fully reversed input produces the same resolved order**: supply the canonical eight targets in reverse ASCII-alphabetical order; assert the resolved order matches the forward-computed order.

Confirm all new tests fail before proceeding to Task 1.2.

#### [x] Task 1.2: Implement `popularityScoring.ts`

Create `src/features/agentSessionsArchiving/providers/popularityScoring.ts` exporting the following named items:

- **`RawSignal` interface**: `{ value: number; source: string; period: string }`.
- **`TargetSignals` interface**: `{ name: string; cli?: RawSignal; ext?: RawSignal; stars?: RawSignal }`. A missing field means the target does not possess that signal.
- **`ScoredTarget` interface**: `{ name: string; score: number; positions: { cli?: number; ext?: number; stars?: number } }`. `score` is the arithmetic mean of the positions the target possesses.
- **`computeDenseRanks(values: number[]): number[]`**: given raw values (one per possessing target, any order), returns dense ranks in the same positional order. Rank 1 is highest. Equal values share a rank; the next distinct value takes the immediately following rank with no gap. Does not sort the input in place.
- **`normalizeRank(denseRank: number, maxDenseRank: number): number`**: applies `maxDenseRank > 1 ? (denseRank - 1) / (maxDenseRank - 1) : 0`. Returns a value in `[0, 1]`.
- **`scoreTargets(targets: TargetSignals[]): ScoredTarget[]`**: for each signal family (CLI, EXT, STARS), collects the targets that possess it, calls `computeDenseRanks` on their raw values, calls `normalizeRank` for each, stores the position on the `ScoredTarget`. Each target's `score` is the arithmetic mean of its possessed-signal positions. A target that possesses no signal (unreachable given the eight verified targets, but defined for robustness) receives `score: 0` and `positions: {}`.
- **`resolveOrder(targets: TargetSignals[]): string[]`**: calls `scoreTargets`, sorts results ascending by `score`, ties broken by target `name` collated case-insensitive ASCII lexicographic ascending using `name.toLowerCase()` (not `localeCompare`). Returns the `name` array in resolved order (lowest score = most popular = index 0).
- **`CANONICAL_NAMES: readonly string[]`**: `Object.freeze(['Aider', 'Claude Code', 'Cline', 'Continue', 'GitHub Copilot Chat', 'OpenAI Codex', 'OpenCode', 'RooCode'])`.
- **`POOL_SIZE_ACKNOWLEDGMENT: string`**: `'Popularity scores use rank-based aggregation. A target that ranks best within a smaller pool of signal possessors attains the top relative position on that signal — an accepted property of rank-based aggregation that discards magnitude for robustness.'`.

Keep the module under 200 non-blank, non-comment lines. Run the quality gate; confirm all Task 1.1 tests pass.

#### [x] Task 1.3: Update impacted documentation

Add a JSDoc block at the top of `popularityScoring.ts` summarising: the normalization formula, the ascending-score ordering direction, the canonical name tie-break rule, and the fact that this module is pure and side-effect-free.

#### [x] Task 1.4: Commit changes

Commit `src/features/agentSessionsArchiving/providers/popularityScoring.ts` and `test/unit/features/agentSessionsArchiving/providers/popularityScoring.test.ts`. Commit message: `feat(archiving): add pure popularity scoring and ordering component`.

### [ ] Activity 2: Versioned artifact shape, runtime registry sort, and bundle-asset guard

Define the typed artifact shape module (no real data — shape and placeholder only), wire the runtime sort into `getDefaultProviders()`, and verify with unit tests. The existing bundle-asset integration test confirms the artifact module introduces no new external dependency and is the enforcing guard.

#### [ ] Task 2.1: Write failing unit tests for the artifact shape and runtime sort

Create `test/unit/features/agentSessionsArchiving/providers/fixtures/popularityDataFixture.ts`. This file exports one constant `FIXTURE_POPULARITY_DATA` of type `PopularityData` (imported from `src/features/agentSessionsArchiving/providers/popularityData.ts` — the shape module created in Task 2.2). The fixture must satisfy the full `PopularityData` interface with synthetic values: eight target entries in the alphabetical resolved order `['Aider', 'Claude Code', 'Cline', 'Continue', 'GitHub Copilot Chat', 'OpenAI Codex', 'OpenCode', 'RooCode']` as `resolvedOrder`; each target entry carries the signal fields appropriate to its verified feasibility profile (Aider: `cli` + `stars`, no `ext`; Cline: `ext` + `stars`, no `cli`; GitHub Copilot Chat: `ext` + `stars`, no `cli`; RooCode: `ext` + `stars`, no `cli`; the other four: all three); plausible `score` and `positions` values; `refreshedAt: '2025-01-01T00:00:00.000Z'` (a deliberately stale timestamp — more than two cadence periods before any realistic test run date — so that staleness-aware tests can distinguish the fixture from a fresh artifact without requiring wall-clock mocking); `refreshPeriod: '2025-01'`; `poolSizeAcknowledgment`, `disclaimer`, and `methodPointer` imported from their respective source modules.

Create `test/unit/features/agentSessionsArchiving/providers/popularitySort.test.ts`. Import and mock dependencies following the pattern in `test/unit/features/agentSessionsArchiving/archiveService.test.ts`. Write failing tests:

- **Sort matches fixture resolved order**: mock `src/features/agentSessionsArchiving/providers/popularityData.ts` via `vi.mock` so its `POPULARITY_DATA` export equals `FIXTURE_POPULARITY_DATA`; call `getDefaultProviders(mockContext, mockLogger)` and assert `result.map(p => p.name)` equals `['aider', 'claude-code', 'cline', 'continue', 'copilot-chat', 'codex', 'open-code', 'roo-code']` (the fixture's canonical-name order mapped through `providerNameToCanonical` in reverse, i.e., the provider `name` sequence corresponding to the fixture's `resolvedOrder`).
- **Unranked provider sorts last**: inject a stub provider `{ name: 'unknown-tool', displayName: 'Unknown Tool', findSessions: async () => [] }` into the providers array before sorting; assert it appears after all eight ranked providers.
- **No network call at sort time**: spy on `globalThis.fetch` (if defined); assert it is not called during `getDefaultProviders`.
- **No filesystem read of artifact at sort time**: spy on `readFileSync` from the `fs` module; assert it is not called during `getDefaultProviders`.

Confirm all new tests fail before proceeding to Task 2.2.

#### [ ] Task 2.2: Implement the `popularityData.ts` shape module

Create `src/features/agentSessionsArchiving/providers/popularityData.ts`. Structure:

- **Top block comment** (not JSDoc): `/* THIS FILE IS AUTO-GENERATED. DO NOT EDIT BY HAND. Run "pnpm run refresh:popularity" or wait for the monthly CI refresh. See scripts/refresh-popularity.ts for the generation procedure. */`
- **Import**: `import { POOL_SIZE_ACKNOWLEDGMENT } from './popularityScoring';`
- **`TargetRecord` interface export**: `{ canonicalName: string; providerName: string; score: number; positions: { cli?: number; ext?: number; stars?: number }; signals: { cli?: import('./popularityScoring').RawSignal; ext?: import('./popularityScoring').RawSignal; stars?: import('./popularityScoring').RawSignal } }`.
- **`PopularityData` interface export**: `{ resolvedOrder: readonly string[]; targets: readonly TargetRecord[]; refreshedAt: string; refreshPeriod: string; poolSizeAcknowledgment: string; disclaimer: string; methodPointer: string }`. `resolvedOrder` lists canonical display names in popularity order (most popular first).
- **`DISCLAIMER` constant export**: `'This popularity order is derived from public signals (downloads, installs, stars) and is not an endorsement, recommendation, or quality judgment of any assistant.'`
- **`METHOD_POINTER` constant export**: `'docs/plans/PLAN-006-assistant-popularity-ranking.md'`
- **`POPULARITY_DATA` constant export** (typed as `PopularityData`, wrapped in `Object.freeze`): placeholder value with `resolvedOrder: Object.freeze(['Claude Code', 'GitHub Copilot Chat', 'OpenAI Codex', 'Cline', 'RooCode', 'Continue', 'Aider', 'OpenCode'])`, `targets: Object.freeze([])`, `refreshedAt: 'not-yet-refreshed'`, `refreshPeriod: 'not-yet-refreshed'`, `poolSizeAcknowledgment: POOL_SIZE_ACKNOWLEDGMENT`, `disclaimer: DISCLAIMER`, `methodPointer: METHOD_POINTER`.

Keep the module under 100 lines. Run `pnpm run check-types` to confirm the shape compiles before proceeding.

#### [ ] Task 2.3: Wire the runtime sort into `getDefaultProviders()`

Read `src/features/agentSessionsArchiving/providers/index.ts` in full before modifying it.

Add to `src/features/agentSessionsArchiving/providers/index.ts`:

- Import at top: `import { POPULARITY_DATA } from './popularityData';`
- Module-level exported pure function `providerNameToCanonical(name: string): string` mapping: `'aider' -> 'Aider'`, `'claude-code' -> 'Claude Code'`, `'cline' -> 'Cline'`, `'continue' -> 'Continue'`, `'copilot-chat' -> 'GitHub Copilot Chat'`, `'codex' -> 'OpenAI Codex'`, `'open-code' -> 'OpenCode'`, `'roo-code' -> 'RooCode'`. Returns the input unchanged for any unrecognized name. Export this function so that the consistency tests in Activity 4 can import it directly.
- After the `providers` array is fully composed (after the `CopilotChatProvider` conditional push), add: `providers.sort((a, b) => { const order = POPULARITY_DATA.resolvedOrder; const ia = order.indexOf(providerNameToCanonical(a.name)); const ib = order.indexOf(providerNameToCanonical(b.name)); const ra = ia === -1 ? order.length : ia; const rb = ib === -1 ? order.length : ib; if (ra !== rb) return ra - rb; return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });`

Run the full quality gate (check-types + lint + test:unit + test:integration:vitest). Confirm all Task 2.1 tests pass and all pre-existing tests remain green. The `test:integration:vitest` run includes `bundle-assets.test.ts` — the `should only have "vscode" and node built-ins as external requires` assertion passing confirms the artifact module introduces no new external dependency (AC11 enforcing guard).

Note OR-004: `providerNameToCanonical` is exported from this file (not deferred to Activity 4) so the consistency test in Task 4.2 can import it without a separate export task. Note BK-007: the eight-provider sort added here runs on every call to `getDefaultProviders()`; if profiling later indicates cost, memoization is a separate optimization — do not memoize here.

#### [ ] Task 2.4: Update impacted documentation

Add a JSDoc block below the top comment in `popularityData.ts` describing the `PopularityData` interface fields, the `DISCLAIMER` and `METHOD_POINTER` constants, and the do-not-edit provenance note. Record any deviation from PLAN-006 Decision 2 in "Divergences and notes".

#### [ ] Task 2.5: Commit changes

Commit `src/features/agentSessionsArchiving/providers/popularityData.ts`, the modified `src/features/agentSessionsArchiving/providers/index.ts`, `test/unit/features/agentSessionsArchiving/providers/fixtures/popularityDataFixture.ts`, and `test/unit/features/agentSessionsArchiving/providers/popularitySort.test.ts`. Commit message: `feat(archiving): add popularity artifact shape and wire runtime registry sort`.

### [ ] Activity 3: Build-time refresh tool, validity contract, sanity bound, and first real artifact

Deliver the TypeScript build-time tool that queries the verified sources, applies the per-source validity contract, computes scores, writes the first real artifact, and opens a pull request. Unit tests with recorded fixture responses prove every contract clause. The CI workflow and package script wire the monthly cadence.

#### [ ] Task 3.1: Write failing unit tests for the refresh tool

Create `test/unit/scripts/refresh-popularity.test.ts` (create the `test/unit/scripts/` directory if it does not exist). The tool is a TypeScript module at `scripts/refresh-popularity.ts`. Add a comment at the top of the test file identifying the HTTP mock approach used: the tool uses the `node:https` module, so the tests mock it via `vi.mock('node:https', ...)` using Vitest's module mock facility. This comment must be present before you implement the tool in Task 3.2 — the mock approach is fixed here and the implementation must be consistent with it. Write failing tests covering:

- **npm validity contract — accepted**: fixture response `{ downloads: 5000000, start: '2026-06-01', end: '2026-06-30' }` for targeted month `'2026-06'`; the signal `value` is `5000000`.
- **npm validity contract — stale window rejected**: response `{ downloads: 0, start: '2026-05-01', end: '2026-05-31' }` for targeted month `'2026-06'`; the `start` field prefix does not match `'2026-06'`; result is absent (null), not zero.
- **npm validity contract — malformed rejected**: response `{ error: 'not found' }` (missing `downloads` field); result is absent.
- **PyPI validity contract — zero-floor for known-history package**: `'aider-chat'` has a prior nonzero `cli.value` in the prior data object passed to the tool; a response `{ data: { last_month: 0 } }` is recorded as absent.
- **PyPI validity contract — first-seen package zero permitted**: prior data passed as `null` for that target; a response `{ data: { last_month: 0 } }` is accepted with `value: 0`.
- **VS Code Marketplace validity contract — accepted**: a gallery response with an `install` statistic of `8000000` for `itemName: 'GitHub.copilot-chat'`; `value` is `8000000`.
- **GitHub stars validity contract — accepted**: response `{ stargazers_count: 50000 }`; `value` is `50000`.
- **GitHub stars validity contract — throttled (403) recorded absent**: a `403` response; result is absent (null).
- **Non-2xx from any source recorded absent**: a `500` response; result is absent; the run continues.
- **Repeatability**: calling the score-computation step with the same accepted signals twice produces identical output (same JSON serialization of the resulting `PopularityData` object).
- **No-change produces unchanged resolved order**: when the new resolved order equals the prior order, `resolvedOrder` in the output is unchanged.
- **Sanity bound — three inverted pairs flags**: a prior order and new order differing by exactly three pairwise position inversions (swap indices 0 and 1, 2 and 3, 4 and 5 in an eight-element list); `shouldFlagForReview(priorOrder, newOrder)` returns `true`.
- **Sanity bound — two inverted pairs does not flag**: prior and new orders differing by exactly two inversions; `shouldFlagForReview(priorOrder, newOrder)` returns `false`.
- **First run skips sanity bound**: `shouldFlagForReview(null, newOrder)` returns `false`.
- **GitHub Copilot Chat CLI package never queried**: assert that no outgoing request URL contains `@github/copilot` or `github%2Fcopilot` during a simulated tool run.

Confirm all new tests fail before proceeding.

#### [ ] Task 3.2: Implement `scripts/refresh-popularity.ts`

Create `scripts/refresh-popularity.ts` as a TypeScript script invoked via `npx tsx`. This file uses tsx's direct-import capability to import the scoring functions from the compiled-adjacent TypeScript source. Structure:

- **Imports**: `node:https`, `node:fs`, `node:fs/promises`, `node:path`, `node:url`, `node:process`. Import `computeDenseRanks`, `scoreTargets`, `resolveOrder`, `POOL_SIZE_ACKNOWLEDGMENT` from `'../src/features/agentSessionsArchiving/providers/popularityScoring.js'` (tsx resolves `.js` extensions to their `.ts` source counterparts at runtime; use the `.js` specifier for ESM compatibility). No third-party imports.
- **`INVERSION_THRESHOLD`** constant: `2`.
- **`TARGETS`** constant: array of eight target descriptor objects with `canonicalName`, `providerName`, signal source descriptors per PLAN-006 Data-source feasibility table, and a `readmeRow` object per target containing `sessionLocation` and `workspaceMatching` strings used to generate the README table row. Per-target `readmeRow` values:
  - Claude Code: `{ sessionLocation: '~/.claude/projects/<workspace-path>/', workspaceMatching: 'Project path derived from workspace' }`
  - Cline: `{ sessionLocation: 'VS Code global storage', workspaceMatching: 'Session content references workspace path' }`
  - GitHub Copilot Chat: `{ sessionLocation: 'VS Code workspace storage (chatSessions/)', workspaceMatching: 'Per-workspace storage (.json and .jsonl)' }`
  - OpenAI Codex: `{ sessionLocation: '~/.codex/sessions/<YYYY>/<MM>/<DD>/', workspaceMatching: 'cwd field in session metadata' }`
  - OpenCode: `{ sessionLocation: '~/.local/share/opencode/opencode.db', workspaceMatching: 'directory field in session row' }`
  - Aider: `{ sessionLocation: 'Workspace root (.aider.* files)', workspaceMatching: 'Files present in the workspace root' }`
  - RooCode: `{ sessionLocation: 'VS Code global storage', workspaceMatching: 'Session content references workspace path' }`
  - Continue: `{ sessionLocation: '~/.continue/sessions/', workspaceMatching: 'Session content references workspace path' }`
- **`httpsGet(url, headers)`**: wraps `https.get` in a Promise, collects response body, returns `{ statusCode, body }`. Rejects on connection error; the caller treats any rejection as absent.
- **`fetchNpm(pkg, targetMonth)`**: calls `https://api.npmjs.org/downloads/point/YYYY-MM-01:YYYY-MM-31/PKG` where `YYYY-MM` is `targetMonth`. Accepts when 2xx, `downloads` is an integer >= 0, and `start` begins with `targetMonth`. Returns `{ value, source: 'npm', period: targetMonth }` or `null`.
- **`fetchPypi(pkg)`**: calls `https://pypistats.org/api/packages/PKG/recent?period=month`. Accepts when 2xx and `data.last_month` is an integer >= 0. Returns `{ value, source: 'pypi', period: YYYY-MM }` (derive `YYYY-MM` from current date) or `null`. Does not apply the zero-floor — the caller applies it in `applyZeroFloor`.
- **`fetchMarketplace(itemName)`**: POSTs to `https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery` with headers `Content-Type: application/json; charset=utf-8` and `Accept: application/json;api-version=7.2-preview.1`, body `{ filters: [{ criteria: [{ filterType: 7, value: itemName }], pageSize: 1 }], flags: 512 }`. Extracts the `install` statistic from `results[0].extensions[0].statistics`. Returns `{ value, source: 'marketplace', period: 'cumulative' }` or `null`.
- **`fetchOpenVsx(itemName)`**: calls `https://open-vsx.org/api/NAMESPACE/NAME` (split `itemName` on `'.'`, first part is namespace). Extracts `downloadCount`. Returns `{ value, source: 'open-vsx', period: 'cumulative' }` or `null`.
- **`fetchGithubStars(ownerRepo)`**: calls `https://api.github.com/repos/OWNER/REPO` with `User-Agent: tangyr-popularity-refresh`. Adds `Authorization: token TOKEN` header only when `process.env['GITHUB_POPULARITY_TOKEN']` is set and non-empty. Returns `{ value: stargazers_count, source: 'github', period: 'cumulative' }` or `null` on any non-2xx.
- **`applyZeroFloor(signal, priorCliValue)`**: when `signal.value > 0`, returns the signal unchanged. When `signal.value === 0` and `priorCliValue` is a positive number (known-history), returns `null`. When `signal.value === 0` and `priorCliValue` is null or 0 (first-seen), returns the signal.
- **`shouldFlagForReview(priorOrder, newOrder)`**: returns `false` when `priorOrder` is null. Otherwise counts pairwise inversions (Kendall-tau distance) between the two eight-element arrays and returns `true` when the count is greater than `INVERSION_THRESHOLD`.
- **`buildArtifactModule(data)`**: returns the complete TypeScript source string for `popularityData.ts`. The string must begin with the do-not-edit comment block (`/* THIS FILE IS AUTO-GENERATED ... */`), then import `POOL_SIZE_ACKNOWLEDGMENT` from `'./popularityScoring'`, then export `DISCLAIMER`, `METHOD_POINTER`, `TargetRecord` interface, `PopularityData` interface, and `POPULARITY_DATA`. All values from `data` are embedded as JSON literals via `JSON.stringify`.
- **`buildRegionTable(data)`**: returns the string to insert between the `<!-- POPULARITY-TABLE:START -->` and `<!-- POPULARITY-TABLE:END -->` delimiters. Includes: (1) a Markdown table header matching the existing README table columns (`| Assistant | Session location | Workspace matching |`), (2) one row per target in `data.resolvedOrder` order using `sessionLocation` and `workspaceMatching` from each target's `readmeRow`; (3) the not-an-endorsement disclaimer block: `> **Note:** DISCLAIMER` followed by `> Method: [PLAN-006](METHOD_POINTER)` followed by `> As of: REFRESH_PERIOD`.
- **`buildRegionIntro(data)`**: returns the string to insert between the `<!-- POPULARITY-INTRO:START -->` and `<!-- POPULARITY-INTRO:END -->` delimiters. Produces the prose enumeration sentence naming all eight targets in resolved order.
- **`buildRegionFeatures(data)`**: returns the string to insert between the `<!-- POPULARITY-FEATURES:START -->` and `<!-- POPULARITY-FEATURES:END -->` delimiters. Produces the "Why Tangyr Workbench" feature-bullet enumeration naming all eight targets in resolved order.
- **`buildRegionCount(data)`**: returns the string to insert between the `<!-- POPULARITY-COUNT:START -->` and `<!-- POPULARITY-COUNT:END -->` delimiters. Produces the count claim: `8`.
- **`run()`**: async main entry point. Reads the current `src/features/agentSessionsArchiving/providers/popularityData.ts` to extract `refreshedAt` and prior `cli.value` per target (for zero-floor). Determines `targetMonth` as the current `YYYY-MM`. Fetches all signals concurrently with `Promise.allSettled`. Applies validity contracts and zero-floors. Calls `resolveOrder` (imported from `popularityScoring.ts`). Calls `shouldFlagForReview` against the prior order extracted from the file. Calls `buildArtifactModule` and writes to `src/features/agentSessionsArchiving/providers/popularityData.ts`. Calls `buildRegionTable`, `buildRegionIntro`, `buildRegionFeatures`, and `buildRegionCount`, reads `README.md`, replaces the content between each delimiter pair with the corresponding region string (preserving both delimiter lines for each pair), and writes `README.md`. Prints the PR body including the three editorial-checklist items (sanity-bound flag status, inverted pairs count and which targets moved, any zero-or-single-signal targets). Calls `gh pr create --body-file <tempfile>` (not `--body`) if the `gh` CLI is available and the `GITHUB_TOKEN` environment variable is set; otherwise prints the PR body to stdout. The `gh pr create` call must propagate non-zero exit codes — do not swallow them with `|| true` or equivalent.

Add `"refresh:popularity": "npx tsx scripts/refresh-popularity.ts"` to the `scripts` section in `package.json`. Run `pnpm run check-types` to verify the TypeScript source tree is unaffected.

#### [ ] Task 3.3: Run the tool and commit the first real artifact

Run `source ~/.nvm/nvm.sh && nvm use 22.22 && npx tsx scripts/refresh-popularity.ts` locally. The tool queries live sources, writes `src/features/agentSessionsArchiving/providers/popularityData.ts` with real data, and updates all four README generated regions.

After the command completes, verify the generated artifact only (README region verification is performed in Activity 4 after the bootstrap step):

- Read the generated `src/features/agentSessionsArchiving/providers/popularityData.ts` and verify: `resolvedOrder` has exactly eight entries; `targets` has exactly eight entries each with at least two signal values (any signal recorded as absent is still represented but with its field absent, which is acceptable); `refreshedAt` is a valid ISO 8601 UTC timestamp; `refreshPeriod` equals the current month `'YYYY-MM'`; `disclaimer`, `methodPointer`, and `poolSizeAcknowledgment` are present and non-empty.
- If the tool fails for any reason other than network unavailability of one or more sources (which is acceptable — those signals are recorded as absent), record the failure in "Divergences and notes" with the error and do not commit a broken or empty artifact.
- Run the full quality gate. Confirm all tests pass.

Do not create the PR locally. The PR creation step runs only in the CI workflow (Task 3.4). If the tool also regenerated README regions (they are present in the output), stage `README.md` for commit alongside the artifact — they were produced together and belong in the same commit.

#### [ ] Task 3.4: Add the scheduled CI workflow

Create `.github/workflows/popularity-refresh.yml`. The workflow has `on.schedule` with cron `'0 6 1 * *'` (06:00 UTC on the first of every month) and `on.workflow_dispatch` for manual triggering. Permissions: `contents: write`, `pull-requests: write`. It contains two jobs:

**Job `refresh`**: checks out the repository, installs pnpm and Node 22.22.1, installs dependencies with `--frozen-lockfile`, then runs a shell step that: sets git user identity to `github-actions[bot]`; creates and pushes a branch named `chore/popularity-refresh-YYYY-MM` (using `$(date +%Y-%m)`); runs `npx tsx scripts/refresh-popularity.ts`; stages `src/features/agentSessionsArchiving/providers/popularityData.ts` and `README.md`; commits only when there are staged changes (using `git diff --cached --quiet || git commit`); pushes the branch; creates the PR via `gh pr create --body-file` (passing a temporary file containing the PR body — not `--body`) with title `chore(popularity): monthly ranking refresh YYYY-MM`, template `.github/PULL_REQUEST_TEMPLATE/popularity-refresh.md`, base `main`, head `chore/popularity-refresh-YYYY-MM`. Any non-zero exit from `gh pr create` must propagate and fail the step — do not wrap with `|| true`. The step uses `GITHUB_POPULARITY_TOKEN` from secrets (optional read-only star-query token) and `GITHUB_TOKEN` from secrets (action job token for PR creation). On failure, an `actions/github-script` step opens a GitHub issue titled `Popularity refresh workflow failed — YYYY-MM` with a `maintenance` label.

**Job `staleness-probe`** (independent of `refresh`, runs on the same schedule): checks out the repository, runs an `actions/github-script` step that reads `src/features/agentSessionsArchiving/providers/popularityData.ts` synchronously, extracts the `refreshedAt` field via the regex `/refreshedAt:\s*"([^"]+)"/` (anchored to the generated module's string-literal format), skips when the captured value is `'not-yet-refreshed'`, computes `Date.now() - new Date(refreshedAt).getTime()`, and when the elapsed time exceeds `2 * 30 * 24 * 60 * 60 * 1000` milliseconds (two cadence periods), opens a GitHub issue titled `Popularity ranking is overdue for refresh — YYYY-MM` with body citing the last refresh date and the command `pnpm run refresh:popularity`, labeled `maintenance`.

Record in "Divergences and notes" that the `GITHUB_POPULARITY_TOKEN` secret must be added to repository CI secrets by the maintainer before the first scheduled run; its absence causes GitHub star queries to use the anonymous ceiling but does not block the workflow.

#### [ ] Task 3.5: Add the PR template and update documentation

Create `.github/PULL_REQUEST_TEMPLATE/popularity-refresh.md`:

```markdown
## Monthly popularity ranking refresh

### Editorial checklist

- [ ] **Sanity bound**: [FLAGGED for heightened review / Routine — N inverted pairs]
- [ ] **Position delta**: [List which targets moved and by how much]
- [ ] **Signal coverage**: [Any target with zero or one counted signal this refresh]

### Method

Signals: npm monthly downloads, VS Code Marketplace installs, Open VSX downloads, GitHub stars.
Aggregation: per-signal dense rank, normalized to pool-size-comparable position (best = 0), averaged ascending.
See `docs/plans/PLAN-006-assistant-popularity-ranking.md`.
```

Add a `## Popularity refresh` section to `docs/technical-context.md` documenting: the `pnpm run refresh:popularity` command (which invokes `npx tsx scripts/refresh-popularity.ts`), the `.github/workflows/popularity-refresh.yml` scheduled workflow, the two credentials (`GITHUB_POPULARITY_TOKEN` — read-only, optional; `GITHUB_TOKEN` — action job token for PR creation), the maintenance owner (project maintainer), and the acceptable-staleness window (one calendar month; the staleness-probe opens an issue after two months elapsed). Update the `Last updated` field in the `docs/technical-context.md` header.

Note OR-003: this task also records the operational note that `GITHUB_POPULARITY_TOKEN` must be provisioned before the first scheduled run. Note OR-005: the PR template's editorial checklist items (sanity-bound flag, position delta, signal coverage) are the auditable trace of the dual governance-and-editorial gate required by INIT-006 — document this in the `## Popularity refresh` section.

#### [ ] Task 3.6: Commit changes

Commit: `scripts/refresh-popularity.ts`, the updated `package.json`, `.github/workflows/popularity-refresh.yml`, `.github/PULL_REQUEST_TEMPLATE/popularity-refresh.md`, the generated `src/features/agentSessionsArchiving/providers/popularityData.ts`, the updated `README.md` (if modified by the tool run in Task 3.3), the updated `docs/technical-context.md`, and the test files from Task 3.1. Commit message: `feat(archiving): add popularity refresh tool, scheduled workflow, and first real artifact`.

### [ ] Activity 4: README bootstrap, consistency gate, swap-invariance, and discoverability

Insert the four generated-region delimiter pairs into the README, prove documentation/runtime/artifact agreement across all four regions with a failing consistency test, prove archiving isolation with the static search and the swap-invariance regression test, and verify all 21 AC traces.

#### [ ] Task 4.1: Bootstrap the four README generated regions

Read `README.md` in full before editing it. Locate each of the four order-bearing fragments and wrap each one in its own delimiter pair:

- Find the "Supported assistants" table (currently five rows; lines beginning `| Claude Code`, `| Cline`, `| GitHub Copilot Chat`, `| OpenAI Codex`, `| OpenCode`). Insert `<!-- POPULARITY-TABLE:START -->` on the line immediately before the table header row (`| Assistant | Session location | Workspace matching |`). Replace the five existing table rows with eight rows in popularity order, using the `readmeRow` values from the `TARGETS` constant in `scripts/refresh-popularity.ts`. Append the disclaimer block (`> **Note:** DISCLAIMER`, `> Method: [PLAN-006](METHOD_POINTER)`, `> As of: REFRESH_PERIOD`) immediately after the last table row. Insert `<!-- POPULARITY-TABLE:END -->` after the disclaimer block.
- Find the intro prose enumeration (currently "Chat sessions with Claude Code, GitHub Copilot Chat, OpenAI Codex, Cline, and OpenCode are scattered across your filesystem…"). Insert `<!-- POPULARITY-INTRO:START -->` on the line immediately before this sentence. Replace the five-name enumeration with the eight-name enumeration in popularity order. Insert `<!-- POPULARITY-INTRO:END -->` on the line immediately after.
- Find the "Why Tangyr Workbench" feature bullet that enumerates supported assistants (currently "archives AI sessions from 5 assistants"). Insert `<!-- POPULARITY-FEATURES:START -->` on the line immediately before. Update the bullet text to enumerate all eight assistants in popularity order. Insert `<!-- POPULARITY-FEATURES:END -->` on the line immediately after.
- Find the count claim inline fragment "5 assistants" (within the sentence "Tangyr Workbench archives AI sessions from 5 assistants"). Insert `<!-- POPULARITY-COUNT:START -->` on the line immediately before. Update the count fragment to `8`. Insert `<!-- POPULARITY-COUNT:END -->` on the line immediately after.

Add the four `buildRegion*` functions to `scripts/refresh-popularity.ts` if they are not already present (they were specified in Task 3.2 — verify they are implemented and produce output consistent with the manually-inserted bootstrap content above, correcting any discrepancy).

Run the full quality gate after editing `README.md`. Confirm all tests pass. Record the bootstrap edit in "Divergences and notes" as a one-time manual step (subsequent updates are automated by the refresh tool).

#### [ ] Task 4.2: Write failing consistency tests

Create `test/unit/features/agentSessionsArchiving/providers/popularityConsistency.test.ts`. Import `fs` from `node:fs`, `path` from `node:path`, `POPULARITY_DATA` from `src/features/agentSessionsArchiving/providers/popularityData.ts`, and `providerNameToCanonical` from `src/features/agentSessionsArchiving/providers/index.ts`. Read `README.md` synchronously using `fs.readFileSync(path.resolve(__dirname, '../../../../README.md'), 'utf8')`. Write failing tests:

- **TABLE region order matches artifact**: parse the README content between `<!-- POPULARITY-TABLE:START -->` and `<!-- POPULARITY-TABLE:END -->`; extract table-row assistant names in order by matching Markdown table rows (lines starting with `|` followed by a space, where the first cell is not the `| Assistant` header); assert the extracted name array equals `Array.from(POPULARITY_DATA.resolvedOrder)`.
- **INTRO region order matches artifact**: parse the README content between `<!-- POPULARITY-INTRO:START -->` and `<!-- POPULARITY-INTRO:END -->`; extract the assistant names enumerated in the prose sentence; assert all eight names appear in the resolved order.
- **FEATURES region order matches artifact**: parse the README content between `<!-- POPULARITY-FEATURES:START -->` and `<!-- POPULARITY-FEATURES:END -->`; extract the assistant names enumerated in the feature bullet; assert all eight names appear in the resolved order.
- **COUNT region matches artifact**: parse the README content between `<!-- POPULARITY-COUNT:START -->` and `<!-- POPULARITY-COUNT:END -->`; assert the count is `'8'`.
- **Runtime sort order matches artifact**: call `getDefaultProviders(mockContext, mockLogger)` (no mock of `popularityData` — use the real committed artifact); map `result.map(p => providerNameToCanonical(p.name))`; assert the sequence equals `Array.from(POPULARITY_DATA.resolvedOrder)`.
- **Disclaimer present in TABLE region**: assert the TABLE region content contains `POPULARITY_DATA.disclaimer`.
- **Method pointer present in TABLE region**: assert the TABLE region content contains `POPULARITY_DATA.methodPointer`.
- **Refresh period marker present in TABLE region**: assert the TABLE region content contains `POPULARITY_DATA.refreshPeriod`.
- **Pool-size acknowledgment in artifact**: assert `POPULARITY_DATA.poolSizeAcknowledgment` equals the `POOL_SIZE_ACKNOWLEDGMENT` constant imported from `popularityScoring.ts`.

Confirm all new tests fail before proceeding. These tests read the real files committed in Activities 1–3 and bootstrapped in Task 4.1, so they fail until all four regions are present and in agreement.

#### [ ] Task 4.3: Write failing swap-invariance tests

Create `test/unit/features/agentSessionsArchiving/providers/popularitySwapInvariance.test.ts`. The tests run archive-cycle mock scenarios using the `AgentSessionArchiveService` test pattern from `test/unit/features/agentSessionsArchiving/archiveService.test.ts`. Write failing tests:

- **Natural vs. reversed order — identical archive output**: construct a provider list with stub `ClineProvider` (returning one `SessionFile` with `archiveName: 'cline-task-001'`) and stub `RooCodeProvider` (returning one `SessionFile` with `archiveName: 'roo-code-task-001'`). Run a mock archive cycle with `[clineStub, rooCodeStub, ...others]`; record the set of `archiveName` strings for which `vscode.workspace.fs.writeFile` was called. Run again with the list in fully reversed order; record the set again. Assert the two sets are equal using `expect(setA).toEqual(setB)`.
- **Cline / RooCode adjacent-pair swap — identical archive output**: run with `[clineStub, rooCodeStub]` ordering and then with `[rooCodeStub, clineStub]` ordering; assert identical `archiveName` output sets.
- **Shared `archiveName` collision — deterministic output**: construct both `clineStub` and `rooCodeStub` so that each returns a `SessionFile` with `archiveName: 'shared-task-001'` and identical `mtime`. Run a mock archive cycle with `[clineStub, rooCodeStub]` ordering; assert `vscode.workspace.fs.writeFile` was called exactly once (the second provider's session is skipped by the fingerprint guard in `lastArchivedMap.get(session.archiveName)` since the key already maps to the archived file). Run again with `[rooCodeStub, clineStub]` ordering; assert `writeFile` was called exactly once. Assert the call count is the same in both orderings. This test exercises the `lastArchivedMap.get(session.archiveName)` fingerprint guard and the `deleteOldArchive` branch in `archiveService.ts`.
- **No cross-provider session leakage — `archiveName` prefix isolation**: under both orderings, assert no `archiveName` starting with `'cline-'` appears in the RooCode provider's output and no `archiveName` starting with `'roo-code-'` appears in the Cline provider's output. Verify by filtering the `writeFile` call arguments by `archiveName`.

Confirm all new tests fail before proceeding.

#### [ ] Task 4.4: Conduct the order-sensitivity static search and complete test verification

Conduct the static search:

- Read `src/features/agentSessionsArchiving/providers/index.ts` in full. Confirm the only position-referencing logic is the sort step added in Activity 2, which is presentational.
- Read `src/features/agentSessionsArchiving/archiveService.ts` in full. Confirm specifically: `archiveFromProviders()` (the method beginning around line 187) iterates `this.providers` in list order but calls `provider.findSessions(workspacePath)` independently per provider — no index-referencing branch on position; `archiveSession()` (the method beginning around line 221, through the end of its body around line 280) uses `this.lastArchivedMap.get(session.archiveName)` keyed by the `archiveName` string, not by provider position — the fingerprint guard is position-invariant; the `deleteOldArchive` branch (around lines 245–248) fires when `entry.archiveFileName` differs from the new `archiveFileName`, keyed by `session.archiveName` — position-invariant; no logic branches on provider list index, list length, or provider position anywhere in the file.

Record the finding verbatim in "Divergences and notes": `'Order-sensitivity audit complete. No index-referencing or position-referencing branch found in session discovery, workspace matching, deduplication, or archiving. Provider list position influences enumeration sequence only (AC13, AC18 satisfied by construction). Static search conducted on: src/features/agentSessionsArchiving/providers/index.ts (full file); src/features/agentSessionsArchiving/archiveService.ts (full file, specifically archiveFromProviders ~line 187, archiveSession ~lines 221–280, deleteOldArchive branch ~lines 245–248).'`

If an order-sensitive path is found, stop and escalate to the Human before proceeding with the swap-invariance tests.

Run the full quality gate. Confirm the consistency tests (Task 4.2) pass — they read the real artifact and README updated in Activities 1–3 and Task 4.1. Confirm the swap-invariance tests (Task 4.3) pass. Confirm all pre-existing tests remain green and the test count exceeds 1113.

#### [ ] Task 4.5: Verify all 21 AC traces

Verify every SPEC-004 acceptance criterion is covered by at least one passing test. Run `pnpm run test:unit` and confirm zero failures. The AC coverage map:

- AC1: `popularityConsistency.test.ts` (README and runtime both derive from artifact; no second copy; all four regions agree with the single artifact).
- AC2: `popularityScoring.test.ts` (ascending average, tie-break, dense ranking, input-order independence).
- AC3: `popularityScoring.test.ts` (dense ranking, normalization, averaging over possessed signals, magnitude-independence by construction of rank-only scoring).
- AC4: `popularityScoring.test.ts` (`POOL_SIZE_ACKNOWLEDGMENT` constant present); `popularityConsistency.test.ts` (acknowledgment in artifact).
- AC5: `popularityScoring.test.ts` (sole-possessor, all-tied, missing-signal average); `popularitySort.test.ts` (unranked provider deterministic).
- AC6: `refresh-popularity.test.ts` (repeatability; prior signals and source recorded; no-change test).
- AC7: `popularitySort.test.ts` (no network call, no filesystem read of artifact at runtime).
- AC8: `refresh-popularity.test.ts` (repeatability; no-change produces unchanged order).
- AC9: `popularityConsistency.test.ts` (all four generated regions — TABLE, INTRO, FEATURES, COUNT — verified to contain all eight targets in the resolved order; disclaimer, method pointer, refresh period marker present in TABLE region).
- AC10: `popularityData.ts` exports `refreshedAt` and `refreshPeriod` (structural); `popularitySort.test.ts` (sort resolves from fixture without network access even when data is stale — verified by the deliberately stale `refreshedAt: '2025-01-01T00:00:00.000Z'` in the fixture).
- AC11: `test/integration/vitest/bundle-assets.test.ts` `should only have "vscode" and node built-ins as external requires` (enforcing guard confirmed in Activity 2 Task 2.3).
- AC12: `popularityScoring.test.ts` (sole-possessor test — new target with one signal ranks deterministically; missing-signal average test — new target with fewer signals participates without error).
- AC13: `popularitySwapInvariance.test.ts` (identical archive output under natural, reversed, Cline/RooCode swap, and shared-archiveName collision orderings); static search finding in "Divergences and notes".
- AC14: `popularity-refresh.yml` workflow uses `gh pr create --body-file`, never `git push main`; confirmed by reading the workflow file (structural verification — record in "Divergences and notes").
- AC15: `refresh-popularity.test.ts` (non-2xx absent; malformed absent; stale-window absent; zero-floor absent; none abort the run).
- AC16: `popularityData.ts` is a committed source file; each refresh produces a reviewable diff (structural — record in "Divergences and notes").
- AC17: revert of the artifact commit restores the prior order (structural — record in "Divergences and notes").
- AC18: `popularitySwapInvariance.test.ts` (natural vs. reversed; Cline/RooCode swap; shared-archiveName collision; no cross-leakage).
- AC19: `popularityScoring.test.ts` (`resolveOrder` accepts any `TargetSignals[]`; no hard-coded target names in branching logic; input-order-independence test with eight targets generalises to N).
- AC20: `pnpm run refresh:popularity` in `package.json` and `.github/workflows/popularity-refresh.yml` are present (structural — verify by reading the files); `docs/technical-context.md` section documenting the command and CI job (added in Activity 3 Task 3.5).
- AC21: maintenance owner and staleness window documented in `docs/technical-context.md` (Activity 3 Task 3.5); staleness-probe job present in `.github/workflows/popularity-refresh.yml` (Activity 3 Task 3.4).

If any AC lacks a covering test or structural verification, add the missing test or record the structural verification in "Divergences and notes" before proceeding.

#### [ ] Task 4.6: Update impacted documentation

Add a `### Order-sensitivity audit` subsection under the `## Popularity refresh` section in `docs/technical-context.md` recording: the static search finding (no order-sensitive path found), the four swap-invariance scenarios exercised (natural vs. reversed; Cline/RooCode adjacent swap; shared-`archiveName` collision; no cross-provider leakage), and the conclusion (AC13 and AC18 satisfied). Update the `Last updated` field in the `docs/technical-context.md` header.

#### [ ] Task 4.7: Commit changes

Commit: the updated `README.md` (with four generated-region delimiters and eight-target content from Task 4.1 — if not already committed in Task 3.6), `test/unit/features/agentSessionsArchiving/providers/popularityConsistency.test.ts`, `test/unit/features/agentSessionsArchiving/providers/popularitySwapInvariance.test.ts`, and the updated `docs/technical-context.md`. Commit message: `feat(archiving): add README generated regions, consistency gate, swap-invariance tests, and order-sensitivity audit`.

## Divergences and notes

_To be filled during execution._

### Reflection

_To be compiled at StepLedger completion._
