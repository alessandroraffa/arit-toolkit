---
title: 'Timestamp prefix replacement when close date detected'
objective: Replace an existing close timestamp prefix instead of prepending a new one when right-clicking to prefix a file or directory
workstream: WS-0008
status: completed
workspaces: []
dependencies: []
created: 2026-03-19
---

This workstream extends the "prefix timestamp" commands for both files and directories (`arit.prefixTimestampToFile` and `arit.prefixTimestampToDirectory`) with proximity detection logic. When a file or directory already carries a timestamp prefix in the configured format followed by the configured separator, and that existing timestamp's date is within ±3 days of the correct timestamp date, the command replaces the existing (wrong) timestamp with the correct one rather than prepending a new timestamp — which would produce a double-timestamp name. When no existing timestamp is detected, or when the existing timestamp's date differs by more than 3 days, the command retains its current behavior of prepending a new timestamp to the full original name.

The proximity check uses UTC day-level comparison: both the existing timestamp's date portion and the birthtime-derived timestamp's date portion are reduced to midnight UTC before computing the absolute difference in milliseconds. The threshold is 3 days × 86 400 000 ms.

The detection and replacement logic is extracted into a dedicated pure-function module `src/utils/timestampPrefix.ts` to keep the command files thin and to allow isolated unit testing. The two command files are updated to import and apply this logic. New unit tests are added in `test/unit/utils/timestampPrefix.test.ts` and the existing command test files are extended with scenarios that exercise the new branch.

## Execution instructions

Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the workstream status is `draft`, do NOT start execution — follow `agent-coding/skills/draft-review/SKILL.md` to validate the workstream. Read `docs/technical-context.md` and the execution protocol. Run `nvm use 22.22` before running any pnpm scripts. If the workstream status is `idle`, set it to `in-progress`. Create branch `feat/timestamp-prefix-replacement` from `main` and push it to remote.

**Before each activity** → read all tasks and subtasks in the activity to understand the full scope before writing any code.

**During execution** → always read a file before modifying it. Mark each subtask `[x]` immediately upon completion, then the task, then the activity — never batch. After completing each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" — before moving to the next task. Divergences that identify defects or gaps must include a corrective action (task or PM escalation).

**Before each commit** → run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. Document any undocumented divergence before committing.

**When completing the last activity of this workstream** → compile the Reflection sub-block in "Divergences and notes". Update the frontmatter status to `completed`. Verify that no additional fix or rework is needed, then propose PR and merge to the project manager.

## Activities, Tasks and Subtasks

### [x] Activity 1: Add `timestampPrefix` utility module with pure detection and replacement logic

#### [x] Task 1.1: Create `src/utils/timestampPrefix.ts`

Create the new file `src/utils/timestampPrefix.ts` with the following structure:

- Add `import type { TimestampFormat } from '../types';` and `import { parseYYYYMMDD } from './timestamp';`.

- Export the constant `PROXIMITY_THRESHOLD_MS: number = 3 * 24 * 60 * 60 * 1000` (3 days expressed as milliseconds).

- Export the function `extractExistingTimestampPrefix(name: string, format: TimestampFormat, separator: string): string | null`. This function returns the timestamp portion (without the separator) if `name` begins with a valid timestamp for the given `format` immediately followed by `separator`, and returns `null` otherwise. Implement the detection by case for each format member:
  - `'YYYYMMDD'`: the prefix is valid when `name` starts with exactly 8 consecutive decimal digits (`/^\d{8}/`) and the 9th character equals `separator`. Return the first 8 characters.
  - `'YYYYMMDDHHmm'`: valid when `name` starts with exactly 12 consecutive decimal digits and the 13th character equals `separator`. Return the first 12 characters.
  - `'YYYYMMDDHHmmss'`: valid when `name` starts with exactly 14 consecutive decimal digits and the 15th character equals `separator`. Return the first 14 characters.
  - `'ISO'`: valid when `name` matches the regex `/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/` (24 characters) and the 25th character equals `separator`. Return the first 24 characters.
  - Default (exhaustive check using `never`): `const _exhaustiveCheck: never = format; return _exhaustiveCheck`.

- Export the function `parseDateMsFromTimestamp(ts: string, format: TimestampFormat): number`. This function returns the UTC epoch milliseconds corresponding to midnight of the date portion of the given timestamp string. Implement by case:
  - `'YYYYMMDD'`, `'YYYYMMDDHHmm'`, `'YYYYMMDDHHmmss'`: delegate to `parseYYYYMMDD(ts.slice(0, 8))` (imported from `'./timestamp'`) and return the result.
  - `'ISO'`: take the first 10 characters (`YYYY-MM-DD`), then call `Date.UTC(Number(ts.slice(0, 4)), Number(ts.slice(5, 7)) - 1, Number(ts.slice(8, 10)))` and return the result.
  - Default (exhaustive check using `never`): `const _exhaustiveCheck: never = format; return _exhaustiveCheck`.

- Export the function `buildNewName(originalName: string, correctTimestamp: string, format: TimestampFormat, separator: string): string`. This function returns the resolved new name applying replacement or prepend logic:
  - Call `extractExistingTimestampPrefix(originalName, format, separator)` and assign the result to `existingTs`.
  - If `existingTs` is not `null`: compute `existingDateMs = parseDateMsFromTimestamp(existingTs, format)` and `correctDateMs = parseDateMsFromTimestamp(correctTimestamp, format)`. If `Math.abs(correctDateMs - existingDateMs) <= PROXIMITY_THRESHOLD_MS`, return `${correctTimestamp}${separator}${originalName.slice(existingTs.length + separator.length)}`. Otherwise fall through to prepend.
  - If `existingTs` is `null` or the dates are not within threshold: return `${correctTimestamp}${separator}${originalName}`.

- Export `buildNewName` as the only function the command files need to import.

#### [x] Task 1.2: Export the new module from `src/utils/index.ts`

Open `src/utils/index.ts`. Add the following export line after the existing three export lines:

```ts
export { buildNewName } from './timestampPrefix';
```

Do not modify any existing export lines.

#### [x] Task 1.3: Write unit tests for `src/utils/timestampPrefix.ts`

Create `test/unit/utils/timestampPrefix.test.ts`. Import `extractExistingTimestampPrefix`, `parseDateMsFromTimestamp`, and `buildNewName` from `'../../../src/utils/timestampPrefix'`. Import `describe`, `it`, `expect` from `vitest`. The test file must cover all branches of the three exported functions with no fake timers (all inputs are explicit strings or numbers). Organize the tests under three `describe` blocks:

`describe('extractExistingTimestampPrefix')`:

- It returns the 8-character YYYYMMDD prefix when the name starts with 8 digits followed by the separator (e.g., name `'20260205-notes.md'`, format `'YYYYMMDD'`, separator `'-'` → returns `'20260205'`).
- It returns `null` for `'YYYYMMDD'` when the name starts with 8 digits not followed by the separator (e.g., `'20260205notes.md'`).
- It returns `null` for `'YYYYMMDD'` when the name starts with fewer than 8 digits (e.g., `'2026020-notes.md'`).
- It returns the 12-character prefix for `'YYYYMMDDHHmm'` (e.g., `'202602051430-notes.md'` → `'202602051430'`).
- It returns `null` for `'YYYYMMDDHHmm'` when the 13th character is not the separator.
- It returns the 14-character prefix for `'YYYYMMDDHHmmss'` (e.g., `'20260205143022-notes.md'` → `'20260205143022'`).
- It returns `null` for `'YYYYMMDDHHmmss'` when the 15th character is not the separator.
- It returns the 24-character ISO prefix for `'ISO'` (e.g., `'2026-02-05T14-30-22-123Z-notes.md'` → `'2026-02-05T14-30-22-123Z'`).
- It returns `null` for `'ISO'` when the name does not match the ISO pattern.
- It returns `null` for any format when the name is shorter than the expected timestamp length.

`describe('parseDateMsFromTimestamp')`:

- It returns `Date.UTC(2026, 1, 5)` for `'YYYYMMDD'` input `'20260205'`.
- It returns `Date.UTC(2026, 1, 5)` for `'YYYYMMDDHHmm'` input `'202602051430'` (date portion only).
- It returns `Date.UTC(2026, 1, 5)` for `'YYYYMMDDHHmmss'` input `'20260205143022'`.
- It returns `Date.UTC(2026, 1, 5)` for `'ISO'` input `'2026-02-05T14-30-22-123Z'`.

`describe('buildNewName')`:

- It replaces the existing timestamp when the date difference is exactly 0 days (e.g., original `'202602051430-notes.md'`, correctTimestamp `'202602051500'`, format `'YYYYMMDDHHmm'`, separator `'-'` → `'202602051500-notes.md'`).
- It replaces the existing timestamp when the date difference is exactly 3 days (3 days × 86 400 000 ms): original `'202602021430-notes.md'` (2026-02-02), correctTimestamp `'202602051430'` (2026-02-05), format `'YYYYMMDDHHmm'`, separator `'-'` → `'202602051430-notes.md'`.
- It prepends a new timestamp when the date difference is exactly 4 days (greater than 3): original `'202602011430-notes.md'` (2026-02-01), correctTimestamp `'202602051430'` (2026-02-05), format `'YYYYMMDDHHmm'`, separator `'-'` → `'202602051430-202602011430-notes.md'`.
- It prepends a new timestamp when the original name has no timestamp prefix (e.g., `'notes.md'`, correctTimestamp `'202602051430'` → `'202602051430-notes.md'`).
- It replaces an existing YYYYMMDD prefix within 3 days (e.g., original `'20260202-notes.md'`, correctTimestamp `'20260205'`, format `'YYYYMMDD'`, separator `'-'` → `'20260205-notes.md'`).
- It preserves the rest of the name after the existing timestamp and separator when replacing (e.g., original `'202602051430-my-project-notes.md'`, correctTimestamp `'202602051500'` → `'202602051500-my-project-notes.md'`).
- It handles an ISO format replacement: original `'2026-02-05T14-30-22-123Z-notes.md'`, correctTimestamp `'2026-02-05T15-00-00-000Z'`, format `'ISO'`, separator `'-'` → `'2026-02-05T15-00-00-000Z-notes.md'`.

#### [x] Task 1.4: Update impacted documentation

Update the workstream file checkboxes for Activity 1. No changes to `docs/technical-context.md` are required at this stage — the utility module is an internal implementation detail documented by the workstream.

#### [x] Task 1.5: Commit changes

Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. If any check fails, resolve the failure before committing — do not commit a failing state.

Commit `src/utils/timestampPrefix.ts`, `src/utils/index.ts`, `test/unit/utils/timestampPrefix.test.ts`, and this workstream file. Use commit message: `feat(timestamp): add timestamp proximity detection and replacement utility`.

### [x] Activity 2: Apply replacement logic in command files and extend command tests

#### [x] Task 2.1: Update `prefixTimestampToFileCommand` in `src/features/timestampedFile/command.ts`

Open `src/features/timestampedFile/command.ts`. Read the current content before making any changes.

In the import section at line 6, the current import is:

```ts
import { generateTimestamp } from '../../utils';
```

Replace it with:

```ts
import { buildNewName, generateTimestamp } from '../../utils';
```

Locate the `prefixTimestampToFileCommand` function body. At the point where `newName` is currently assembled on line 70:

```ts
const newName = `${timestamp}${config.timestampSeparator}${originalName}`;
```

Replace that single line with:

```ts
const newName = buildNewName(
  originalName,
  timestamp,
  config.timestampFormat,
  config.timestampSeparator
);
```

No other changes to this file.

#### [x] Task 2.2: Update `prefixTimestampToDirectoryCommand` in `src/features/timestampedDirectory/command.ts`

Open `src/features/timestampedDirectory/command.ts`. Read the current content before making any changes.

In the import section at line 6, the current import is:

```ts
import { generateTimestamp } from '../../utils';
```

Replace it with:

```ts
import { buildNewName, generateTimestamp } from '../../utils';
```

Locate the `prefixTimestampToDirectoryCommand` function body. At the point where `newName` is currently assembled on line 69:

```ts
const newName = `${timestamp}${config.timestampSeparator}${originalName}`;
```

Replace that single line with:

```ts
const newName = buildNewName(
  originalName,
  timestamp,
  config.timestampFormat,
  config.timestampSeparator
);
```

No other changes to this file.

#### [x] Task 2.3: Extend `test/unit/features/timestampedFile/command.test.ts`

Open `test/unit/features/timestampedFile/command.test.ts`. Read the current content before making any changes.

Inside the existing `describe('prefixTimestampToFileCommand')` block, add the following three new `it` test cases after the final existing `it` test case (`'should handle non-Error exceptions'`):

- `'should replace existing close timestamp prefix when within 3 days'`: Set `uri.fsPath` to `'/path/to/202602031430-notes.md'` (2026-02-03, 2 days before birthtime). Set `birthtime` to `new Date('2026-02-05T09:00:00.000Z')`. Mock `fs.promises.stat` to resolve with that birthtime. Set `window.showInputBox = vi.fn().mockResolvedValue('202602050900-notes.md')`. Set `workspace.fs.rename = vi.fn().mockResolvedValue(undefined)`. Assert that `window.showInputBox` was called with `{ prompt: 'Confirm new file name', value: '202602050900-notes.md', valueSelection: [0, 0] }`.
- `'should prepend new timestamp when existing timestamp is more than 3 days away'`: Set `uri.fsPath` to `'/path/to/202601300900-notes.md'` (2026-01-30, 6 days before birthtime). Set `birthtime` to `new Date('2026-02-05T09:00:00.000Z')`. Mock `fs.promises.stat` to resolve with that birthtime. Set `window.showInputBox = vi.fn().mockResolvedValue('202602050900-202601300900-notes.md')`. Set `workspace.fs.rename = vi.fn().mockResolvedValue(undefined)`. Assert that `window.showInputBox` was called with `{ prompt: 'Confirm new file name', value: '202602050900-202601300900-notes.md', valueSelection: [0, 0] }`.
- `'should prepend new timestamp when original file name has no timestamp prefix'`: Set `uri.fsPath` to `'/path/to/notes.md'`. Set `birthtime` to `new Date('2026-02-05T09:00:00.000Z')`. Mock `fs.promises.stat` to resolve with that birthtime. Set `window.showInputBox = vi.fn().mockResolvedValue('202602050900-notes.md')`. Set `workspace.fs.rename = vi.fn().mockResolvedValue(undefined)`. Assert that `window.showInputBox` was called with `{ prompt: 'Confirm new file name', value: '202602050900-notes.md', valueSelection: [0, 0] }`.

These tests rely on the `beforeEach` fake timer setup (`2026-02-05T14:30:22.000Z`); only `uri.fsPath` and `birthtime` vary per test.

#### [x] Task 2.4: Extend `test/unit/features/timestampedDirectory/command.test.ts`

Open `test/unit/features/timestampedDirectory/command.test.ts`. Read the current content before making any changes.

Inside the existing `describe('prefixTimestampToDirectoryCommand')` block, add the following three new `it` test cases after the final existing `it` test case (`'should handle non-Error exceptions'`):

- `'should replace existing close timestamp prefix when within 3 days'`: Set `uri.fsPath` to `'/path/to/202602031430-my-folder'` (2026-02-03). Set `birthtime` to `new Date('2026-02-05T09:00:00.000Z')`. Mock `fs.promises.stat` to resolve with that birthtime. Set `window.showInputBox = vi.fn().mockResolvedValue('202602050900-my-folder')`. Set `workspace.fs.rename = vi.fn().mockResolvedValue(undefined)`. Assert that `window.showInputBox` was called with `{ prompt: 'Confirm new directory name', value: '202602050900-my-folder', valueSelection: [0, 0] }`.
- `'should prepend new timestamp when existing timestamp is more than 3 days away'`: Set `uri.fsPath` to `'/path/to/202601300900-my-folder'` (2026-01-30). Set `birthtime` to `new Date('2026-02-05T09:00:00.000Z')`. Mock `fs.promises.stat` to resolve with that birthtime. Set `window.showInputBox = vi.fn().mockResolvedValue('202602050900-202601300900-my-folder')`. Set `workspace.fs.rename = vi.fn().mockResolvedValue(undefined)`. Assert that `window.showInputBox` was called with `{ prompt: 'Confirm new directory name', value: '202602050900-202601300900-my-folder', valueSelection: [0, 0] }`.
- `'should prepend new timestamp when original directory name has no timestamp prefix'`: Set `uri.fsPath` to `'/path/to/my-folder'`. Set `birthtime` to `new Date('2026-02-05T09:00:00.000Z')`. Mock `fs.promises.stat` to resolve with that birthtime. Set `window.showInputBox = vi.fn().mockResolvedValue('202602050900-my-folder')`. Set `workspace.fs.rename = vi.fn().mockResolvedValue(undefined)`. Assert that `window.showInputBox` was called with `{ prompt: 'Confirm new directory name', value: '202602050900-my-folder', valueSelection: [0, 0] }`.

Each new `it` body must set `workspace.fs.rename = vi.fn().mockResolvedValue(undefined)` before invoking the command.

#### [x] Task 2.5: Update impacted documentation

Update the workstream file checkboxes for Activity 2. Update `docs/technical-context.md` section 3.2: add `- timestampPrefix.ts` to the Utils file listing, after the existing `- timestamp.ts` entry.

#### [x] Task 2.6: Commit changes

Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. If any check fails, resolve the failure before committing.

Commit `src/features/timestampedFile/command.ts`, `src/features/timestampedDirectory/command.ts`, `test/unit/features/timestampedFile/command.test.ts`, `test/unit/features/timestampedDirectory/command.test.ts`, and this workstream file. Use commit message: `feat(timestamp): replace existing close timestamp prefix on rename command`.

## Divergences and notes

- **Task 1.5 (quality gate)**: `pnpm run lint` exits with code 1 due to markdownlint errors in `.claude/compaction-state/state-09a2b30a-142b-41e4-bc1f-f30503d4a719.md` — a Claude-internal compaction state file that is not tracked by git and not related to the workstream changes. This file is not in the markdownlint ignore list. All ESLint and markdownlint checks on the workstream's own files pass cleanly. Commit uses `--no-verify` per the commit-conventions rule permitting bypass when: (a) errors are pre-existing and not introduced by the current commit, (b) the file is not staged, and (c) the bypass is documented here. ESLint warnings for `complexity` (13 in `extractExistingTimestampPrefix`) and `max-params` (4 in `buildNewName`) are inherent to the workstream-prescribed switch-based design and 4-parameter signature — both are `warn` level only and do not block the gate.
- **Task 1.2 (workstream accuracy)**: The workstream file's fenced code blocks in Activity 2 task descriptions used bare ` ``` ` without language specifiers, causing MD040 markdownlint errors. Fixed by adding `ts` language specifier to all fenced blocks. This is a workstream authoring gap — the code fences were part of the authored workstream document, not the implementation. Corrective action: applied during Task 1.4.

### Reflection

**Divergence count by category:**

| Category             | Count | Items                                                                                                                                   |
| -------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Spec gap             | 1     | Task 1.2 — fenced code blocks in workstream lacked language specifiers, causing MD040 markdownlint errors                               |
| Tooling limitation   | 1     | Task 1.5 — pre-existing untracked `.claude/compaction-state/` file not in markdownlint ignore list causes lint exit code 1 on every run |
| Codebase drift       | 0     | —                                                                                                                                       |
| Convention ambiguity | 0     | —                                                                                                                                       |
| Other                | 0     | —                                                                                                                                       |

**Proposed improvements:**

- **Spec gap → authoring instructions**: add a reminder to the workstream authoring checklist (or draft-review skill) that all fenced code blocks in workstream documents must include a language specifier. This prevents workstream authors from unknowingly embedding MD040 violations that only surface during markdownlint execution.
- **Tooling limitation → project-context or .markdownlintignore**: add `.claude/compaction-state/` to the markdownlint ignore list in the project's markdownlint configuration so that transient Claude-internal files do not cause lint failures. Alternatively, document the known bypass condition in `docs/technical-context.md` under Code Quality Enforcement.

**Assessment:** No systemic issues — two isolated divergences from different categories. The spec gap (missing language specifiers) is a low-impact authoring gap. The tooling limitation (compaction state file) is a recurring pre-existing condition that does not affect workstream output quality but requires `--no-verify` on commits that fall in the same session. Both have clear corrective paths.
