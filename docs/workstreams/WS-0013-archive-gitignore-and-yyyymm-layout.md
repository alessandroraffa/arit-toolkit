---
title: 'Archive gitignore prompt and YYYY/MM directory layout'
objective: Add a git-aware gitignore prompt when the archive path is activated or changed, and reorganize archive files into YYYY/MM subdirectories with an idempotent migration sweep of any pre-existing flat layout.
workstream: WS-0013
status: 'in-progress'
workspaces: []
dependencies: []
created: 2026-05-25
---

Both changes govern the same lifecycle surface — the `agentSessionsArchiving` feature's archive path — and share a common activation/reconfigure code path, making a single workstream the correct unit of delivery. Feature A introduces a git-aware prompt: when the archive feature is activated for the first time or when the user changes `archivePath`, the extension checks whether the workspace is a git repository and, if so, whether `archivePath` is already git-ignored. When it is not ignored and the user has not yet made a decision for that path, the extension presents a VS Code information message asking the user to add the path to `.gitignore`. The decision is stored per-path in a new sparse `gitignoreDecisions` field on `AgentSessionsArchivingConfig`, so that changing `archivePath` triggers a fresh evaluation while an unchanged path is never re-prompted. Feature B reorganizes the archive directory from a flat layout (`archivePath/YYYYMMDDHHmm-{archiveName}.{ext}`) into year/month subdirectories (`archivePath/YYYY/MM/YYYYMMDDHHmm-{archiveName}.{ext}`), where `YYYY` and `MM` are derived by extracting `substring(0,4)` and `substring(4,6)` from the existing `generateTimestamp('YYYYMMDDHHmm', ...)` result. The `lastArchivedMap` entries are updated to store the relative path including the year/month prefix so that all downstream delete/replace operations continue to resolve via `vscode.Uri.joinPath(archiveUri, entry.archiveFileName)` without change. `deduplicateAndHydrate` is extended to scan year/month subdirectories in addition to the top level. `moveArchive` is extended to recurse one level into existing YYYY directories. An idempotent migration sweep, folded into `deduplicateAndHydrate`, runs on every cold start and after every `reconfigure` (it is a no-op once the tree is fully migrated). On each invocation it moves any flat-layout files found at the top level of `archivePath` into the correct `YYYY/MM/` subdirectory, logging each move and leaving any file that fails to copy in place without aborting the rest of the migration.

## Execution instructions

> Re-read this section at the start of every execution session. Each trigger fires when its condition is met. For the full protocol, see `execution-protocol skill`.

**When starting a session on this workstream** → if the workstream status is `draft`, do NOT start execution — follow `agent-coding/operational-framework/skills/draft-review/SKILL.md` to validate the workstream. If the workstream status is `deferred`, do NOT start execution — wait for the PM to move it back to `draft` or `idle`. If the workstream status is `canceled`, do NOT start execution — it is terminal. If the workstream status is `failed`, do NOT start execution — return to the PM because a lifecycle decision is required before any resume attempt. Read the workstream introduction and objective, `docs/technical-context.md`, and the execution protocol. Run `nvm use 22.22` before running any pnpm scripts. If the workstream status is `idle`, set it to `in-progress`. Create branch `feat/agent-sessions-gitignore-and-yyyymm-layout` from `main` and push it to remote.

**Before each activity** → read all tasks and subtasks in the activity to understand the full scope before writing any code.

**During execution** → always read a file before modifying it. Mark each subtask `[x]` immediately upon completion, then the task, then the activity — never batch. After completing each task, compare the implementation against the task description and record any divergence immediately in "Divergences and notes" — before moving to the next task. Divergences that identify defects or gaps must include a corrective action (task or PM escalation).

**Before each commit** → verify functional coherence: every entry point introduced by the commit must be functional, not just compilable. Verify pattern compliance: every new function follows the same error handling and logging patterns as adjacent functions in the same file. Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. Document any undocumented divergence before committing.

**When completing the last activity of this workstream** → compile the Reflection sub-block in "Divergences and notes" (see `execution-protocol skill`, During Execution, step 10). Update the frontmatter status to `completed`. Verify that no additional fix or rework is needed, then propose PR and merge to the project manager.

## Activities, Tasks and Subtasks

### [x] Activity 1: Add `isGitRepository`, gitignore-prompt utility, config-type extension, and activation wiring

#### [x] Task 1.1: Add `isGitRepository` to `src/core/git.ts`

Read `src/core/git.ts` in full before making any change.

- [x] Add the following exported async function after the closing brace of `isGitIgnored` (after line 29):

  ```typescript
  /**
   * Returns true if the given directory is inside a git repository.
   * Returns false when git is unavailable or the directory is not a git repo.
   */
  export async function isGitRepository(cwd: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd });
      return true;
    } catch {
      return false;
    }
  }
  ```

- [x] Verify that `execFileAsync` is already in scope at the module level (it is defined at line 4 as `const execFileAsync = promisify(execFile);`). No additional import is needed.

#### [x] Task 1.2: Extend `AgentSessionsArchivingConfig` with `gitignoreDecisions`

Read `src/types/index.ts` in full before making any change.

- [x] In `src/types/index.ts`, locate the `AgentSessionsArchivingConfig` interface (lines 27–32). Add one optional field after `ignoreSessionsBefore?`:

  ```typescript
  gitignoreDecisions?: Record<string, 'ignored' | 'declined'>;
  ```

  The resulting interface is:

  ```typescript
  export interface AgentSessionsArchivingConfig {
    enabled: boolean;
    archivePath: string;
    intervalMinutes: number;
    ignoreSessionsBefore?: string;
    gitignoreDecisions?: Record<string, 'ignored' | 'declined'>;
  }
  ```

- [x] Do NOT add `gitignoreDecisions` to the `defaultValue` object in `src/features/agentSessionsArchiving/index.ts`. The field is sparse: its absence means no decisions have been recorded yet. The `exactOptionalPropertyTypes` compiler flag is satisfied because the field is declared as optional (`?`) and callers that read it use `config.gitignoreDecisions ?? {}` to produce a defined value.

#### [x] Task 1.3: Create `src/features/agentSessionsArchiving/archivePathValidation.ts` and `gitignorePrompt.ts`

This task creates two new files: the validator utility (`archivePathValidation.ts`) and the gitignore prompt module (`gitignorePrompt.ts`). The validator is introduced here because both feature files (`gitignorePrompt.ts` in Activity 1 and the modified `archiveService.ts` methods in Activity 3) consume `archivePath` and must validate it at every use site. Placing the validator in a neutral sibling file keeps `archiveService.ts` decoupled from the gitignore module.

- [x] Create new file `src/features/agentSessionsArchiving/archivePathValidation.ts` with the following content:

  ```typescript
  export interface ArchivePathValidation {
    readonly valid: boolean;
    readonly reason?: string;
  }

  const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/;
  const GLOB_CHARS_RE = /[*?[\]]/;
  const PARENT_TRAVERSAL_RE = /(^|\/)\.\.($|\/)/;
  const WINDOWS_ABSOLUTE_RE = /^[A-Za-z]:[\\/]/;
  const MAX_LENGTH = 1024;

  export function validateArchivePath(archivePath: string): ArchivePathValidation {
    if (typeof archivePath !== 'string') {
      return { valid: false, reason: 'not a string' };
    }
    const trimmed = archivePath.trim();
    if (trimmed.length === 0) {
      return { valid: false, reason: 'empty path' };
    }
    if (trimmed !== archivePath) {
      return { valid: false, reason: 'leading or trailing whitespace' };
    }
    if (trimmed.length > MAX_LENGTH) {
      return { valid: false, reason: `exceeds ${String(MAX_LENGTH)} characters` };
    }
    if (CONTROL_CHARS_RE.test(trimmed)) {
      return { valid: false, reason: 'contains control characters' };
    }
    if (trimmed.startsWith('#') || trimmed.startsWith('!')) {
      return { valid: false, reason: 'must not start with "#" or "!"' };
    }
    if (GLOB_CHARS_RE.test(trimmed)) {
      return { valid: false, reason: 'must not contain glob metacharacters (* ? [ ])' };
    }
    if (trimmed.startsWith('/') || WINDOWS_ABSOLUTE_RE.test(trimmed)) {
      return { valid: false, reason: 'must be workspace-relative (not absolute)' };
    }
    if (PARENT_TRAVERSAL_RE.test(trimmed)) {
      return { valid: false, reason: 'must not contain ".." path segments' };
    }
    return { valid: true };
  }
  ```

  Rationale for each rule:
  - **Type guard**: defensive against runtime values that bypass the TypeScript signature (e.g., parsed JSONC with unexpected types).
  - **Non-empty / no surrounding whitespace**: an empty or whitespace path would resolve to the workspace root.
  - **Length cap**: 1024 chars matches common filesystem path limits and prevents pathological inputs.
  - **No control chars**: `\n`/`\r`/`\0`/`\t` would corrupt `.gitignore` and filesystem operations.
  - **No leading `#` or `!`**: in `.gitignore`, `#` introduces a comment and `!` negates a previous pattern — the entry would not ignore the intended path.
  - **No glob metacharacters**: `*`/`?`/`[`/`]` make `.gitignore` patterns match more than the literal path and also create ambiguity in filesystem path resolution.
  - **Workspace-relative only**: absolute paths bypass `workspaceRootUri` joining and would write outside the workspace.
  - **No parent traversal**: `..` segments escape the workspace.

  `archivePath = 'docs/archive/agent-sessions'` (the default in `constants.ts`) passes all rules.

**`gitignorePrompt.ts`** — second new file in this task. Create `src/features/agentSessionsArchiving/gitignorePrompt.ts` with the following content. Every decision listed here is resolved; the executor must implement exactly this logic.

- [x] The file exports one async function: `checkAndPromptGitignore(archivePath: string, workspaceRootUri: vscode.Uri, config: AgentSessionsArchivingConfig, logger: Logger, updateConfig: (patch: Partial<AgentSessionsArchivingConfig>) => Promise<void>): Promise<void>`.
- [x] Step 0 — Validate `archivePath`. Call `const validation = validateArchivePath(archivePath);`. If `!validation.valid`, log at `warn` level: `` `Skipped gitignore prompt — invalid archivePath "${archivePath}": ${validation.reason ?? 'unknown'}` `` and return. The validation runs BEFORE the git-repo check so an invalid path never reaches any I/O.
- [x] Step 1 — Early exits: if the workspace is not a git repository (`isGitRepository(workspaceRootUri.fsPath)` returns `false`), log at `debug` level: `'Skipped gitignore prompt — workspace is not a git repository'` and return.
- [x] Step 2 — Decision memory: read `existing = config.gitignoreDecisions ?? {}`. If `existing[archivePath]` is defined (`'ignored'` or `'declined'`), log at `debug` level: `` `Skipped gitignore prompt for ${archivePath} — decision already recorded: ${existing[archivePath]}` `` and return.
- [x] Step 3 — Already ignored: call `isGitIgnored(archivePath, workspaceRootUri.fsPath)`. If it returns `true`, record the decision by calling `updateConfig({ gitignoreDecisions: { ...existing, [archivePath]: 'ignored' } })` and return. Do not prompt the user.
- [x] Step 4 — Prompt and act on the user response. Implement exactly the following body (the `try/catch` around `writeGitignoreEntry` is mandatory — without it a `writeFile` failure becomes an unhandled rejection):

  ```typescript
  const response = await vscode.window.showInformationMessage(
    `Tangyr Workbench: Add "${archivePath}" to .gitignore?`,
    'Add to .gitignore',
    'Skip'
  );
  if (response === 'Add to .gitignore') {
    try {
      await writeGitignoreEntry(archivePath, workspaceRootUri, logger);
      await updateConfig({
        gitignoreDecisions: { ...existing, [archivePath]: 'ignored' },
      });
    } catch (err) {
      logger.warn(`Failed to write .gitignore entry for ${archivePath}: ${String(err)}`);
      // intentionally do NOT call updateConfig — the prompt re-appears next session
    }
  } else if (response === 'Skip') {
    // Explicit user choice: record sticky decline so the prompt does not re-appear.
    await updateConfig({
      gitignoreDecisions: { ...existing, [archivePath]: 'declined' },
    });
  } else {
    // response is undefined — the dialog was dismissed (X-close, ESC, focus loss, etc.).
    // Dismissal is intentionally NOT recorded: it is treated as "no decision yet" so
    // the prompt re-appears on the next activation. Rationale: an accidental dismiss
    // must not silently bind the user to a sticky 'declined' state for that archivePath.
    logger.debug(
      `Gitignore prompt dismissed for ${archivePath} — no decision recorded; will re-prompt next activation`
    );
  }
  ```

- [x] Add an **exported** helper `export async function writeGitignoreEntry(archivePath: string, workspaceRootUri: vscode.Uri, logger: Logger): Promise<void>`. The function is exported (not file-private) so that Task 1.5 can unit-test the defensive validator path directly. The entry written is the path line only (no surrounding comment). The body:
  - Defensively re-validate `archivePath` as the first statement of the body:

    ```typescript
    const v = validateArchivePath(archivePath);
    if (!v.valid) {
      throw new Error(`Invalid archivePath: ${v.reason ?? 'unknown'}`);
    }
    ```

    This is a defense-in-depth check that complements `checkAndPromptGitignore` Step 0 — the helper may be called from other code paths in the future and must never write an unvalidated value to `.gitignore`. The throw is caught by the `try/catch` block in `checkAndPromptGitignore` Step 4 (logged at warn, decision not recorded).

  - Compute `gitignoreUri = vscode.Uri.joinPath(workspaceRootUri, '.gitignore')`.
  - Attempt to read existing content: `let existing = ''; try { const bytes = await vscode.workspace.fs.readFile(gitignoreUri); existing = new TextDecoder().decode(bytes); } catch { /* file does not exist */ }`.
  - Build the entry line: `const entryLine = \`${archivePath}/\``.
  - Define the provenance comment line as a module-level constant at the top of `gitignorePrompt.ts` (outside the function body so it can be referenced from both the writer and the duplicate-detection check, and so future maintainers find it in one place):

    ```typescript
    const GITIGNORE_COMMENT = '# Managed by Tangyr Workbench (agent sessions archive)';
    ```

  - Check if the entry is already present literally — the duplicate-detection check examines ONLY the path line (the comment may have been edited or removed by the user; we do not require it to be present for the entry to be considered "already there"):

    ```typescript
    if (existing.split('\n').some((line) => line.trim() === entryLine)) {
      logger.debug(`Entry "${entryLine}" already present in .gitignore`);
      return;
    }
    ```

  - Build the content to append. The block is `<comment>\n<entryLine>\n` (two lines), with a single leading newline prepended when the existing file is non-empty and does not already end with a newline:

    ```typescript
    const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n');
    const toWrite = `${needsLeadingNewline ? '\n' : ''}${GITIGNORE_COMMENT}\n${entryLine}\n`;
    ```

  - Compute the new full content: `const newContent = existing + toWrite`.
  - Write: `await vscode.workspace.fs.writeFile(gitignoreUri, new TextEncoder().encode(newContent))`.
  - Log at `info` level: `` `Added "${entryLine}" to .gitignore` ``.

- [x] Imports required at the top of `gitignorePrompt.ts`: `import * as vscode from 'vscode';`, `import type { AgentSessionsArchivingConfig } from '../../types';`, `import type { Logger } from '../../core/logger';`, `import { isGitRepository, isGitIgnored } from '../../core/git';`, `import { validateArchivePath } from './archivePathValidation';`.

#### [x] Task 1.4: Wire `checkAndPromptGitignore` into the activation branch in `index.ts`

Read `src/features/agentSessionsArchiving/index.ts` in full before making any change.

- [x] Add the import at the top of `src/features/agentSessionsArchiving/index.ts`: `import { checkAndPromptGitignore } from './gitignorePrompt';`.
- [x] Inside the `stateManager.onDidChangeState` callback (lines 100–111), locate the `if (globalEnabled && config?.enabled)` branch (line 104). After `service.start(config);` and `watcher.start(workspaceRoot.fsPath);`, add:

  ```typescript
  void checkAndPromptGitignore(
    config.archivePath,
    workspaceRoot,
    config,
    ctx.logger,
    async (patch) => {
      const current = stateManager.getConfigSection(CONFIG_KEY) as
        | AgentSessionsArchivingConfig
        | undefined;
      if (!current) {
        return;
      }
      await stateManager.updateConfigSection(CONFIG_KEY, { ...current, ...patch });
    }
  );
  ```

- [x] The `updateConfig` callback re-fetches the latest persisted config via `stateManager.getConfigSection(CONFIG_KEY)` instead of closing over the `config` snapshot from the enclosing handler. `ExtensionStateManager.updateConfigSection` performs a `set` (no internal merge) — it writes the value passed in as the section's full content. Closing over the captured `config` snapshot and spreading it (`{ ...config, ...patch }`) would clobber any user-driven change to unrelated fields (e.g. `intervalMinutes`) that happened between handler invocation and prompt resolution. Re-fetching at callback time ensures the patch is applied to the latest state. If the section has been removed between handler invocation and callback execution (rare), the callback returns silently without writing.

#### [x] Task 1.5: Add unit tests for `isGitRepository`, `validateArchivePath`, and `gitignorePrompt`

Read `test/unit/core/git.test.ts` and `test/unit/features/agentSessionsArchiving/index.test.ts` in full before making any change.

- [x] Create new file `test/unit/features/agentSessionsArchiving/archivePathValidation.test.ts`. The file imports `{ validateArchivePath }` from `'../../../../src/features/agentSessionsArchiving/archivePathValidation'`. Test cases inside `describe('validateArchivePath', ...)`:
  - **Valid input**: `'docs/archive/agent-sessions'` → `{ valid: true }`. Repeat with other realistic paths: `'archive'`, `'data/2026/sessions'`, `'a/b/c'`. All return `{ valid: true }`.
  - **Type guard**: pass `null as any` and `undefined as any` and `123 as any` — each returns `{ valid: false, reason: 'not a string' }`.
  - **Empty path**: `''` → `{ valid: false, reason: 'empty path' }`. `'   '` (whitespace-only) → `{ valid: false, reason: 'empty path' }` (note: `.trim()` reduces whitespace-only to empty, which is matched by the empty-path branch).
  - **Leading/trailing whitespace**: `' docs/archive'` → `{ valid: false, reason: 'leading or trailing whitespace' }`. Same for `'docs/archive '` and `'\ttext'`.
  - **Too long**: a string of 1025 `'a'` characters → `{ valid: false, reason: 'exceeds 1024 characters' }`.
  - **Control characters**: `'docs/archive\nfoo'` → `{ valid: false, reason: 'contains control characters' }`. Same for `'a\rb'`, `'a\0b'`, `'a\tb'`.
  - **Leading `#`**: `'# comment'` → `{ valid: false, reason: 'must not start with "#" or "!"' }`. Same for `'#archive'`.
  - **Leading `!`**: `'!archive'` → `{ valid: false, reason: 'must not start with "#" or "!"' }`.
  - **Glob metacharacters**: `'docs/*'` → `{ valid: false, reason: 'must not contain glob metacharacters (* ? [ ])' }`. Same for `'a?b'`, `'a[b'`, `'a]b'`.
  - **Absolute paths**: `'/abs/path'` → `{ valid: false, reason: 'must be workspace-relative (not absolute)' }`. Same for `'C:\\path'`, `'C:/path'`, `'d:\\path'`.
  - **Parent traversal**: `'../escape'` → `{ valid: false, reason: 'must not contain ".." path segments' }`. Same for `'a/../b'`, `'a/b/..'`, `'..'`.
  - **Edge cases that should pass**: `'..hidden'` (segment starts with `..` but is NOT exactly `..`) → `{ valid: true }`. `'archive.md'` (contains `.`) → `{ valid: true }`. `'a..b'` (double dot inside segment) → `{ valid: true }`.

- [x] In `test/unit/core/git.test.ts`, append a new `describe('isGitRepository', ...)` block at the end of the file (after the existing `describe('hasGitChanges', ...)` block, which extends through line 355 — the current EOF). The block contains four test cases:
  - `'should return true when workspace is a git repository (exit code 0)'`: `mockExecFile` calls callback with `(null, '.git\n', '')`. Assert `result` is `true`. The mock call receives `['rev-parse', '--git-dir']` as `args`.
  - `'should return false when not a git repository (exit code 128)'`: `mockExecFile` calls callback with `err` where `err.code = 128`. Assert `result` is `false`.
  - `'should return false when git is not installed (ENOENT)'`: `mockExecFile` calls callback with `err` where `err.code = 'ENOENT'`. Assert `result` is `false`.
  - `'should return false on any other error'`: `mockExecFile` calls callback with a generic `new Error('unknown')`. Assert `result` is `false`.
- [x] Create new file `test/unit/features/agentSessionsArchiving/gitignorePrompt.test.ts`. The file mocks `src/core/git` and `vscode` in the same pattern as `index.test.ts` uses `vi.hoisted` and `vi.mock`. Structure:
  - Mock `isGitRepository` and `isGitIgnored` from `'../../../src/core/git'` using `vi.mock` and `vi.fn()`.
  - Mock `vscode` (`window.showInformationMessage`, `workspace.fs.readFile`, `workspace.fs.writeFile`) using `{ window, workspace }` from `'../../mocks/vscode'`.
  - Import `checkAndPromptGitignore` from `'../../../../src/features/agentSessionsArchiving/gitignorePrompt'`.
  - Declare `mockUpdateConfig = vi.fn()` and a base `mockConfig: AgentSessionsArchivingConfig = { enabled: true, archivePath: 'docs/archive/agent-sessions', intervalMinutes: 5 }` and `workspaceRootUri = { fsPath: '/workspace' } as any`.
  - Test cases inside `describe('checkAndPromptGitignore', ...)`:
    - `'should return without prompting when workspace is not a git repository'`: `isGitRepository` resolves `false`. Call `checkAndPromptGitignore(...)`. Assert `window.showInformationMessage` was NOT called.
    - `'should return without prompting when decision is already recorded as ignored'`: `isGitRepository` resolves `true`. Config has `gitignoreDecisions: { 'docs/archive/agent-sessions': 'ignored' }`. Assert `window.showInformationMessage` was NOT called.
    - `'should return without prompting when decision is already recorded as declined'`: same as above but `'declined'`. Assert `window.showInformationMessage` was NOT called.
    - `'should record decision as ignored without prompting when path is already git-ignored'`: `isGitRepository` resolves `true`, `isGitIgnored` resolves `true`. Assert `window.showInformationMessage` was NOT called. Assert `mockUpdateConfig` was called with an object whose `gitignoreDecisions` contains `'docs/archive/agent-sessions': 'ignored'`.
    - `'should write .gitignore entry and record decision when user accepts'`: `isGitRepository` resolves `true`, `isGitIgnored` resolves `false`. `window.showInformationMessage` resolves `'Add to .gitignore'`. `workspace.fs.readFile` rejects (file does not exist). `workspace.fs.writeFile` resolves. Assert `workspace.fs.writeFile` was called once. Capture the written content (decode the `Uint8Array` argument with `new TextDecoder().decode(...)`) and assert it equals exactly `'# Managed by Tangyr Workbench (agent sessions archive)\ndocs/archive/agent-sessions/\n'` — verifying both the provenance comment and the path entry are present in the expected order with the expected newlines. Assert `mockUpdateConfig` was called with `gitignoreDecisions` containing `'docs/archive/agent-sessions': 'ignored'`.
    - `'should record decision as declined when user explicitly clicks Skip'`: `isGitRepository` resolves `true`, `isGitIgnored` resolves `false`. `window.showInformationMessage` resolves `'Skip'` (the explicit button label, not `undefined`). Assert `workspace.fs.writeFile` was NOT called. Assert `mockUpdateConfig` was called with `gitignoreDecisions` containing `'docs/archive/agent-sessions': 'declined'`.
    - `'should NOT record any decision when the prompt dialog is dismissed (X-close / ESC)'`: `isGitRepository` resolves `true`, `isGitIgnored` resolves `false`. `window.showInformationMessage` resolves `undefined` (the dismissal sentinel — VS Code returns `undefined` when the user closes the dialog without picking a button). Assert `workspace.fs.writeFile` was NOT called. Assert `mockUpdateConfig` was **NOT** called (dismissal must not produce a sticky decision). This test pins F-010 closed: dismissal stays re-promptable.
    - `'should not call updateConfig when writeFile fails'`: `isGitRepository` resolves `true`, `isGitIgnored` resolves `false`. `window.showInformationMessage` resolves `'Add to .gitignore'`. `workspace.fs.readFile` rejects. `workspace.fs.writeFile` rejects with `new Error('disk full')`. Assert `mockUpdateConfig` was NOT called.
    - `'writeGitignoreEntry throws synchronously on invalid archivePath (direct call)'`: this test directly exercises the defensive validator inside `writeGitignoreEntry`. Import `writeGitignoreEntry` as a named export from `gitignorePrompt` (the helper must be exported for testability — update Task 1.3 imports/exports list accordingly if not already). Call it with `archivePath = 'docs/archive\nbad'` (contains a control character — validator rejects) and assert the promise rejects with an `Error` whose message starts with `'Invalid archivePath:'`. Assert `workspace.fs.readFile` was NOT called and `workspace.fs.writeFile` was NOT called. This test makes the defense-in-depth check (currently unreachable via `checkAndPromptGitignore` because Step 0 short-circuits first) provable and pinned: any future refactor that removes the defensive check from `writeGitignoreEntry` will fail this test.

#### [x] Task 1.6: Update impacted documentation

- [x] In `docs/technical-context.md`, locate section 8.6 "Agent Session Archiving Model". After the "Force re-archive" paragraph (the paragraph that begins "**Force re-archive:**"), add the following two paragraphs:

  **`archivePath` validation:** The `archivePath` field of `AgentSessionsArchivingConfig` is validated by `validateArchivePath()` (`src/features/agentSessionsArchiving/archivePathValidation.ts`) at every site that consumes it: `checkAndPromptGitignore` (Step 0), `writeGitignoreEntry` (defense-in-depth), `runArchiveCycle` (entry guard), and `moveArchive` (oldPath and newPath guards). The validator rejects: empty or whitespace-only paths, leading or trailing whitespace, strings exceeding 1024 characters, control characters (`\n`, `\r`, `\0`, `\t`, etc.), leading `#` or `!` (which would alter `.gitignore` interpretation), glob metacharacters (`*`, `?`, `[`, `]`), absolute paths (Unix `/…` or Windows `C:\…`), and `..` path-traversal segments. On validation failure, the calling method logs at `warn` level (or in the case of `writeGitignoreEntry`, throws an error that the enclosing `try/catch` in `checkAndPromptGitignore` translates to a warn log) and skips the operation without performing any filesystem or `.gitignore` mutation.

  **Git-aware gitignore prompt:** When the archive feature transitions to the running state (global enabled + feature enabled) or when `archivePath` changes, the extension checks whether the workspace is a git repository using `isGitRepository(workspaceRootUri.fsPath)`. If it is a repository and `archivePath` is not already git-ignored, and no previous decision exists for that path, the extension presents a VS Code information message asking the user to add the path to `.gitignore`. Accepting appends a two-line block to `.gitignore` — a provenance comment `# Managed by Tangyr Workbench (agent sessions archive)` followed by `{archivePath}/` and a trailing newline; a single leading newline is inserted only when the existing file does not already end with one. The file is created if absent. The provenance comment makes the entry self-describing so a user reading the file later understands its origin and does not remove it as an apparent orphan (which would silently lose gitignore protection because the stored `'ignored'` decision blocks the prompt from re-appearing for that path). Declining (explicit click on the `Skip` button) stores `'declined'` in the `gitignoreDecisions` field of `AgentSessionsArchivingConfig`, keyed by `archivePath`, so the prompt does not re-appear for that path. Dismissing the dialog without choosing a button (X-close, ESC, focus loss — VS Code returns `undefined`) is intentionally treated as "no decision yet": no entry is written to `gitignoreDecisions`, and the prompt re-appears on the next activation. This separation prevents an accidental dismissal from silently binding the user to a sticky decline. A new `archivePath` value produces a new key and triggers a fresh evaluation; an unchanged path with a recorded decision is never re-prompted. A failed `.gitignore` write is logged at `warn` level and the decision is not stored, so the prompt re-appears on the next activation. The write is a non-atomic read-modify-write — concurrent writes by other VS Code extensions or external processes between the read and the write can result in last-write-wins behavior on the `.gitignore` file. This is accepted as best-effort; collision probability is low for typical workflows. The duplicate-entry guard (`existing.split('\n').some(line => line.trim() === entryLine)`) prevents redundant appends on subsequent activations even after manual edits.

- [x] Mark all completed checkboxes in this activity.

#### [x] Task 1.7: Commit changes

- [x] Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. If any check fails, fix the failure before proceeding — do not commit with a failing quality gate.
- [x] Commit `src/core/git.ts`, `src/types/index.ts`, `src/features/agentSessionsArchiving/archivePathValidation.ts`, `src/features/agentSessionsArchiving/gitignorePrompt.ts`, `src/features/agentSessionsArchiving/index.ts`, `test/unit/core/git.test.ts`, `test/unit/features/agentSessionsArchiving/archivePathValidation.test.ts`, `test/unit/features/agentSessionsArchiving/gitignorePrompt.test.ts`, `docs/technical-context.md`, and this workstream file with message: `feat(archiving): prompt to gitignore archive path on first activation`.

### [x] Activity 2: Wire `checkAndPromptGitignore` into `reconfigure` for archivePath changes

#### [x] Task 2.1: Extend `AgentSessionArchiveService.reconfigure` to call the prompt on path change

Read `src/features/agentSessionsArchiving/archiveService.ts` in full before making any change.

- [x] The current signature of `reconfigure` is `public async reconfigure(oldConfig: AgentSessionsArchivingConfig | undefined, newConfig: AgentSessionsArchivingConfig): Promise<void>` (line 52). Change it to add one parameter after `newConfig` (the `updateConfig` callback). Do NOT add a `workspaceRootUri` parameter: `AgentSessionArchiveService` already holds `this.workspaceRootUri` as a `private readonly` constructor field (archiveService.ts line 21) — passing it again as a parameter would shadow the field and force the caller to thread state that already lives on the receiver.

  ```typescript
  public async reconfigure(
    oldConfig: AgentSessionsArchivingConfig | undefined,
    newConfig: AgentSessionsArchivingConfig,
    updateConfig: (patch: Partial<AgentSessionsArchivingConfig>) => Promise<void>
  ): Promise<void>
  ```

- [x] Add a private re-entrancy guard field to `AgentSessionArchiveService`. Insert immediately after `private readonly ensuredDirectories = new Set<string>();` (the JSDoc-annotated field introduced in Task 3.1):

  ```typescript
  /**
   * Re-entrancy guard for reconfigure(). Set to true on entry, reset to false in
   * a finally block on exit. When a recursive call is detected (the gitignore
   * prompt's updateConfig callback writes the config, which fires the section
   * listener, which calls reconfigure again on the same instance), the inner
   * invocation returns early without running moveArchive, the prompt, or
   * start(). The outer invocation continues normally and is the only one that
   * mutates timer/cache state. Without this guard, start() is invoked twice in
   * rapid sequence (once from the inner call, once from the outer), churning
   * the interval handle and racing two runArchiveCycle() invocations on
   * lastArchivedMap.
   */
  private _reconfiguring = false;
  ```

  Note: do NOT add Task 3.1's `ensuredDirectories` field again here — Task 3.1 already does that. This subtask only adds the new `_reconfiguring` field. The two private fields live next to each other in the class body.

- [x] Inside `reconfigure`, locate the `if (oldConfig.archivePath !== newConfig.archivePath)` branch (line 67). Wrap the entire body in a re-entrancy guard with `try/finally`. Insert the prompt call **INSIDE** the `if (oldConfig.archivePath !== newConfig.archivePath)` block, immediately after `await this.moveArchive(...)` and before the closing `}`. Placement outside the if-block would cause the prompt to fire on every reconfigure (e.g., when `intervalMinutes` changes), which violates this activity's intent. The resulting body shape (entire method, from signature to closing brace):

  ```typescript
  public async reconfigure(
    oldConfig: AgentSessionsArchivingConfig | undefined,
    newConfig: AgentSessionsArchivingConfig,
    updateConfig: (patch: Partial<AgentSessionsArchivingConfig>) => Promise<void>
  ): Promise<void> {
    if (this._reconfiguring) {
      this.logger.debug(
        'Re-entrant reconfigure call detected (likely via updateConfig → section listener) — short-circuiting'
      );
      return;
    }
    this._reconfiguring = true;
    try {
      // ...existing reconfigure body, with the prompt call wired inside the path-change branch:
      if (!oldConfig) {
        if (newConfig.enabled) {
          this.start(newConfig);
        }
        return;
      }
      if (!newConfig.enabled) {
        this.stop();
        this._currentConfig = newConfig;
        return;
      }
      if (oldConfig.archivePath !== newConfig.archivePath) {
        await this.moveArchive(oldConfig.archivePath, newConfig.archivePath);
        await checkAndPromptGitignore(
          newConfig.archivePath,
          this.workspaceRootUri,
          newConfig,
          this.logger,
          updateConfig
        );
      }
      this.start(newConfig);
    } finally {
      this._reconfiguring = false;
    }
  }
  ```

  Rationale: the prompt's `updateConfig` callback (when accepted) writes a new `gitignoreDecisions` entry via `stateManager.updateConfigSection`, which synchronously fires `notifySectionListeners`, which calls `service.reconfigure(...)` again on the same instance. Without the guard, the inner call runs `start()` (resetting the timer and `_needsDedup`), then control returns to the outer call which also runs `start()` — two starts in rapid sequence, two `runArchiveCycle()` invocations racing on `lastArchivedMap`. With the guard, the inner call early-returns at the `_reconfiguring` check; the outer call completes normally. The `finally` block guarantees the flag is reset even if any intermediate operation throws.

- [x] Add the import at the top of `archiveService.ts`: `import { checkAndPromptGitignore } from './gitignorePrompt';`.

#### [x] Task 2.2: Update the `onConfigSectionChanged` call site in `index.ts` to pass the new parameters

Read `src/features/agentSessionsArchiving/index.ts` in full before making any change.

- [x] Locate the `onConfigSectionChanged` callback (lines 113–121). The current call is `void service.reconfigure(oldConfig, newConfig);`. Replace it with:

  ```typescript
  void service.reconfigure(oldConfig, newConfig, async (patch) => {
    const current = stateManager.getConfigSection(CONFIG_KEY) as
      | AgentSessionsArchivingConfig
      | undefined;
    if (!current) {
      return;
    }
    await stateManager.updateConfigSection(CONFIG_KEY, { ...current, ...patch });
  });
  ```

- [x] The `updateConfig` callback re-fetches the latest persisted config via `stateManager.getConfigSection(CONFIG_KEY)` instead of closing over the `newConfig` parameter. Same rationale as the Task 1.4 callback: `updateConfigSection` writes the section as a `set`, so spreading a captured snapshot would clobber any concurrent user-driven change to unrelated fields. No `workspaceRoot` is passed — `reconfigure` now uses `this.workspaceRootUri` internally (see Task 2.1).

#### [x] Task 2.3: Add unit tests for the reconfigure prompt wiring

Read `test/unit/features/agentSessionsArchiving/archiveService.test.ts` in full before making any change.

- [x] In `test/unit/features/agentSessionsArchiving/archiveService.test.ts`, the `describe('reconfigure', ...)` block currently starts at line 448. The new `reconfigure` signature requires one additional trailing parameter: `updateConfig` (a `vi.fn()`). Update each of the 5 existing `service.reconfigure` invocations in the test file (at lines 457, 473, 491, 513, 530) by appending the trailing argument: `, vi.fn()`. For example, line 457 `await service.reconfigure(undefined, DEFAULT_CONFIG);` becomes `await service.reconfigure(undefined, DEFAULT_CONFIG, vi.fn());`. Apply the same trailing-argument addition to all 5 call sites regardless of the first two argument values.
- [x] Add a module-level mock for `gitignorePrompt.ts` by adding this near the top of the test file (after the existing imports):

  ```typescript
  const mockCheckAndPromptGitignore = vi.fn().mockResolvedValue(undefined);
  vi.mock('../../../../src/features/agentSessionsArchiving/gitignorePrompt', () => ({
    checkAndPromptGitignore: mockCheckAndPromptGitignore,
  }));
  ```

- [x] Inside `describe('reconfigure', ...)`, after the existing test `'should skip move when old directory does not exist'`, add two new test cases:
  - `'should call checkAndPromptGitignore when archivePath changes'`: mocks `workspace.fs.readDirectory` to return `[]`; creates `service`; calls `service.start(DEFAULT_CONFIG)`; calls `await service.reconfigure(DEFAULT_CONFIG, { ...DEFAULT_CONFIG, archivePath: 'new/path' }, vi.fn())`; asserts `mockCheckAndPromptGitignore` was called once with `'new/path'` as the first argument and `workspaceRootUri` (the test fixture's URI) as the second argument.
  - `'should not call checkAndPromptGitignore when archivePath is unchanged'`: creates `service`; calls `service.start(DEFAULT_CONFIG)`; calls `await service.reconfigure(DEFAULT_CONFIG, DEFAULT_CONFIG, vi.fn())`; asserts `mockCheckAndPromptGitignore` was NOT called.
  - `'should short-circuit on re-entrant reconfigure (recursion guard)'`: pins F-003 closed. Creates `service`; calls `service.start(DEFAULT_CONFIG)`; spies on `service.start` (e.g., `const startSpy = vi.spyOn(service, 'start');`). Constructs an `updateConfig` callback that, when invoked, synchronously calls `service.reconfigure(...)` again on the same instance with a different `gitignoreDecisions` patch and the same `vi.fn()` as inner `updateConfig`. Sets `mockCheckAndPromptGitignore` to call its `updateConfig` argument once before resolving (simulating the user-accept path triggering the section listener re-entry). Calls `await service.reconfigure(DEFAULT_CONFIG, { ...DEFAULT_CONFIG, archivePath: 'new/path' }, recursiveUpdateConfig)`. Asserts `startSpy` was called exactly **once** (only the outer reconfigure runs `start`; the inner recursive call must short-circuit at the `_reconfiguring` guard before reaching `start`). Asserts `logger.debug` was called with a message containing `'Re-entrant reconfigure call detected'`. This test pins the re-entrancy guard semantics: a future refactor that removes the `_reconfiguring` flag will fail this test.
- [x] Add `beforeEach(() => { mockCheckAndPromptGitignore.mockClear(); })` inside `describe('reconfigure', ...)` to reset the mock between tests.

#### [x] Task 2.4: Update impacted documentation

- [x] In `docs/technical-context.md`, in section 8.6, locate the "Git-aware gitignore prompt" paragraph added in Activity 1. Append the following sentences at the end of that paragraph: "When `archivePath` changes (detected in `AgentSessionArchiveService.reconfigure`), the prompt runs after the archive directory has been moved to the new path and before the archive service restarts with the new config. `reconfigure` is guarded against re-entrancy: when the prompt's `updateConfig` callback (on accept) writes the config and the section listener fires `reconfigure` again on the same instance, the inner invocation short-circuits at a `_reconfiguring` flag (set in the outer call's try-block, reset in its finally-block). Only the outer call mutates timer state and runs `start()`."
- [x] Mark all completed checkboxes in this activity.

#### [x] Task 2.5: Commit changes

- [x] Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. If any check fails, fix the failure before proceeding — do not commit with a failing quality gate.
- [x] Commit `src/features/agentSessionsArchiving/archiveService.ts`, `src/features/agentSessionsArchiving/index.ts`, `test/unit/features/agentSessionsArchiving/archiveService.test.ts`, `docs/technical-context.md`, and this workstream file with message: `refactor(archiving): extend reconfigure to invoke gitignore prompt on archivePath change`. Type is `refactor:` (not `feat:`) because Activity 2 extends an existing API surface (`reconfigure` signature) and wires an already-existing feature (the prompt, introduced in Activity 1) into an additional call site. No new user-facing capability is introduced standalone by this commit. Semantic-release rule mapping (per `.releaserc.json` and `technical-context.md` section 8.10): `refactor:` → patch bump. This avoids producing three consecutive minor bumps when the workstream conceptually delivers a single feature pair — see F-012 of the Phase 2 review for rationale.

### [ ] Activity 3: Introduce YYYY/MM layout in write, hydrate, and move operations

#### [ ] Task 3.1: Add `runArchiveCycle` validation guard and update `writeArchiveFile`/`copyRawArchive` to write into `archivePath/YYYY/MM/`

Read `src/features/agentSessionsArchiving/archiveService.ts` in full before making any change.

- [ ] Add the import at the top of `src/features/agentSessionsArchiving/archiveService.ts`: `import { validateArchivePath } from './archivePathValidation';`.

- [ ] In `runArchiveCycle` (line 73), insert a validation guard immediately after the `if (!this._currentConfig) { return; }` guard and before `this.logger.debug('Archive cycle starting');`:

  ```typescript
  const validation = validateArchivePath(this._currentConfig.archivePath);
  if (!validation.valid) {
    this.logger.warn(
      `Skipping archive cycle: invalid archivePath "${this._currentConfig.archivePath}" — ${validation.reason ?? 'unknown'}`
    );
    return;
  }
  ```

  This guard runs once per cycle (every `intervalMinutes` minutes) and once on `start()`. If the path is invalid, the entire cycle is a no-op: no migration, no dedup/hydrate, no write to `archiveUri`. The timer continues to fire but each iteration short-circuits at the guard. The user-visible effect is the `warn` log; the user fixes their `.tangyr.jsonc` and the next cycle succeeds.

- [ ] In `writeArchiveFile` (line 157), the `timestamp` parameter already contains the 12-char `YYYYMMDDHHmm` string. Before computing `mdFileName`, add:

  ```typescript
  const yyyy = timestamp.substring(0, 4);
  const mm = timestamp.substring(4, 6);
  const monthUri = vscode.Uri.joinPath(archiveUri, yyyy, mm);
  await this.ensureDirectory(monthUri);
  const mdFileName = `${yyyy}/${mm}/${timestamp}-${session.archiveName}.md`;
  ```

  Replace the existing `const mdFileName = \`${timestamp}-${session.archiveName}.md\`;`(line 191) with the above block. Replace`const mdUri = vscode.Uri.joinPath(archiveUri, mdFileName);`(line 192) with`const mdUri = vscode.Uri.joinPath(archiveUri, yyyy, mm, \`${timestamp}-${session.archiveName}.md\`);`.

- [ ] In `copyRawArchive` (line 213), add the same year/month derivation and subdirectory creation before computing `rawFileName`:

  ```typescript
  const yyyy = timestamp.substring(0, 4);
  const mm = timestamp.substring(4, 6);
  const monthUri = vscode.Uri.joinPath(archiveUri, yyyy, mm);
  await this.ensureDirectory(monthUri);
  const rawFileName = `${yyyy}/${mm}/${timestamp}-${session.archiveName}${session.extension}`;
  const destUri = vscode.Uri.joinPath(
    archiveUri,
    yyyy,
    mm,
    `${timestamp}-${session.archiveName}${session.extension}`
  );
  ```

  Replace the existing `const rawFileName = ...` (line 218) and `const destUri = vscode.Uri.joinPath(archiveUri, rawFileName);` (line 219) with the above block.

- [ ] The `lastArchivedMap.set(session.archiveName, { mtime: session.mtime, archiveFileName })` calls in `archiveSession` (lines 144 and 151) store the value returned from `writeArchiveFile`. Because `writeArchiveFile` now returns `'YYYY/MM/YYYYMMDDHHmm-name.ext'` or `undefined`, and `copyRawArchive` also returns the relative path, the `lastArchivedMap` will automatically store the correct relative path. No change is needed in `archiveSession` itself.

- [ ] The delete call `await this.deleteFile(vscode.Uri.joinPath(archiveUri, entry.archiveFileName))` in `archiveSession` (line 139) continues to work because `vscode.Uri.joinPath` resolves path segments including `/` separators in a string. Verify: `vscode.Uri.joinPath(base, '2026/05/file.md')` is equivalent to `vscode.Uri.joinPath(base, '2026', '05', 'file.md')`. This is confirmed by the VS Code API. No change needed.

- [ ] Add a private field for the ensured-directory cache on `AgentSessionArchiveService`. Insert the following block immediately after `private _needsDedup = true;` (line 18):

  ```typescript
  /**
   * Cache of URIs already ensured via ensureDirectory(), keyed by uri.fsPath.
   * Keys are raw fsPath strings — do not introduce relative-segment normalization
   * (e.g., './2026/05' vs '2026/05') without invalidating the cache, otherwise
   * the same logical directory may be cached under multiple keys.
   */
  private readonly ensuredDirectories = new Set<string>();
  ```

  Rationale: the new `await this.ensureDirectory(monthUri)` call introduced in `writeArchiveFile` and `copyRawArchive` fires on every session write. Without a cache, the same YYYY/MM directory is re-ensured for every session archived in that month, producing N redundant `vscode.workspace.fs.createDirectory` calls and N "already exists" errors swallowed by the existing `ensureDirectory` catch. The cache reduces this to one `createDirectory` per distinct directory URI per service lifetime.

- [ ] Replace the body of `ensureDirectory` (lines 309–315) with the cache-aware version:

  ```typescript
  private async ensureDirectory(uri: vscode.Uri): Promise<void> {
    const key = uri.fsPath;
    if (this.ensuredDirectories.has(key)) {
      return;
    }
    try {
      await vscode.workspace.fs.createDirectory(uri);
      this.ensuredDirectories.add(key);
    } catch (err) {
      this.logger.debug(`ensureDirectory: ${String(err)}`);
    }
  }
  ```

  Caching is keyed on `uri.fsPath` (not `uri.toString()`): `fsPath` is the canonical local-filesystem path form for `vscode.Uri`, equally unique in production and consistent with the test mock at `test/unit/mocks/vscode.ts` (which exposes URIs as `{ fsPath: ... }` plain objects without a `toString()` override). Using `toString()` here would silently mis-key under tests (all URIs would collapse to the literal `'[object Object]'` string). The cache is populated only on successful `createDirectory` so that a transient failure (e.g., permission error) does not poison the cache; the next call retries.

- [ ] Clear the cache at the start of `start()` so reconfigure cycles begin with a fresh view of the filesystem. Insert `this.ensuredDirectories.clear();` as the second statement of `start()` (immediately after `this.stop();` at line 31). The resulting prefix of `start()` is:

  ```typescript
  public start(config: AgentSessionsArchivingConfig): void {
    this.stop();
    this.ensuredDirectories.clear();
    this._currentConfig = config;
    // ...
  }
  ```

  Rationale: `reconfigure` calls `start()` after `moveArchive`, so any URIs cached during the move (under the new path) are intentionally discarded; the first cycle after start re-ensures and re-populates the cache. This keeps `moveArchive` and `migrateFlatLayout` free of bespoke cache-invalidation logic.

#### [ ] Task 3.2: Add `migrateFlatLayout` method, then update `deduplicateAndHydrate` and `groupArchiveFiles` to scan year/month subdirectories

Read `src/features/agentSessionsArchiving/archiveService.ts` in full before making any change.

The `migrateFlatLayout` method MUST be added before the `deduplicateAndHydrate` rewrite, because the new body of `deduplicateAndHydrate` calls it. Adding the call site without the method would fail TypeScript compilation and break the Activity 3 commit's quality gate.

- [ ] Add the following private method to `AgentSessionArchiveService` immediately before `deduplicateAndHydrate` in the file (insert at line 256, pushing the existing `deduplicateAndHydrate` definition downward). The method body is final — do not modify it when test coverage is added in Activity 4.

  ```typescript
  private async migrateFlatLayout(
    archiveUri: vscode.Uri,
    topEntries: [string, vscode.FileType][]
  ): Promise<void> {
    // Month constrained to 01-12 to prevent migration of files with invalid month components
    // (e.g., a manually-placed '202099310000-foo.md' would otherwise be moved into '2020/99/').
    const FLAT_PATTERN = /^(\d{4})(0[1-9]|1[0-2])\d{8}-.+\.\w+$/;
    for (const [name, type] of topEntries) {
      if (type !== vscode.FileType.File) {
        continue;
      }
      const m = FLAT_PATTERN.exec(name);
      if (!m?.[1] || !m[2]) {
        continue;
      }
      const yyyy = m[1];
      const mm = m[2];
      const targetDirUri = vscode.Uri.joinPath(archiveUri, yyyy, mm);
      await this.ensureDirectory(targetDirUri);
      const srcUri = vscode.Uri.joinPath(archiveUri, name);
      const destUri = vscode.Uri.joinPath(archiveUri, yyyy, mm, name);
      try {
        await vscode.workspace.fs.copy(srcUri, destUri, { overwrite: true });
        await this.deleteFile(srcUri);
        this.logger.info(`Migrated flat archive file ${name} → ${yyyy}/${mm}/${name}`);
      } catch (err) {
        this.logger.warn(
          `Failed to migrate flat archive file ${name}: ${String(err)} — left in place`
        );
      }
    }
  }
  ```

- [ ] Replace the body of `deduplicateAndHydrate` (lines 256–273) with a new implementation that: (a) reads the top-level entries of `archiveUri`; (b) for each entry that is a `FileType.Directory` and whose name matches `/^\d{4}$/` (a four-digit year), reads that directory's entries and for each sub-entry that is a `FileType.Directory` and whose name matches `/^\d{2}$/` (a two-digit month), reads that directory's entries and appends each file entry as a tuple `[${year}/${month}/${name}`, type]`to a combined files list; (c) calls`this.groupArchiveFiles(combinedEntries)`where`combinedEntries`contains only file-type entries with paths relative to`archiveUri`(e.g.,`'2026/05/202605251830-foo.md'`). The rest of the dedup/hydrate logic (grouping, removeDuplicates, lastArchivedMap set) remains unchanged.`ReadDirectory`errors at any level are caught and logged at`debug` level; failures reading a single year or month directory do not abort the whole hydration.

  The new body is:

  ```typescript
  private async deduplicateAndHydrate(archiveUri: vscode.Uri): Promise<void> {
    let topEntries: [string, vscode.FileType][];
    try {
      topEntries = await vscode.workspace.fs.readDirectory(archiveUri);
    } catch {
      return;
    }
    // Idempotent flat-layout migration sweep (see migrateFlatLayout)
    await this.migrateFlatLayout(archiveUri, topEntries);
    // Re-read after migration
    try {
      topEntries = await vscode.workspace.fs.readDirectory(archiveUri);
    } catch {
      return;
    }
    const combined: [string, vscode.FileType][] = [];
    for (const [name, type] of topEntries) {
      if (type === vscode.FileType.Directory && /^\d{4}$/.test(name)) {
        let monthEntries: [string, vscode.FileType][];
        try {
          monthEntries = await vscode.workspace.fs.readDirectory(
            vscode.Uri.joinPath(archiveUri, name)
          );
        } catch (err) {
          this.logger.debug(`Failed to read year directory ${name}: ${String(err)}`);
          continue;
        }
        for (const [mmName, mmType] of monthEntries) {
          if (mmType === vscode.FileType.Directory && /^\d{2}$/.test(mmName)) {
            let fileEntries: [string, vscode.FileType][];
            try {
              fileEntries = await vscode.workspace.fs.readDirectory(
                vscode.Uri.joinPath(archiveUri, name, mmName)
              );
            } catch (err) {
              this.logger.debug(
                `Failed to read month directory ${name}/${mmName}: ${String(err)}`
              );
              continue;
            }
            for (const [fileName, fileType] of fileEntries) {
              combined.push([`${name}/${mmName}/${fileName}`, fileType]);
            }
          }
        }
      }
    }
    const grouped = this.groupArchiveFiles(combined);
    for (const [archiveName, files] of grouped) {
      if (files.length > 1) {
        await this.removeDuplicates(archiveUri, files);
      }
      const best = files[0];
      if (best && !this.lastArchivedMap.has(archiveName)) {
        this.lastArchivedMap.set(archiveName, { mtime: 0, archiveFileName: best.name });
      }
    }
  }
  ```

- [ ] Update `groupArchiveFiles` (lines 275–293) so that `PATTERN` matches paths including the year/month prefix. Replace the existing `const PATTERN = /^(\d{12})-(.+)\.\w+$/;` with the following block (the leading comment is mandatory — it documents that the optional prefix is defensive, not currently exercised after a successful migration sweep, and explains the conditions for safe removal):

  ```typescript
  // Optional YYYY/MM/ prefix retained as defense-in-depth: it covers the
  // transitional state where migrateFlatLayout fails on some files and the
  // post-migrate readDirectory still returns flat-form entries. Currently
  // `combined` is built only from entries under YYYY/MM/ subdirectories, so
  // the optional branch is unreachable for combined entries. Remove only after
  // confirming (via the migration tests and at least one release cycle) that
  // no code path can surface flat-form entries to groupArchiveFiles.
  const PATTERN = /^(?:\d{4}\/\d{2}\/)?(\d{12})-(.+)\.\w+$/;
  ```

  This allows both `2026/05/202605251830-foo.md` and the legacy flat form `202605251830-foo.md` to be grouped. The `name` in the returned group entry must be the full relative path (including `YYYY/MM/` prefix) so that `removeDuplicates` and `lastArchivedMap` entries reference the correct path. Update the `list.push({ ts: m[1], name });` line to push `{ ts: m[1] as string, name }` where `name` is the first element of the `[name, type]` tuple (unchanged — it is already the relative path in `combined`).

#### [ ] Task 3.3: Update `moveArchive` to recurse into YYYY subdirectories

Read `src/features/agentSessionsArchiving/archiveService.ts` in full before making any change.

- [ ] Replace the body of `moveArchive` (lines 230–253) with a new implementation that: (a) validates `oldPath` and `newPath` with `validateArchivePath` — on failure of either, logs at `warn` and returns without touching the filesystem; (b) reads the top-level entries of `oldUri`; (c) tracks a local `let allCopiesSucceeded = true;` flag that any per-file copy or year/month directory read failure sets to `false`; (d) for each entry that is a `FileType.File`, copies it directly to `newUri/filename` with `{ overwrite: true }` (existing flat layout fallback); (e) for each entry that is a `FileType.Directory` and whose name matches `/^\d{4}$/`, reads that directory's entries and for each sub-entry that is a `FileType.Directory` and whose name matches `/^\d{2}$/`, reads that month directory's entries and for each `FileType.File` entry, copies it to `vscode.Uri.joinPath(newUri, yyyy, mm, fileName)` with `{ overwrite: true }` (ensuring the target `YYYY/MM/` directory is created via `ensureDirectory` before the first copy in each month). After all copies are attempted, **deletes `oldUri` recursively only when `allCopiesSucceeded` is `true`**; otherwise logs a single explicit warn message instructing the user to manually verify the target tree before cleaning up the source. If `readDirectory(oldUri)` throws (directory not found), logs at `debug` and returns. Individual file copy failures and individual year/month read failures are logged at `warn`, flip `allCopiesSucceeded` to `false`, and do not abort the move loop — every reachable file is given a chance to be copied. The `{ overwrite: true }` option matches the migration semantics (Task 3.2's `migrateFlatLayout`) and lets a re-run of the reconfigure recover from a previously failed partial move without colliding on existing destinations. The conditional source delete addresses the data-loss vector identified by the review gate (F-001 / BK-001 / GR-001) and aligns the failure semantics of `moveArchive` with `migrateFlatLayout` (both: copy failure → leave source in place).

  The new body is:

  ```typescript
  private async moveArchive(oldPath: string, newPath: string): Promise<void> {
    const oldValidation = validateArchivePath(oldPath);
    if (!oldValidation.valid) {
      this.logger.warn(
        `Skipping moveArchive: invalid oldPath "${oldPath}" — ${oldValidation.reason ?? 'unknown'}`
      );
      return;
    }
    const newValidation = validateArchivePath(newPath);
    if (!newValidation.valid) {
      this.logger.warn(
        `Skipping moveArchive: invalid newPath "${newPath}" — ${newValidation.reason ?? 'unknown'}`
      );
      return;
    }
    const oldUri = vscode.Uri.joinPath(this.workspaceRootUri, oldPath);
    const newUri = vscode.Uri.joinPath(this.workspaceRootUri, newPath);
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(oldUri);
    } catch {
      this.logger.debug(`Old archive directory not found, skipping move: ${oldPath}`);
      return;
    }
    await this.ensureDirectory(newUri);
    let allCopiesSucceeded = true;
    for (const [name, type] of entries) {
      if (type === vscode.FileType.File) {
        try {
          await vscode.workspace.fs.copy(
            vscode.Uri.joinPath(oldUri, name),
            vscode.Uri.joinPath(newUri, name),
            { overwrite: true }
          );
        } catch (err) {
          allCopiesSucceeded = false;
          this.logger.warn(`Failed to move file ${name}: ${String(err)}`);
        }
      } else if (type === vscode.FileType.Directory && /^\d{4}$/.test(name)) {
        const yyyy = name;
        let monthEntries: [string, vscode.FileType][];
        try {
          monthEntries = await vscode.workspace.fs.readDirectory(
            vscode.Uri.joinPath(oldUri, yyyy)
          );
        } catch (err) {
          allCopiesSucceeded = false;
          this.logger.warn(`Failed to read year dir ${yyyy} during move: ${String(err)}`);
          continue;
        }
        for (const [mmName, mmType] of monthEntries) {
          if (mmType !== vscode.FileType.Directory || !/^\d{2}$/.test(mmName)) {
            continue;
          }
          let fileEntries: [string, vscode.FileType][];
          try {
            fileEntries = await vscode.workspace.fs.readDirectory(
              vscode.Uri.joinPath(oldUri, yyyy, mmName)
            );
          } catch (err) {
            allCopiesSucceeded = false;
            this.logger.warn(
              `Failed to read month dir ${yyyy}/${mmName} during move: ${String(err)}`
            );
            continue;
          }
          await this.ensureDirectory(vscode.Uri.joinPath(newUri, yyyy, mmName));
          for (const [fileName, fileType] of fileEntries) {
            if (fileType !== vscode.FileType.File) {
              continue;
            }
            try {
              await vscode.workspace.fs.copy(
                vscode.Uri.joinPath(oldUri, yyyy, mmName, fileName),
                vscode.Uri.joinPath(newUri, yyyy, mmName, fileName),
                { overwrite: true }
              );
            } catch (err) {
              allCopiesSucceeded = false;
              this.logger.warn(
                `Failed to move file ${yyyy}/${mmName}/${fileName}: ${String(err)}`
              );
            }
          }
        }
      }
    }
    if (allCopiesSucceeded) {
      try {
        await vscode.workspace.fs.delete(oldUri, { recursive: true });
      } catch (err) {
        this.logger.warn(
          `Failed to delete old archive directory ${oldPath} after move: ${String(err)} — left in place`
        );
      }
      this.logger.info(`Moved archive from ${oldPath} to ${newPath}`);
    } else {
      this.logger.warn(
        `moveArchive completed with copy failures — left source archive in place at "${oldPath}" for manual cleanup after verifying "${newPath}" is complete. Do NOT delete "${oldPath}" until verifying the target tree is intact.`
      );
    }
  }
  ```

#### [ ] Task 3.4: Add unit tests for YYYY/MM layout writes, hydration, and recursive move

Read `test/unit/features/agentSessionsArchiving/archiveService.test.ts` in full before making any change.

- [ ] Inside `describe('runArchiveCycle', ...)`, add the following test after the existing `'should use session ctime for archive filename timestamp'` test:

  `'should write archive file into YYYY/MM subdirectory'`: uses `ctime: 1_609_459_200_000` (2021-01-01T00:00:00Z → timestamp `202101010000`); calls `service.start(DEFAULT_CONFIG)` and `await service.runArchiveCycle()`; retrieves the `workspace.fs.copy` call's destination path; asserts the path contains `'2021/01/202101010000-test-session.json'`.

- [ ] Inside `describe('runArchiveCycle', ...)`, **redesign** the existing test `'should reprocess a session whose archive was hydrated from disk with mtime 0, then skip it on the second cycle'`. The redesign aligns the source session's `ctime` to the same year/month as the hydrated archive path, so both the old (hydrated) path and the new (rewritten) path resolve to the same `YYYY/MM/` subdirectory. This eliminates the "path mismatch by accident" property of the previous fixture and makes the test exercise the intended `archiveSession` replacement flow end-to-end. Replace the test body with the following structure (preserving the test name and surrounding `describe` block):
  - **Constants at the top of the test body** (clarifies the choreography):

    ```typescript
    // Source session fixture: ctime is the file's CREATION time; mtime is the file's MODIFICATION time.
    // Both belong to March 2026 — same year/month as the hydrated archive — so the new write
    // produced by archiveSession lands in the same '2026/03/' subdirectory as the deleted hydrated file.
    const SESSION_CTIME = Date.UTC(2026, 2, 9, 5, 13, 0); // 2026-03-09T05:13:00Z → timestamp 202603090513
    const SESSION_MTIME = Date.UTC(2026, 2, 9, 6, 0, 0); // 2026-03-09T06:00:00Z (newer than the hydrated mtime=0)
    const HYDRATED_ARCHIVE_RELATIVE = '2026/03/202603090513-copilot-chat-test-session.md';
    ```

  - **`workspace.fs.readDirectory` mock** (4-call chain for `deduplicateAndHydrate`'s traversal: pre-migrate top-level, post-migrate top-level, year dir, month dir):

    ```typescript
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([['2026', vscode.FileType.Directory]]) // top-level (pre-migrate)
      .mockResolvedValueOnce([['2026', vscode.FileType.Directory]]) // top-level (post-migrate re-read; unchanged because no flat file existed)
      .mockResolvedValueOnce([['03', vscode.FileType.Directory]]) // year dir 2026
      .mockResolvedValueOnce([
        ['202603090513-copilot-chat-test-session.md', vscode.FileType.File],
      ]); // month dir 2026/03
    ```

    `migrateFlatLayout` iterates the first top-level result; the entry is a `Directory`, not a `File`, so no migration occurs. Hydration stores `lastArchivedMap.set('copilot-chat-test-session', { mtime: 0, archiveFileName: HYDRATED_ARCHIVE_RELATIVE })`.

  - **Source session fixture** (set on the existing provider mock — use the constants defined above so the relationship between hydrated path and new write path is explicit):

    ```typescript
    const provider = (service as any).providers[0];
    provider.findSessions.mockResolvedValue([
      {
        uri: { fsPath: '/source/copilot-chat-test-session.json' },
        providerName: 'copilot-chat',
        archiveName: 'copilot-chat-test-session',
        displayName: 'Test Session',
        mtime: SESSION_MTIME,
        ctime: SESSION_CTIME,
        extension: '.md',
      },
    ]);
    ```

  - **First cycle** (`await service.runArchiveCycle()`):
    - Assert `workspace.fs.delete` was called with a URI whose `fsPath` ends with `HYDRATED_ARCHIVE_RELATIVE`. This verifies that `archiveSession` deleted the old hydrated archive using the full relative path.
    - Assert `workspace.fs.copy` (or the markdown write — the existing test uses `copy` because the session lacks a parser and falls through to `copyRawArchive`; this redesign preserves that behavior by setting `providerName: 'copilot-chat'` for which a parser exists. **Adjust the provider name based on parser registry**: if a parser exists for `'copilot-chat'`, the test exercises `writeArchiveFile` (markdown write via `workspace.fs.writeFile`); if not, it exercises `copyRawArchive` via `workspace.fs.copy`. Verify by inspecting `markdown/index.ts` parser-registry mapping before writing the assertion. Use whichever method the parser-registry routes to, and assert the new file path ends with `'2026/03/202603090513-copilot-chat-test-session.md'`).

  - **Second cycle** (`await service.runArchiveCycle()` again):
    - `_needsDedup` is now `false`, so `deduplicateAndHydrate` is skipped — no further `readDirectory` calls.
    - `lastArchivedMap` now contains `{ mtime: SESSION_MTIME, archiveFileName: '2026/03/202603090513-copilot-chat-test-session.md' }` (updated by the first cycle's `archiveSession`). The source still has the same `mtime`, so the skip guard `entry?.mtime === session.mtime` fires.
    - Assert `workspace.fs.delete` was NOT called after `vi.mocked(workspace.fs.delete).mockClear()` between cycles.

  - **Cleanup**: call `service.dispose()`.

  This redesign produces a test that passes by design — every path the test references (hydrated `2026/03/…`, new write to the same `2026/03/…`, second-cycle skip) is computed from the constants at the top and is self-consistent with the new code under test.

- [ ] Inside `describe('reconfigure', ...)`, update the existing `'should move archive when path changes'` test to verify the new two-level walk. `reconfigure` calls `moveArchive` (three sequential `readDirectory` calls on the old path) and then `start(newConfig)`, which immediately fires `runArchiveCycle` → `deduplicateAndHydrate` against the new path (two further `readDirectory` calls on the new top-level). Replace the `workspace.fs.readDirectory` mock with a chain that covers all five calls:

  ```typescript
  workspace.fs.readDirectory = vi
    .fn()
    .mockResolvedValueOnce([['2026', vscode.FileType.Directory]]) // oldUri top-level (moveArchive)
    .mockResolvedValueOnce([['05', vscode.FileType.Directory]]) // oldUri/2026 year dir
    .mockResolvedValueOnce([['202605010000-file.md', vscode.FileType.File]]) // oldUri/2026/05 month dir
    .mockResolvedValue([]); // newUri reads from deduplicateAndHydrate post-start: empty
  ```

  Assert that `workspace.fs.copy` was called with a destination path containing `'2026/05/202605010000-file.md'`.

- [ ] Inside `describe('runArchiveCycle', ...)`, add a test verifying the ensured-directory cache: `'should ensure each YYYY/MM directory only once across multiple sessions in the same month'`. The test: creates two `SessionFile` entries with distinct `archiveName` values but identical `ctime: 1_609_459_200_000` (2021-01-01T00:00:00Z → both map to `2021/01/`) and distinct `mtime` values; configures the provider mock to return both sessions; spies on `workspace.fs.createDirectory`; calls `service.start(DEFAULT_CONFIG)` and `await service.runArchiveCycle()`. Then count the spy calls whose URI argument has `fsPath` ending with `/2021/01` (use `vi.mocked(workspace.fs.createDirectory).mock.calls.filter(([u]) => (u as { fsPath: string }).fsPath.endsWith('/2021/01')).length`) and assert the count is exactly `1`. The cache key is `uri.fsPath` (see Task 3.1), so two distinct `ensureDirectory` calls for the same `archiveUri/2021/01` URI produce one `createDirectory` invocation; the second is satisfied by the cache. Calls for other directories (e.g., the root `archiveUri` if ever ensured separately) are not counted by this filter and do not affect the assertion.

- [ ] Inside `describe('reconfigure', ...)`, add a test verifying the F-001 mitigation (source survives partial copy failure): `'should leave the source archive in place when any copy fails during moveArchive'`. The test: chains `workspace.fs.readDirectory` for the new two-level walk so the source has two files in `2026/05/` (`mockResolvedValueOnce([['2026', FileType.Directory]])` for `oldUri` top, `mockResolvedValueOnce([['05', FileType.Directory]])` for the year dir, `mockResolvedValueOnce([['file-a.md', FileType.File], ['file-b.md', FileType.File]])` for the month dir, then `mockResolvedValue([])` for any further reads after `start(newConfig)`). Mock `workspace.fs.copy` to `mockRejectedValueOnce(new Error('disk full'))` (the first file copy fails) then `mockResolvedValue(undefined)` (subsequent copies succeed). Mock `workspace.fs.delete` to resolve. Configure `workspace.fs.createDirectory` to resolve. Create the service, `service.start(DEFAULT_CONFIG)`, then `await service.reconfigure(DEFAULT_CONFIG, { ...DEFAULT_CONFIG, archivePath: 'new/path' }, vi.fn())`. Assert: `workspace.fs.delete` was **NOT** called with a URI whose `fsPath` ends with `'docs/archive/agent-sessions'` (the old archive root must remain on disk because `allCopiesSucceeded === false`); `workspace.fs.delete` may still be called for individual archive replacements in unrelated paths but the source-root delete is the specific path the assertion targets. Assert `logger.warn` was called with a message containing `'left source archive in place'`. This test pins F-001 closed: a future refactor that removes the `allCopiesSucceeded` gate will fail this test.

#### [ ] Task 3.5: Update `archiveService.dedup.test.ts` for YYYY/MM layout

Read `test/unit/features/agentSessionsArchiving/archiveService.dedup.test.ts` in full before making any change.

The 10 tests in this file currently mock `workspace.fs.readDirectory` with `vi.fn().mockResolvedValue([...flat-pattern files...])`. Under the new `deduplicateAndHydrate` (Task 3.2), two failure modes occur:

(a) `migrateFlatLayout` matches every flat-pattern filename and invokes `vscode.workspace.fs.copy` + `this.deleteFile` against the mock — silently calling `delete` on tests that assert it was NOT called.

(b) The post-migrate `readDirectory` returns the same flat array (mock semantics), so the year-directory scan produces an empty `combined`, `removeDuplicates` and the hydration logic never execute, and tests asserting on those side effects fail.

This task rewrites each test's mock so that archive files live inside `YYYY/MM/` subdirectories matching their embedded timestamps, exercising the new dedup-and-hydrate paths instead of the migration path. General transformation rules:

- Replace `mockResolvedValue([file1, file2, ...])` with a chain (`mockResolvedValueOnce`-per-readDirectory-call) or with `mockImplementation((uri) => Promise.resolve(...))` keyed on `uri.fsPath` for tests that run multiple cycles.
- The new `deduplicateAndHydrate` body calls `readDirectory(archiveUri)` twice (pre-migrate + post-migrate re-read), then once per `^\d{4}$` year directory, then once per `^\d{2}$` month directory. Each test's chain must cover ALL calls; unmocked calls return `undefined` and crash the for-of loop.
- Assertions that referenced the bare filename (e.g. `stringContaining '202501010000-name.md'`) remain valid because `stringContaining` still matches the substring inside the new full path (e.g. `'2025/01/202501010000-name.md'`).
- Assertions on the log message `'Removed duplicate archive: ...'` must be updated: `removeDuplicates` logs `dup.name`, which is now the full relative path (e.g. `'2025/01/202501010000-name.md'`), not the filename alone.

Apply per-test rewrites:

- [ ] **Test 1 — `'should remove older duplicate and keep the newer file'`**: replace the mock with:

  ```typescript
  workspace.fs.readDirectory = vi
    .fn()
    .mockResolvedValueOnce([
      ['2025', FileType.Directory],
      ['2026', FileType.Directory],
    ]) // top pre-migrate
    .mockResolvedValueOnce([
      ['2025', FileType.Directory],
      ['2026', FileType.Directory],
    ]) // top post-migrate
    .mockResolvedValueOnce([['01', FileType.Directory]]) // year 2025
    .mockResolvedValueOnce([['202501010000-claude-code-abc.md', FileType.File]]) // 2025/01
    .mockResolvedValueOnce([['02', FileType.Directory]]) // year 2026
    .mockResolvedValueOnce([['202602150930-claude-code-abc.md', FileType.File]]); // 2026/02
  ```

  Update the log assertion to expect `'Removed duplicate archive: 2025/01/202501010000-claude-code-abc.md'` (the full relative path). The `delete` path assertion (`stringContaining '202501010000-claude-code-abc.md'`) remains valid.

- [ ] **Test 2 — `'should handle three or more duplicates keeping only the newest'`**: replace the mock with:

  ```typescript
  workspace.fs.readDirectory = vi
    .fn()
    .mockResolvedValueOnce([['2025', FileType.Directory]]) // top pre-migrate
    .mockResolvedValueOnce([['2025', FileType.Directory]]) // top post-migrate
    .mockResolvedValueOnce([
      ['01', FileType.Directory],
      ['02', FileType.Directory],
      ['03', FileType.Directory],
    ]) // year 2025
    .mockResolvedValueOnce([['202501010000-cline-task1.md', FileType.File]]) // 2025/01
    .mockResolvedValueOnce([['202502100000-cline-task1.md', FileType.File]]) // 2025/02
    .mockResolvedValueOnce([['202503150000-cline-task1.md', FileType.File]]); // 2025/03
  ```

  The `deletedPaths` assertions remain valid: the timestamp-only substrings are unique within each path.

- [ ] **Test 3 — `'should not remove files with unique archiveNames'`**: replace the mock with:

  ```typescript
  workspace.fs.readDirectory = vi
    .fn()
    .mockResolvedValueOnce([['2025', FileType.Directory]]) // top pre-migrate
    .mockResolvedValueOnce([['2025', FileType.Directory]]) // top post-migrate
    .mockResolvedValueOnce([
      ['01', FileType.Directory],
      ['02', FileType.Directory],
    ]) // year 2025
    .mockResolvedValueOnce([['202501010000-claude-code-abc.md', FileType.File]]) // 2025/01
    .mockResolvedValueOnce([['202502010000-cline-task1.md', FileType.File]]); // 2025/02
  ```

  Assertion `delete not called` remains.

- [ ] **Test 4 — `'should handle empty archive directory'`**: replace the mock with `vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([])` (two empty returns covering pre-migrate and post-migrate). Assertion `delete not called` remains.

- [ ] **Test 5 — `'should handle missing archive directory gracefully'`**: keep the existing `vi.fn().mockRejectedValue(new Error('not found'))`. The first `readDirectory` call rejects, `deduplicateAndHydrate` returns early without invoking `migrateFlatLayout` or scanning year directories. Assertion `delete not called` remains.

- [ ] **Test 6 — `'should skip non-file entries'`**: rewrite the test intent as "skip non-year directories at top level and non-month entries inside year directories". Replace the mock with:

  ```typescript
  workspace.fs.readDirectory = vi
    .fn()
    .mockResolvedValueOnce([
      ['2025', FileType.Directory],
      ['notayear', FileType.Directory],
    ]) // top pre-migrate
    .mockResolvedValueOnce([
      ['2025', FileType.Directory],
      ['notayear', FileType.Directory],
    ]) // top post-migrate
    .mockResolvedValueOnce([
      ['01', FileType.Directory],
      ['notmonth', FileType.Directory],
    ]) // year 2025
    .mockResolvedValueOnce([['202501010000-claude-code-abc.md', FileType.File]]); // 2025/01
  ```

  `'notayear'` is skipped at top-level (regex `^\d{4}$` does not match), `'notmonth'` is skipped inside year 2025 (regex `^\d{2}$` does not match). The single matching file has a unique archiveName, so no duplicates. Assertion `delete not called` remains.

- [ ] **Test 7 — `'should skip files not matching the archive name pattern'`**: rewrite the test intent as "skip files inside `YYYY/MM/` that do not match the `groupArchiveFiles` PATTERN". Replace the mock with:

  ```typescript
  workspace.fs.readDirectory = vi
    .fn()
    .mockResolvedValueOnce([['2025', FileType.Directory]]) // top pre-migrate
    .mockResolvedValueOnce([['2025', FileType.Directory]]) // top post-migrate
    .mockResolvedValueOnce([['01', FileType.Directory]]) // year 2025
    .mockResolvedValueOnce([
      ['README.md', FileType.File],
      ['no-timestamp-prefix.md', FileType.File],
      ['202501010000-claude-code-abc.md', FileType.File],
    ]); // 2025/01
  ```

  The updated `groupArchiveFiles` PATTERN (Task 3.2) requires a 12-digit timestamp + `-` + name after the optional `YYYY/MM/` prefix; the first two files do not match and are skipped. The third is the only matching file (unique archiveName). Assertion `delete not called` remains.

- [ ] **Test 8 — `'should hydrate lastArchivedMap so archiveSession deletes old file'`**: place the existing archive file directly inside `2025/01/` so `migrateFlatLayout` is a no-op and hydration stores the full year/month-prefixed path. Replace the mock with:

  ```typescript
  workspace.fs.readDirectory = vi
    .fn()
    .mockResolvedValueOnce([['2025', FileType.Directory]]) // top pre-migrate
    .mockResolvedValueOnce([['2025', FileType.Directory]]) // top post-migrate
    .mockResolvedValueOnce([['01', FileType.Directory]]) // year 2025
    .mockResolvedValueOnce([['202501010000-test-session.json', FileType.File]]); // 2025/01
  ```

  Hydration sets `lastArchivedMap.set('test-session', { mtime: 0, archiveFileName: '2025/01/202501010000-test-session.json' })`. Then `archiveSession` for the source session (ctime `1_609_459_200_000` → resolves to `2021/01/`, mtime `5000`) sees `entry.mtime === 0 !== 5000`, calls `deleteFile(archiveUri/2025/01/202501010000-test-session.json)`, and writes the new archive into `2021/01/`. The `deletedPaths` assertion (`stringContaining '202501010000-test-session.json'`) remains valid: the deleted path now includes the `2025/01/` prefix but still contains the timestamp-name substring.

- [ ] **Test 9 — `'should run dedup only on first cycle after start'`**: the test runs two cycles; the second must NOT trigger dedup. Place duplicates inside `2025/01/` to exercise `removeDuplicates` on the first cycle, then verify the second cycle invokes no further `readDirectory` calls (the previous between-cycles re-mock is dropped — it is no longer consulted). Replace the mock setup with:

  ```typescript
  workspace.fs.readDirectory = vi
    .fn()
    .mockResolvedValueOnce([['2025', FileType.Directory]]) // top pre-migrate
    .mockResolvedValueOnce([['2025', FileType.Directory]]) // top post-migrate
    .mockResolvedValueOnce([['01', FileType.Directory]]) // year 2025
    .mockResolvedValueOnce([
      ['202501010000-claude-code-abc.md', FileType.File],
      ['202602150930-claude-code-abc.md', FileType.File],
    ]); // 2025/01 — two files, same archiveName, different timestamps

  const service = createService();
  service.start(DEFAULT_CONFIG);
  await service.runArchiveCycle();
  expect(workspace.fs.delete).toHaveBeenCalled();

  vi.mocked(workspace.fs.delete).mockClear();
  // Second cycle: dedup is skipped (_needsDedup is false). No further readDirectory calls.
  await service.runArchiveCycle();
  expect(workspace.fs.delete).not.toHaveBeenCalled();
  ```

  Drop the test's previous re-assignment of `workspace.fs.readDirectory` between cycles.

- [ ] **Test 10 — `'should reset dedup flag on each start call'`**: both cycles must trigger dedup. Use `vi.fn().mockImplementation(...)` keyed on `uri.fsPath` so each cycle's identical traversal returns the same values without exhausting an ordered chain:

  ```typescript
  workspace.fs.readDirectory = vi.fn().mockImplementation((uri: { fsPath: string }) => {
    const path = uri.fsPath;
    if (path.endsWith('/2025/01')) {
      return Promise.resolve([
        ['202501010000-claude-code-abc.md', FileType.File],
        ['202602150930-claude-code-abc.md', FileType.File],
      ]);
    }
    if (path.endsWith('/2025')) {
      return Promise.resolve([['01', FileType.Directory]]);
    }
    if (path.endsWith('/agent-sessions')) {
      return Promise.resolve([['2025', FileType.Directory]]);
    }
    return Promise.resolve([]);
  });
  ```

  The implementation returns consistent values across both `service.start(DEFAULT_CONFIG)` cycles. Both cycles invoke `removeDuplicates` and call `delete`. The existing assertions on `delete` having been called twice remain unchanged.

- [ ] Mark all completed checkboxes in this task.

#### [ ] Task 3.6: Update impacted documentation

- [ ] In `docs/technical-context.md`, locate section 8.6 "Agent Session Archiving Model". Replace the "Archive file naming" paragraph (`**Archive file naming:** ...`) with:

  **Archive file naming:** `{YYYY}/{MM}/{YYYYMMDDHHmm}-{archiveName}{extension}`, where the timestamp is derived from the session file's creation time (`ctime`), not the modification time or the current time. `YYYY` and `MM` are extracted as `timestamp.substring(0,4)` and `timestamp.substring(4,6)` from the `generateTimestamp('YYYYMMDDHHmm', ...)` result. The `archiveFileName` stored in `lastArchivedMap` is the full path relative to `archiveUri` (e.g., `2026/05/202605251830-foo.md`) so that delete and replace operations resolve correctly via `vscode.Uri.joinPath(archiveUri, entry.archiveFileName)`.

- [ ] Also update the `lastArchivedMap` diagram label in section 8.6 to reflect that `archiveFileName` is now a relative path:

  ```text
  lastArchivedMap: Map<archiveName, { mtime, archiveFileName }>
  ```

  Add a parenthetical: `(archiveFileName is YYYY/MM/YYYYMMDDHHmm-name.ext relative to archiveUri)`.

- [ ] Mark all completed checkboxes in this activity.

#### [ ] Task 3.7: Commit changes

- [ ] Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. If any check fails, fix the failure before proceeding — do not commit with a failing quality gate.
- [ ] Commit `src/features/agentSessionsArchiving/archiveService.ts`, `test/unit/features/agentSessionsArchiving/archiveService.test.ts`, `test/unit/features/agentSessionsArchiving/archiveService.dedup.test.ts`, `docs/technical-context.md`, and this workstream file with message: `feat(archiving): organize archive into year/month subdirectories with idempotent flat-layout migration sweep`.

### [ ] Activity 4: Add coverage and documentation for the idempotent flat-layout migration sweep

The `migrateFlatLayout` method body was added to `AgentSessionArchiveService` and wired into `deduplicateAndHydrate` in Activity 3 (Task 3.2). This activity adds the test coverage that exercises the migration paths and updates the public technical-context documentation. No production code changes are made here.

#### [ ] Task 4.1: Add unit tests for flat-layout migration

Read `test/unit/features/agentSessionsArchiving/archiveService.test.ts` in full before making any change.

- [ ] Add a new `describe('migrateFlatLayout (via deduplicateAndHydrate)', ...)` block after the existing `describe('reconfigure', ...)` block. The block contains five test cases. Import `FileType` from `../../mocks/vscode` at the top of the test file (it is already exported by `test/unit/mocks/vscode.ts` as an enum).

  Every test in this block follows the same scaffolding as the existing tests in `describe('reconfigure', ...)`: instantiate `const provider = createMockProvider([])` (no sessions — the tests exercise migration, not archival) and `const service = new AgentSessionArchiveService(workspaceRootUri, [provider], logger as any)`, then set the per-test `workspace.fs.readDirectory` / `workspace.fs.copy` / `workspace.fs.delete` mocks below, then `service.start(DEFAULT_CONFIG)` and `await service.runArchiveCycle()`, then `service.dispose()`.

  For every test in this block, recall that the new `deduplicateAndHydrate` body calls `workspace.fs.readDirectory(archiveUri)` twice (pre-migrate and post-migrate re-read), then once per `^\d{4}$` year directory, then once per `^\d{2}$` month directory inside each year. Each test sets its own mock chain covering ALL expected `readDirectory` calls — unmocked calls return `undefined` and crash the for-of loop. Use `vi.fn().mockResolvedValueOnce(...).mockResolvedValueOnce(...)…` for ordered calls; close the chain with `.mockResolvedValue([])` only if the test does not care about further reads.
  - `'should move a flat archive file into the YYYY/MM subdirectory'`: chain `workspace.fs.readDirectory` as `mockResolvedValueOnce([['202605251830-foo.md', FileType.File]])` (pre-migrate) → `mockResolvedValueOnce([])` (post-migrate re-read; the flat file has been moved away — no year dirs to iterate). Mock `workspace.fs.copy` to resolve. Mock `workspace.fs.delete` to resolve. Start the service with `DEFAULT_CONFIG` and call `await service.runArchiveCycle()`. Assert `workspace.fs.copy` was called with a destination containing `'2026/05/202605251830-foo.md'`. Assert `workspace.fs.delete` was called with a URI whose `fsPath` ends with `'202605251830-foo.md'` (the source flat file).

  - `'should be idempotent — does not move files already under YYYY/MM'`: chain as `mockResolvedValueOnce([['2026', FileType.Directory]])` (pre-migrate; only a year directory, no flat files) → `mockResolvedValueOnce([['2026', FileType.Directory]])` (post-migrate re-read; unchanged) → `mockResolvedValueOnce([])` (year-dir scan; empty for the test). `migrateFlatLayout` receives no `FileType.File` entries, so `workspace.fs.copy` is not called. Start service and call `await service.runArchiveCycle()`. Assert `workspace.fs.copy` was NOT called.

  - `'should handle a mixed tree: migrate flat files and leave YYYY/MM entries alone'`: chain as `mockResolvedValueOnce([['202605251830-foo.md', FileType.File], ['2026', FileType.Directory]])` (pre-migrate) → `mockResolvedValueOnce([['2026', FileType.Directory]])` (post-migrate re-read; flat file moved, year dir intact) → `mockResolvedValueOnce([])` (year-dir scan; empty for the test). Mock `workspace.fs.copy` and `workspace.fs.delete` to resolve. Call `await service.runArchiveCycle()`. Assert `workspace.fs.copy` was called exactly once with a path containing `'2026/05/202605251830-foo.md'`.

  - `'should overwrite the destination if it already exists'`: chain as `mockResolvedValueOnce([['202605251830-foo.md', FileType.File]])` (pre-migrate) → `mockResolvedValueOnce([])` (post-migrate re-read). Mock `workspace.fs.copy` to resolve. The `copy` call in `migrateFlatLayout` passes `{ overwrite: true }`. Assert `workspace.fs.copy` was called with the third argument `{ overwrite: true }`.

  - `'should leave the source in place and continue when copy fails'`: chain as `mockResolvedValueOnce([['202605251830-foo.md', FileType.File], ['202606011000-bar.md', FileType.File]])` (pre-migrate) → `mockResolvedValueOnce([['202605251830-foo.md', FileType.File]])` (post-migrate re-read; the failed-copy source is still present, the successful one is gone; the failed-source file is not a year directory so the dedup year loop skips it). Mock `workspace.fs.copy` to `mockRejectedValueOnce(new Error('disk full'))` then `mockResolvedValueOnce(undefined)`. Mock `workspace.fs.delete` to resolve. Assert `workspace.fs.delete` was called exactly once (for the successful copy, not the failed one). Assert `logger.warn` was called once (for the failed copy). Place an inline source-code comment in the test body immediately after the second `mockResolvedValueOnce` documenting the non-obvious behavior: `// Post-migrate top-level still contains the failed-copy source file as a File entry. The dedup year-loop in deduplicateAndHydrate only iterates entries that are FileType.Directory matching /^\d{4}$/ — the stranded File is naturally ignored. A future maintainer modifying the dedup body must preserve this property, or the failed-copy file will be processed again.`

#### [ ] Task 4.2: Update impacted documentation

- [ ] In `docs/technical-context.md`, locate section 8.6 "Agent Session Archiving Model". Find the "One-shot re-archive on startup" paragraph. After that paragraph, add the following new paragraph:

  **Idempotent flat-layout migration sweep:** On every cold start and after every `reconfigure` (any time `_needsDedup` is reset to `true`), `deduplicateAndHydrate` runs `migrateFlatLayout` before scanning year/month subdirectories. `migrateFlatLayout` reads the top-level entries of `archiveUri`; for each file whose name matches `^(\d{4})(0[1-9]|1[0-2])\d{8}-.+\.\w+$` (a flat-layout archive file with a valid month), it extracts `YYYY` and `MM` from the first four and next two characters of the filename, creates the target `YYYY/MM/` subdirectory, and moves the file there (`copy` with `overwrite: true` followed by `delete` of the source). A failed copy is logged at `warn` level; the source file is left in place and the migration continues with the next file. The sweep is idempotent: once the tree is fully migrated, no files at the top level match the flat pattern, so subsequent invocations are no-ops. After the sweep, `deduplicateAndHydrate` re-reads the top-level entries before scanning year/month subdirectories.

- [ ] Mark all completed checkboxes in this activity.

#### [ ] Task 4.3: Commit changes

- [ ] Run the quality gate: `pnpm run check-types && pnpm run lint && pnpm run test:unit`. All three must pass with zero errors and zero failures. If any check fails, fix the failure before proceeding — do not commit with a failing quality gate.
- [ ] Commit `test/unit/features/agentSessionsArchiving/archiveService.test.ts`, `docs/technical-context.md`, and this workstream file with message: `test(archiving): cover flat-layout migration paths`. The `archiveService.ts` production file is NOT in this commit — the migration code was added in Activity 3 (Task 3.2). This commit's type is `test` (not `feat`) because no production behavior is introduced here; semantic-release will not produce a release entry from it (Activity 3's `feat:` already triggers the minor bump for the migration feature).

## Divergences and notes

**Activity 1**

- **Task 1.6 (lint scope expansion)**: the workstream-listed lint command `pnpm run lint` also runs `markdownlint-cli2 '**/*.md'`, which surfaced a pre-existing MD038 (`no-space-in-code`) violation in `docs/reports/WS-0013-review-phase2.md` line 112 (a JS template literal escaped with single backticks inside an inline code span). The report itself is a sibling untracked artifact produced during the WS-0013 review phase and the workstream-listed commit set does not include it. Without the fix the quality gate fails for reasons unrelated to the production source change. Disposition: applied a minimal in-line fix to the report (single-backtick inline code → double-backtick wrap, preserving content), and extended the Activity 1 commit set to include `docs/reports/WS-0013-review-phase2.md` so the report ships on the same branch as the code that drove it. This is a review-gap signal: the markdownlint surface of the project's lint command was not surfaced during the multi-perspective review of WS-0013. Corrective: noted; no follow-up task in this WS — the production change is unaffected and the report-fix is single-line.

**Activity 2**

- **Task 2.1 (field placement ordering)**: the workstream instructs to insert `_reconfiguring` "immediately after `private readonly ensuredDirectories = new Set<string>();` (the JSDoc-annotated field introduced in Task 3.1)". This forward reference is incoherent with the activity order: Activity 2 commits before Activity 3, so `ensuredDirectories` does not yet exist when `_reconfiguring` is introduced. Inserting `_reconfiguring` at the absent anchor would produce a tsc-broken Activity 2 commit. Disposition: inserted `_reconfiguring` immediately after `private _needsDedup = true;` (the last existing private state field). In Task 3.1 (Activity 3), `ensuredDirectories` will be inserted between `_needsDedup` and `_reconfiguring`, producing the final intra-class ordering `_needsDedup`, `ensuredDirectories`, `_reconfiguring`. The two fields the workstream wanted adjacent (`ensuredDirectories` and `_reconfiguring`) ARE adjacent in the post-Activity-3 state. Corrective: workstream authoring should resolve forward references — annotate `_reconfiguring` placement against the state at Activity 2 commit time, not the post-Activity-3 state.
- **Task 2.5 (commit subject case)**: the workstream-prescribed commit subject `refactor(archiving): extend reconfigure to invoke gitignore prompt on archivePath change` contains the camelCase identifier `archivePath`, which commitlint rejects under its `subject-case: lower-case` rule (`commitlint.config.mjs`). The pre-commit hook failure cannot be bypassed (hard rule). Disposition: rewrote the subject to `refactor(archiving): extend reconfigure to invoke gitignore prompt on archive path change` (camelCase → two-word lowercase form). Semantic equivalent preserved; semantic-release mapping (`refactor:` → patch) unaffected. Corrective: workstream authoring should validate prescribed commit subjects against the project's commitlint configuration before presenting the workstream.

**Pre-execution notes (from multi-perspective review gate, 2026-05-25)**

- **F-011 (Orange Hat, accepted as out-of-scope)** — Migration without progress UI: `migrateFlatLayout` on a large pre-existing flat archive (hundreds or thousands of entries) iterates sequentially without surfacing progress to the user via `vscode.window.withProgress` or any status-bar indicator. The PM disposition is to accept this for the current workstream because the migration is one-time per user (idempotent and no-op after the first successful sweep), so the silent-disk-activity window is a single event in the extension's lifetime per installation. If user feedback later reports confusion ("why is my disk thrashing after the upgrade?"), open a follow-up workstream to wrap `migrateFlatLayout` in `vscode.window.withProgress({ location: ProgressLocation.Window, title: 'Migrating archive layout...' }, ...)` gated by an entry-count threshold (~50). No code change in this workstream.

- **F-013 (Orange Hat, accepted as out-of-scope)** — User-facing recovery documentation gap: `docs/technical-context.md` (which this workstream updates) is internal; the extension's README and Marketplace description are not touched. A separate follow-up workstream may add a "Troubleshooting archive" section covering Output Channel location, manual recovery from partial migration, and how to re-trigger the gitignore prompt (which depends on the F-010 dismissal semantics introduced here). No code change in this workstream.

### Reflection

_To be compiled at workstream completion._
