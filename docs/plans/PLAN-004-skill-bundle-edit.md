---
title: 'In-bundle SKILL.md editing implementation'
initiative: INIT-004-skill-bundle-edit
status: draft
workspaces: []
created: 2026-05-28
references:
  - docs/initiatives/INIT-004-skill-bundle-edit.md
  - docs/technical-context.md
---

## Business requirements and constraints

Per INIT-004, the plan must satisfy:

- In-editor editing of `SKILL.md` inside `.skill` ZIP archives via Explorer context menu and Command Palette.
- Automatic bundle repack on save, byte-preserving for all non-`SKILL.md` entries.
- Recovery flow when the bundle is moved, renamed, or deleted during editing.
- Template-based scaffolding when `SKILL.md` is absent from a bundle.
- Explicit error and abort on corrupted ZIP input.
- Concurrent-open behavior that focuses the existing tab instead of overwriting an in-progress buffer.
- Cleanup of extracted temp files on tab close and on activation sweep.

Extension-wide constraints inherited from the submodule architecture:

- Zero runtime dependencies. Any ZIP library enters the codebase as a dev dependency bundled by esbuild — the same model already used for `js-tiktoken` and `@anthropic-ai/tokenizer`.
- Feature isolation. The implementation lives under `src/features/skillBundleEdit/` with a single `registerSkillBundleEditFeature(ctx)` entry point. No imports from other features. Dependencies flow downward to `core/` and `utils/` only.
- ESLint complexity envelope for source files: 250 lines per file, 50 lines per function, cyclomatic complexity ≤ 10, max nesting 3, max parameters 3.
- TypeScript strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Test-first development. Unit tests mock the VS Code API via `test/unit/mocks/vscode.ts`. New ZIP fixtures are added to `test/fixtures/` and consumed by both unit and integration tests.
- Disposable pattern. Every event subscription, command, watcher, and temp-file holder is registered on `context.subscriptions` for deterministic cleanup.
- Conventional Commits with lowercase subjects. Each increment lands as one or more atomic commits.

## Alternatives considered

### ZIP support library

| Alternative  | Approach                                                                                                | Pros                                                                                                                                                                                                                     | Cons                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A (selected) | `fflate` as a dev dependency bundled by esbuild                                                         | ~12 KB minified, zero transitive dependencies, MIT, actively maintained, synchronous API surface, supports reading and writing entries with explicit metadata control, matches the existing tokenizer-bundling precedent | One additional dev dependency to track. Requires verifying the bundle continues to externalize only the VS Code API.                                                                                                                                                                                                                                     |
| B            | Pure implementation against `node:zlib` (Local File Header, Central Directory, deflate, no third party) | Truly zero new dependencies                                                                                                                                                                                              | Reimplements a well-understood format in product code. Substantial added surface (≥ 300 lines for read and write paths combined) that conflicts with the 250-line per-file ESLint limit, requires a sub-module split that does not reflect a domain decomposition, and pays an outsized maintenance cost for no incremental value over a vetted library. |

**Selection rationale.** Alternative A is consistent with the extension's existing strategy for capabilities the VS Code runtime does not provide directly: bundle the dependency at build time, keep runtime dependencies at zero. Re-implementing ZIP support would create a parser module larger than every other utility in `src/utils/` combined, for a problem space `fflate` solves with a stable, audited surface.

### Repack trigger

| Alternative  | Approach                                                                                    | Pros                                                                                                                    | Cons                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A (selected) | Auto-repack on every save of the temp `SKILL.md` (`onDidSaveTextDocument` filtered by path) | Aligns with the user's mental model: save means persist. No additional UI surface. Each save is an atomic commit point. | Each save incurs ZIP I/O. A failed repack leaves the bundle untouched on disk; the buffer remains dirty so no edits are lost.                                                                                |
| B            | Manual repack via explicit "Repack bundle" command                                          | Coarser control over when I/O happens                                                                                   | Decouples save from persistence — an anti-pattern in any editor workflow. The user has to remember the second action; forgetting it silently loses edits when the temp file is later cleaned up. Not viable. |

**Selection rationale.** Alternative A maps directly to the editor convention that saving persists. The ZIP I/O cost is negligible for typical skill bundles (kilobytes to low single-digit megabytes). Failure paths are handled by keeping the buffer dirty when repack fails, so no edit is silently lost.

### Bundle integrity for non-edited entries

| Alternative  | Approach                                                                                                                                                                            | Pros                                                                                                                                                                                                                        | Cons                                                                                                                                                                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A (selected) | Read all bundle entries with their compressed bytes and metadata. Replace only the `SKILL.md` entry. Write all preserved entries with their original compressed bytes and metadata. | The bundle is byte-stable for every file the user did not touch. Image assets, references, and scripts keep their original mtime and compressed representation. The diff between pre-edit and post-edit bundles is minimal. | Requires reading raw compressed entries and original Local File Header metadata from `fflate`'s `Unzip` low-level API rather than the convenience `unzipSync`. Adds approximately 20–30 lines of code and one extra test case per fixture.                                                           |
| B            | Decompress every entry, recompress every entry with `fflate` defaults at write time, set timestamps to "now"                                                                        | Simpler code path: one decompress-and-recompress cycle                                                                                                                                                                      | Mutates metadata of files the user never touched. Defeats the purpose of preserving the bundle as an authoring artifact: every edit to `SKILL.md` would rewrite every PNG, every reference document, every script with new mtime and potentially different compressed bytes. Loses authoring intent. |

**Selection rationale.** Alternative A reflects the principle that the tool modifies only what the user modifies. For a bundle that contains binary assets (images, sample data, compiled snippets), byte-preserving handling guarantees diff cleanliness and prevents spurious change noise in any version control system tracking the `.skill` file.

## Architectural decisions and rationale

1. **Decision: feature module at `src/features/skillBundleEdit/` with a single registration entry point.**
   The feature follows the established Tangyr feature template: a directory under `src/features/<name>/` with an `index.ts` exporting `registerSkillBundleEditFeature(ctx)`. The feature depends only on `core/` (logger, command registry) and `utils/` (only if needed). No cross-feature imports. This addresses INIT-004 objective 1 by introducing the feature without coupling to existing features.
   _Trade-offs accepted:_ A new feature adds a registration call site in `extension.ts` and a new top-level entry under `src/features/`. This is the standard cost of adding any feature in the codebase.
   _Constraints:_ The feature registration must not introduce a new background service (no timers, no file watchers tied to lifecycle). The activation footprint is limited to command registration and a single startup sweep.

2. **Decision: `fflate` as a dev dependency, bundled by esbuild, with a thin `bundle.ts` adapter.**
   `fflate` enters as a dev dependency and is bundled into `dist/extension.js` by esbuild, identically to how `js-tiktoken` and `@anthropic-ai/tokenizer` are bundled. A `bundle.ts` adapter module wraps `fflate`'s low-level API to expose two domain operations: `readSkillBundle(uri)` returning `{ skillMd, otherEntries }` and `writeSkillBundle(uri, skillMd, otherEntries)` that emits the archive with byte-preserved companions. This addresses INIT-004 objective 4.
   _Trade-offs accepted:_ One additional dev dependency in `package.json`. The supply-chain footprint expands by one well-maintained, zero-transitive-dependency library.
   _Constraints:_ The `bundle.ts` adapter must not import any VS Code API symbol. It receives URIs and returns plain data; the feature's command layer translates between the adapter and VS Code FS calls.

3. **Decision: extracted `SKILL.md` lives at `extensionContext.globalStorageUri/skill-edits/<hash>/SKILL.md`.**
   The temp file path is derived from the SHA-1 hash of the bundle's absolute `fsPath`. This produces a stable, collision-resistant mapping from any bundle to one temp path. The hash also enables the activate sweep to identify orphan directories without needing a registry persisted across sessions. This addresses INIT-004 objective 3 (well-defined storage for the editing buffer).
   _Trade-offs accepted:_ The temp file path is opaque to the user. The editor tab will show "SKILL.md" as its label without contextual bundle name. Mitigation: a single information notification on open identifying the source bundle by name; further visual context is a v2 candidate.
   _Constraints:_ The hash uses only the absolute `fsPath` of the bundle. Bundles at different paths produce different hashes; the same bundle accessed via a symlink and via its canonical path would produce different temp dirs — acceptable because VS Code itself treats them as distinct files.

4. **Decision: in-memory `SessionRegistry` keyed by bundle `fsPath`.**
   A `Map<string, EditSession>` tracks the currently open edit sessions. Each `EditSession` holds the bundle URI, the temp file URI, the text document handle, and the preserved companion entries from the original read (cached so the save path can repack without re-reading from disk and so the recovery path can include them in a new bundle even after the original is gone). The registry is cleared on tab close and on extension deactivate. This addresses INIT-004 objective 3 (concurrent open behavior) and supports the recovery flow.
   _Trade-offs accepted:_ Memory holds the compressed bytes of companion entries for every open session. For typical skill bundles this is negligible (kilobytes per session); the registry caps in practice because the user opens a small handful at most. No persistent cache.
   _Constraints:_ The cached companion entries are the snapshot from open time, not the latest on-disk state. The v1 contract is single-author hands-off-while-editing: if the user externally modifies the bundle while a session is open, the next save overwrites those external modifications with the cached snapshot. External-modification conflict detection is deferred to v2 (see Risks).

5. **Decision: `SKILL.md` template scaffolding on missing-manifest bundles.**
   When a bundle is opened and `readSkillBundle` reports that no `SKILL.md` entry exists, the command prompts the user with two choices: create a new `SKILL.md` from the standard template, or abort. The template is a versioned constant in `template.ts` containing a valid YAML frontmatter (`name`, `description` fields) followed by markdown body comments that guide the author through the standard skill structure. The template does not include an H1 heading, in compliance with the project's authoring rule that documents with YAML frontmatter must not have a redundant H1. This addresses INIT-004 objective 3 (recovery from missing manifest).
   _Trade-offs accepted:_ The template is a single canonical structure. Authors with a different preferred skill layout will edit the template content away after the first save — acceptable, the template is a starting point, not a constraint.
   _Constraints:_ The template's frontmatter `name` field defaults to a placeholder derived from the bundle filename (lowercase, no extension). The user is expected to replace it before publishing the skill.

6. **Decision: auto-repack on `onDidSaveTextDocument` filtered by temp-file path.**
   The feature subscribes to `vscode.workspace.onDidSaveTextDocument`. On each event, the handler checks whether the document's URI matches any session in the `SessionRegistry`. If matched, it reads the document text, calls `writeSkillBundle(bundleUri, newContent, cachedCompanions)`, and emits an info notification on success. On failure, the document remains dirty (because save was applied to the temp file, but the bundle is the user's source of truth) — the failure path is covered by decision 7. This addresses INIT-004 objective 2 (automatic repack).
   _Trade-offs accepted:_ A save triggers a full bundle rewrite even if the user pressed save with no changes. The cost is negligible for typical sizes.
   _Constraints:_ The handler must filter events by path containing the `skill-edits/` segment to avoid running on unrelated document saves elsewhere in the workspace.

7. **Decision: bundle-moved-or-deleted detection with "Save as new bundle" recovery.**
   Before each repack, the handler calls `vscode.workspace.fs.stat` on the bundle URI. If `stat` throws `FileNotFound`, the handler surfaces an error notification with an action button "Save as new bundle…". Clicking the action opens `vscode.window.showSaveDialog` filtered to `.skill` extension. On confirmation, the handler writes a new bundle at the chosen path containing the current buffer as `SKILL.md` and all cached companion entries. The session's bundle URI is then rebound to the new path so subsequent saves target the new bundle. This addresses INIT-004 objective 3 (recovery from bundle move/delete).
   _Trade-offs accepted:_ The recovery dialog is one extra interaction step. Cancelling the dialog leaves the buffer dirty so the user can retry or copy the content elsewhere.
   _Constraints:_ The recovery path uses only the cached companion entries from the open-time snapshot. If the user wanted to incorporate file changes that occurred between open and recovery, they would need to close the buffer and reopen the new bundle.

8. **Decision: corrupted ZIP detection at open time, hard abort.**
   When `readSkillBundle` throws — invalid signature, truncated central directory, any other malformed input — the open command surfaces an error notification with the parser's message, logs the failure via the singleton `Logger`, and aborts. No temp file is created and no editor tab is opened. This addresses INIT-004 objective 3 (graceful handling of malformed input).
   _Trade-offs accepted:_ The user cannot "force open" a corrupted bundle through the feature. Repairing a corrupted ZIP is out of scope and not what the feature is for.
   _Constraints:_ The error message identifies the bundle by basename and includes the parser's exception message for diagnostic value.

9. **Decision: concurrent open focuses the existing editor tab.**
   When the edit command is invoked on a bundle whose `fsPath` already has an entry in `SessionRegistry`, the handler calls `vscode.window.showTextDocument(existingSession.document)` to focus the existing tab and returns without re-extracting. This addresses INIT-004 objective 3 (concurrent open behavior).
   _Trade-offs accepted:_ If the existing session was somehow corrupted (the user manually deleted the temp file while the tab was open), the focus action will succeed but subsequent saves may fail. The activate sweep mitigates the cross-session case; in-session manual deletion of the temp file is outside the feature's protection envelope.
   _Constraints:_ The registry lookup uses the canonical `fsPath` of the bundle URI; symlink and case-normalization edge cases follow VS Code's own handling.

10. **Decision: cleanup on tab close (saved or unsaved) plus activate sweep.**
    Two cleanup mechanisms operate in tandem. (a) `onDidCloseTextDocument` deletes the corresponding session's temp file and removes the entry from the registry, regardless of save state. (b) On `registerSkillBundleEditFeature(ctx)` invocation at extension activation, the feature recursively removes every entry under `globalStorageUri/skill-edits/`. The activate sweep handles temp files orphaned by a crash, OS kill, or VS Code reload. This addresses INIT-004 objective 3 (deterministic temp-file lifecycle).
    _Trade-offs accepted:_ Closing a tab with unsaved changes deletes the temp file. VS Code's native "Save before close?" prompt is the user's last line of defense; closing without saving is an explicit choice. No additional in-feature confirmation is added.
    _Constraints:_ The activate sweep must run before any command can be invoked. It is synchronous in the activation path or, if asynchronous, completes before the first user invocation by sequencing the feature registration after the sweep promise.

## Concern assessment

| Concern         | Classification | Addressed by             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | -------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security        | LOW            | Increment 1              | The feature reads and writes local ZIP files. No network calls. No execution of bundle contents. `fflate` has a clean CVE history. The `bundle.ts` adapter rejects entry paths containing `..` or absolute path segments at read time (zip-slip prevention) even though the v1 feature only writes the user's home directory of edits, not extracts to arbitrary locations.                                                                                   |
| Privacy         | IRRELEVANT     |                          | No user data is collected, transmitted, or persisted outside the local extension storage area.                                                                                                                                                                                                                                                                                                                                                                |
| Compliance      | IRRELEVANT     |                          | No regulated data, no audit surface.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Accessibility   | IRRELEVANT     |                          | The feature uses the standard VS Code text editor. No new UI surface; accessibility properties are inherited from VS Code.                                                                                                                                                                                                                                                                                                                                    |
| Observability   | LOW            | Increment 2, Increment 3 | The feature emits log entries via the singleton `Logger` at `info` level for open and save, at `warn` level for missing-manifest prompts and recovery flows, and at `error` level for parse failures and repack failures. No new output channels are created.                                                                                                                                                                                                 |
| Resilience      | MEDIUM         | Increment 3              | The repack and recovery paths must handle bundle-not-found, partial-write failures, and concurrent external modification of the bundle. The save flow uses a write-to-temp-then-rename pattern for atomicity. The buffer remains dirty on any failure so no edit is lost. The activate sweep ensures cross-session resilience to crashes.                                                                                                                     |
| Performance     | LOW            |                          | Skill bundles are small (kilobytes to single megabytes). `fflate` is fast (deflate at native-level throughput). The synchronous API is acceptable because the operation is invoked by an explicit user action and bounded in size. No measurable activation overhead is added: the sweep operates on a directory that is typically empty.                                                                                                                     |
| AI governance   | IRRELEVANT     |                          | No AI/ML components introduced or modified.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| i18n            | LOW            |                          | User-facing strings (notifications, prompts, error messages) are kept in English consistent with the existing feature catalog. No translation infrastructure is added in v1.                                                                                                                                                                                                                                                                                  |
| Sustainability  | IRRELEVANT     |                          | No long-running compute. No background loops.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Supply chain    | MEDIUM         | Increment 1              | Adding `fflate` as a dev dependency expands the supply-chain surface by one package. Mitigation: `fflate` has zero runtime dependencies of its own, is pinned to an exact version in `package.json`, and is verified by integration tests that exercise the round-trip read-write pipeline against fixture bundles. The integration tests also verify that the production bundle does not externalize `fflate` (it must be inlined into `dist/extension.js`). |
| Maintainability | MEDIUM         | All increments           | The feature introduces six modules (`bundle.ts`, `tempStore.ts`, `session.ts`, `command.ts`, `template.ts`, `constants.ts`) plus `index.ts`. Each module is below the 250-line ESLint limit. The `bundle.ts` adapter is the most complex module due to ZIP metadata handling; it is exercised by unit tests covering every documented bundle shape (valid, valid-no-skill-md, empty-skill-md, invalid).                                                       |
| Quality         | HIGH           | All increments           | Every increment ships with the full TDD cycle: failing test first, implementation, refactor. Unit tests mock the VS Code API for fast feedback. Integration tests use the bundled `dist/extension.js` to verify that `fflate` is correctly inlined and that the round-trip pipeline preserves bundle integrity. Coverage thresholds: 80 % lines/functions/branches/statements for unit, 60 % for integration (per the existing project policy).               |

## Increments

### Increment 1 — Bundle I/O foundation and template

**Objective.** A pure, VS-Code-free adapter that reads and writes `.skill` ZIP archives with byte-preserving handling of non-`SKILL.md` entries. The standard `SKILL.md` template is encoded as a constant available for downstream increments.

**Dependencies.** None.

**Requirements covered.** INIT-004 objectives 2 (byte-preserving repack) and 4 (zero runtime dependency posture).

**Interventions.**

- Add `fflate` to `package.json` `devDependencies` and verify esbuild bundles it into `dist/extension.js`. Add an integration check that the production bundle does not externalize `fflate`.
- Create `src/features/skillBundleEdit/bundle.ts` exposing `readSkillBundle(uri): Promise<SkillBundleContent>` and `writeSkillBundle(uri, content): Promise<void>`. `SkillBundleContent` is `{ skillMd: string | undefined; companions: ReadonlyArray<CompanionEntry> }` where `CompanionEntry` carries the original entry name, compressed bytes, compression method, CRC, and mtime metadata sufficient for byte-preserving rewrite. The implementation rejects malformed input by throwing a typed `SkillBundleError`. Path validation rejects entry names containing `..`, absolute prefixes, and null bytes.
- Create `src/features/skillBundleEdit/template.ts` exposing `SKILL_MD_TEMPLATE: string` containing valid YAML frontmatter with `name` and `description` placeholder fields followed by markdown body comments that scaffold the standard skill structure. The template starts with the frontmatter delimiter (no H1).
- Create `src/features/skillBundleEdit/constants.ts` with command IDs, the `skill-edits` directory name, and the temp-file basename.
- Create test fixtures under `test/fixtures/skill-bundles/`: `valid-with-skill-md.skill`, `valid-no-skill-md.skill`, `valid-empty-skill-md.skill`, `valid-with-companions.skill` (multiple entries), and `invalid-not-zip.skill`. Fixtures are generated by a setup helper that uses `fflate` directly to ensure determinism.
- Write unit tests in `test/unit/features/skillBundleEdit/bundle.test.ts` covering: round-trip read-write of every fixture, byte-identical preservation of companion entries verified by SHA-256 of compressed bytes, replacement of `SKILL.md` content without affecting companions, rejection of malformed input with typed error, rejection of zip-slip entry names.
- Write unit tests for the template constant covering: parseable YAML frontmatter, presence of the required `name` and `description` keys, absence of an H1 heading after the frontmatter delimiter.

**Verifiable output.** Unit tests pass. The integration check confirms that `pnpm run compile` produces a `dist/extension.js` that contains the `fflate` inflate and deflate entry points and does not externalize the package. The `bundle.ts` adapter has no VS Code import, verified by a static check in the test suite.

### Increment 2 — Edit session: open, concurrent open, missing-manifest, corrupted-input

**Objective.** A working "open SKILL.md from bundle" workflow: invoking the command on a `.skill` extracts the manifest into a temp file under `globalStorageUri/skill-edits/<hash>/SKILL.md` and opens it in a standard editor tab. Concurrent invocations focus the existing tab. Missing-manifest cases offer the template. Corrupted input aborts cleanly.

**Dependencies.** Increment 1.

**Requirements covered.** INIT-004 objectives 1 (in-editor editing), 3 (concurrent open, missing manifest, corrupted input).

**Interventions.**

- Create `src/features/skillBundleEdit/tempStore.ts` exposing `resolveTempUri(bundleUri): vscode.Uri` (SHA-1 of `fsPath` → `globalStorageUri/skill-edits/<hash>/SKILL.md`), `writeTempFile(uri, content): Promise<void>`, `deleteTempDir(uri): Promise<void>`, and `sweepOrphans(): Promise<void>` that removes every direct child of `globalStorageUri/skill-edits/`.
- Create `src/features/skillBundleEdit/session.ts` exposing a `SessionRegistry` class with `get(bundleFsPath): EditSession | undefined`, `set(session)`, `delete(bundleFsPath)`, and `entries()`. `EditSession` is `{ bundleUri: vscode.Uri; tempUri: vscode.Uri; document: vscode.TextDocument; companions: ReadonlyArray<CompanionEntry> }`.
- Create `src/features/skillBundleEdit/command.ts` exposing `editSkillBundleCommand(bundleUri, ctx, registry)` that: (a) checks the registry for an existing session and reveals its document if present; (b) otherwise calls `readSkillBundle` and handles the four cases — `SKILL.md` present (extract and open), `SKILL.md` absent (prompt user; on accept, scaffold from template; on decline, abort), corrupted (error notification + log + abort), I/O error (error notification + log + abort); (c) on extract or scaffold success, writes the temp file, opens the document, registers the session, and emits a single info notification identifying the source bundle by basename.
- Create `src/features/skillBundleEdit/index.ts` exposing `registerSkillBundleEditFeature(ctx)` that: (a) awaits `sweepOrphans()`; (b) registers `tangyr.editSkillBundle` via the `CommandRegistry`; (c) returns a `Disposable` aggregating the command and the registry cleanup.
- Wire the feature into `src/extension.ts` after the existing feature registrations.
- Update `package.json` `contributes`: add the `tangyr.editSkillBundle` command, add an `explorer/context` menu entry conditioned on `resourceExtname == .skill`, and add a command-palette entry conditioned on the workspace being single-root (consistent with the existing pattern for stateful features).
- Unit tests in `test/unit/features/skillBundleEdit/`: `tempStore.test.ts` (hash determinism, sweep idempotence, write/delete round trip), `session.test.ts` (registry behavior), `command.test.ts` (every branch — fresh open, concurrent open focus, missing-manifest accept and decline, corrupted abort).

**Verifiable output.** Unit tests pass. A manual VS Code Extension Host smoke test confirms that right-clicking a fixture `.skill` shows the new context-menu item, that opening a valid bundle reveals the `SKILL.md` content in a standard editor tab, that re-invoking on the same bundle focuses the existing tab, that opening a bundle without `SKILL.md` prompts and (on accept) opens the template, and that opening a corrupted bundle shows an error and creates no tab.

### Increment 3 — Save flow, recovery flow, and cleanup lifecycle

**Objective.** The full edit-and-persist cycle: saving the open `SKILL.md` repacks the bundle byte-preservingly. Bundle moved or deleted at save time produces a recovery flow that creates a new `.skill`. Temp files are cleaned up on tab close and on activation sweep.

**Dependencies.** Increment 1, Increment 2.

**Requirements covered.** INIT-004 objectives 2 (auto-repack on save) and 3 (recovery from bundle move/delete, cleanup lifecycle).

**Interventions.**

- Extend `src/features/skillBundleEdit/command.ts` (or add a sibling `saveHandler.ts` if the command file approaches the 250-line limit) with a save listener registered on `vscode.workspace.onDidSaveTextDocument`. The listener filters by document URI matching a path under `globalStorageUri/skill-edits/`, looks up the session, performs a `stat` on the bundle URI, and either repacks (success path) or surfaces the recovery flow (bundle missing path).
- Implement the recovery flow: an error notification with action button "Save as new bundle…". On click, `vscode.window.showSaveDialog` with `.skill` filter; on confirm, `writeSkillBundle(chosenUri, currentBufferContent, cachedCompanions)` produces a new bundle. On success, rebind the session's `bundleUri` to the chosen path. On dialog cancel, leave the buffer dirty.
- Implement repack atomicity: write the new bundle to a sibling temp file in the same directory as the bundle (e.g., `<bundle>.skill.tmp-<pid>-<nonce>`), then `vscode.workspace.fs.rename` over the original. If the rename fails, delete the temp file and surface an error.
- Implement tab-close cleanup: subscribe to `vscode.workspace.onDidCloseTextDocument`, look up the session by document URI, call `deleteTempDir(session.tempUri.parent)`, and remove the entry from the registry.
- Verify that the activate sweep added in Increment 2 correctly removes orphans created by closing VS Code mid-edit (integration test).
- Unit tests covering: save success (bundle on disk byte-equal to expected), save failure with bundle missing → recovery dialog invoked, recovery confirm → new bundle written and session rebound, recovery cancel → buffer remains dirty, save failure with disk I/O error → error notification + buffer remains dirty, tab close → temp dir removed and registry cleared.
- Integration tests in `test/integration/vitest/features/skillBundleEdit/` exercising the bundled `dist/extension.js`: round-trip read-modify-write on a real `.skill` fixture, verifying byte-identical companions via SHA-256 of the rewritten file's central directory entries.

**Verifiable output.** Unit and integration tests pass. A manual smoke test confirms that saving the open `SKILL.md` updates the `.skill` file on disk (verified by extracting the resulting archive and comparing companion checksums), that deleting the bundle before save and then saving shows the recovery dialog and produces a valid new bundle at the chosen location, and that closing the tab removes the temp directory.

## Risks and mitigations

- **Risk: `fflate` semantics differ from the canonical ZIP specification in some edge case (e.g., non-standard compression method, ZIP64 sizes).**
  **Mitigation:** The `bundle.ts` adapter normalizes through `fflate`'s explicit API and the integration tests cover representative fixture shapes. Bundles that use uncommon features (encryption, ZIP64) are explicitly out of scope for v1; the adapter throws on unsupported flags with a clear error message.

- **Risk: race condition between the open-time companion-entry snapshot and an external modification of the bundle while the buffer is open.**
  **Mitigation:** The save handler performs a `stat` check before writing. A change in size or mtime since open could be surfaced as a conflict notification — deferred to v2 as the feature's contract is single-author editing. In v1, the external modification is overwritten with the snapshot view on save.

- **Risk: activation overhead from the orphan sweep on large `skill-edits/` directories accumulated from crashes.**
  **Mitigation:** The sweep is a single `readDirectory` followed by recursive deletes. The directory rarely accumulates more than a handful of subdirectories because the in-session cleanup is reliable. If observability shows otherwise, the sweep can be moved to an idle callback (`setTimeout` post-activation) without changing semantics.

- **Risk: package-size regression from bundling `fflate` into `dist/extension.js`.**
  **Mitigation:** `fflate` minified is approximately 12 KB. The current bundle is approximately 6 MB (dominated by tokenizer vocabularies). The added size is below 0.2 % and below typical VS Code Marketplace acceptance thresholds.

- **Risk: the `SKILL.md` template ages out of alignment with the evolving skill protocol.**
  **Mitigation:** The template is a single constant in `template.ts`, easy to update. The template is documented as a starting point, not a contract, and is exercised by tests for shape (valid frontmatter, no H1) rather than for exact content.

## Open items at completion

To be populated upon execution of all increments. Initial placeholder.
