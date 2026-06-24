---
id: WS-0024
title: 'Markdown Headings Correctness'
status: in-progress
plan: PLAN-007
spec: SPEC-005
branch: fix/markdown-headings-correctness
created: 2025-07-04
updated: 2026-06-24
---

This workstream implements [SPEC-005](../specifications/SPEC-005-markdown-headings-correctness.md) by following the seven sequential increments defined in [PLAN-007](../plans/PLAN-007-markdown-headings-correctness.md): recognition core (Activity 1), full-document context and confined transform — the SR-1/SR-2 core (Activity 2), partial transform with a three-state outcome (Activity 3), command layer rewire (Activity 4), net-new test coverage and coverage sweep (Activity 5), setext non-corruption verification (Activity 6), and user-facing documentation (Activity 7). All seven activities touch the same two source files and their tests on one shared branch; each activity consumes the prior activity's output and must leave the full quality gate green before proceeding. Obsolete test assertions are rewritten in the same commit as the behavior change that makes them obsolete: Activity 3 co-locates the `headingTransform.test.ts` abort-test rewrites with the partial-transform implementation; Activity 4 co-locates the `command.test.ts` abort/fragment-test rewrites and the full `headingTransform.test.ts` API migration with the command rewire.

## Execution instructions

Work on branch `fix/markdown-headings-correctness` created from `main`. Run the quality gate after every commit:

```bash
pnpm run check-types && pnpm run lint && pnpm run test:unit && pnpm run test:integration:vitest
```

All four checks must be green before starting the next activity.

## Architectural decisions

**Line model.** Use `splitLines(text)` (exported from `headingTransform.ts`) wherever a line index set or line count is derived from document text. `splitLines` returns one entry per line including the empty trailing entry for a bare final newline-terminated document only if the document ends in `\n\n`; a document ending in a single `\n` produces N lines (not N+1). `text.split('\n')` differs: a trailing `\n` yields an empty extra element. Use `splitLines` consistently across the shim (Activity 2), the confined transform (Activity 2), and `handleExplorer` (Activity 4).

**Shim strategy.** `transformHeadings` becomes a shim over `transformHeadingsInScope` in Activity 2 and remains a shim through Activity 3. The shim preserves the existing `{ success: true; text } | { success: false; error }` return type so `command.ts` and its tests remain untouched in Activities 2 and 3. The shim is removed entirely in Activity 4 together with `validateHeadings`, `LIMIT_ERRORS`, and the `{ success: false; error }` branch of `TransformResult`.

**Three-state outcome.** `TransformOutcome = 'changed' | 'no-op: no transformable heading in scope' | 'no-op: all in-scope headings at the limit'`. `transformHeadingsInScope` returns `{ outcome: TransformOutcome; text: string }`. The `text` field is always the full reconstructed document, equal to the input when `outcome` starts with `'no-op'`.

**Direction-aware limit notices.** When the outcome is `'no-op: all in-scope headings at the limit'`, the command layer selects the notice string based on `direction`: increment → `"Tangyr: All headings are already at the maximum level (H6)."`, decrement → `"Tangyr: All headings are already at the minimum level (H1)."`. Both use `showInformationMessage`, not `showWarningMessage`.

**No-heading notice.** When the outcome is `'no-op: no transformable heading in scope'`, show `"Tangyr: No Markdown heading to change."` via `showInformationMessage`.

**SR-1 test placement.** `transformHeadingsInScope` is not exported from `index.ts` (which exports only `registerMarkdownHeadingsFeature`), so it is not bundle-reachable. The SR-1 representative test lives in the unit suite (`headingTransform.test.ts`), not in `test/integration/vitest/`.

## Activity 1 — Recognition core

**ACs closed:** AC11, AC12, AC13, AC14, AC15, AC16, AC17, AC18, AC19, AC20, AC21, AC22.

### Task 1.1 — Write failing unit tests for the recognition core

In `test/unit/features/markdownHeadings/headingTransform.test.ts`, add a `describe('splitLines')` block and a `describe('isAtLimit')` block covering:

- `splitLines('')` returns `[]`
- `splitLines('# H\n## S\n')` returns two entries: `{ content: '# H', terminator: '\n' }` and `{ content: '## S', terminator: '\n' }`
- `splitLines('# H\r\n## S\r\n')` returns two entries with `terminator: '\r\n'`
- `splitLines('# H')` returns one entry with `terminator: ''`
- `isAtLimit(6, 'increment')` returns `true`
- `isAtLimit(1, 'decrement')` returns `true`
- `isAtLimit(3, 'increment')` returns `false`

Run the quality gate; confirm tests fail because `splitLines` and `isAtLimit` are not yet exported.

### Task 1.2 — Implement `splitLines`, `joinLines`, and export `isAtLimit`

In `src/features/markdownHeadings/headingTransform.ts`:

Add `splitLines(text: string): Array<{ content: string; terminator: string }>` that scans `text` and returns one object per line; the terminator is `'\r\n'` if the line ends with `\r\n`, `'\n'` if it ends with `'\n'`, or `''` for the last line when no newline follows. An empty string input returns `[]`.

Add `joinLines(lines: Array<{ content: string; terminator: string }>): string` that concatenates `content + terminator` for each entry.

Export `isAtLimit` (it is currently an unexported function — add the `export` keyword).

Export `splitLines` and `joinLines`.

Do not modify `transformHeadings`, `validateHeadings`, `LIMIT_ERRORS`, `TransformResult`, `Direction`, `HEADING_RE`, `FENCE_RE`, `isInsideCodeBlock`, `isClosingFence`, or `applyTransform`.

### Task 1.3 — Implement column-based ATX recognition

Update the recognition logic so that a line is treated as an ATX heading only when the `#` sequence starts at column 0–3 (after tab expansion at 4-column stops). A `#` at column 4 or beyond is not a heading. Update `HEADING_RE` or add a separate column check inside `applyTransform` — whichever fits cleanly into the existing structure.

Add unit tests in the `describe('column-based recognition')` block:

- A line beginning with four spaces followed by `# Heading` is not treated as a heading
- A line beginning with three spaces followed by `# Heading` is treated as a heading
- A tab followed by `# Heading` is not treated as a heading (tab expands to column 4)

### Task 1.4 — Commit Activity 1

Verify the quality gate is fully green. Commit with:

```text
feat(markdownHeadings): add splitLines, joinLines, column-based ATX recognition
```

Files: `src/features/markdownHeadings/headingTransform.ts`, `test/unit/features/markdownHeadings/headingTransform.test.ts`.

## Activity 2 — Full-document context and confined transform

**ACs closed:** AC1, AC2, AC3, AC4, AC10, AC23, AC26.

### Task 2.1 — Write failing unit tests for `transformHeadingsInScope`

In `test/unit/features/markdownHeadings/headingTransform.test.ts`, add a `describe('transformHeadingsInScope')` block. Write failing tests covering:

- Whole-document scope with a multi-heading document: all headings shift; `outcome` is `'changed'`; `text` is the full transformed document
- A scope restricted to a subset of lines: only the in-scope headings shift; headings outside the scope are unchanged
- A scope containing no headings: `outcome` is `'no-op: no transformable heading in scope'`; `text` equals the input
- A scope where all headings are already at the H6 limit (increment): `outcome` is `'no-op: all in-scope headings at the limit'`; `text` equals the input
- A scope where all headings are already at the H1 limit (decrement): same pattern
- A heading inside a fenced code block is not transformed
- A heading inside an indented code block (3-space fence; per existing `'should handle indented code block fences'` test) is not transformed

Run the quality gate; confirm new tests fail.

### Task 2.2 — Implement `transformHeadingsInScope` and update the shim

In `src/features/markdownHeadings/headingTransform.ts`:

Add and export:

```typescript
export type TransformOutcome =
  | 'changed'
  | 'no-op: no transformable heading in scope'
  | 'no-op: all in-scope headings at the limit';

export function transformHeadingsInScope(
  text: string,
  direction: Direction,
  scopeLines: Set<number>,
): { outcome: TransformOutcome; text: string } { ... }
```

Implementation: call `splitLines(text)` to get the line array. Derive `lineCount` as `splitLines(text).length` (not `text.split('\n').length`). Iterate over the line array. For each line whose index is in `scopeLines`: apply the ATX column check; skip fenced-code-block lines (track state across all lines, not only in-scope ones, so context is correct for SR-1/SR-2). Collect which in-scope lines were actually transformable and which were already at the limit. Determine `outcome`:

- If at least one heading was changed: `'changed'`
- If no headings were in scope (no transformable heading found in scope): `'no-op: no transformable heading in scope'`
- If all in-scope headings were already at the limit: `'no-op: all in-scope headings at the limit'`

Return `{ outcome, text: joinLines(transformedLines) }`. When `outcome` starts with `'no-op'`, `text` equals the input exactly.

Update `transformHeadings` (the shim) to call `transformHeadingsInScope` with a `scopeLines` set containing all line indices (`new Set(Array.from({ length: lineCount }, (_, i) => i))`), deriving `lineCount` with `splitLines(text).length`. The shim maps the result back to `{ success: true; text: string } | { success: false; error: string }`:

- `outcome === 'changed'`: return `{ success: true, text: result.text }`
- `outcome === 'no-op: no transformable heading in scope'`: return `{ success: true, text: result.text }` (no-heading case is a success in the old API — the old `validateHeadings` only aborted for limit errors)
- `outcome === 'no-op: all in-scope headings at the limit'`: still call the existing `validateHeadings` path; keep `validateHeadings` and `LIMIT_ERRORS` in this file and call them from the shim so the shim can still return `{ success: false, error: ... }` for the abort case. This keeps `command.ts` and its tests unchanged in this activity.

Do not modify `TransformResult`, `validateHeadings`, `LIMIT_ERRORS`, or `command.ts`.

### Task 2.3 — Update JSDoc on `transformHeadingsInScope`

Add a JSDoc comment above `transformHeadingsInScope` documenting: the `scopeLines` parameter is a zero-based set of line indices that are in scope; lines outside `scopeLines` pass through unchanged; code-block context is tracked across all lines regardless of scope membership (SR-1/SR-2 correctness); returns a three-state outcome and the full reconstructed document text.

### Task 2.4 — Commit Activity 2

Verify the quality gate is fully green. Commit with:

```text
feat(markdownHeadings): add transformHeadingsInScope with three-state outcome and terminator-preserving line model
```

Files: `src/features/markdownHeadings/headingTransform.ts`, `test/unit/features/markdownHeadings/headingTransform.test.ts`.

## Activity 3 — Partial transform with finalized three-state outcome

**ACs closed:** AC5, AC6, AC7, AC8.

### Task 3.1 — Write failing unit tests for partial transform behavior

In `test/unit/features/markdownHeadings/headingTransform.test.ts`, add to the `describe('transformHeadingsInScope')` block:

- A mixed-scope document where some in-scope headings are at the limit and others are not: only the non-limit headings shift; `outcome` is `'changed'` (partial transform, not a no-op)
- A scope spanning lines 1–3 of a five-heading document: only those three headings shift; headings on lines 0 and 4 are unchanged
- Multi-selection de-dup: a `scopeLines` set built by unioning two overlapping selection ranges produces the same result as the union set applied once

Run the quality gate; confirm new tests fail.

### Task 3.2 — Finalize partial transform in `transformHeadingsInScope`

In `src/features/markdownHeadings/headingTransform.ts`, update `transformHeadingsInScope` so that when a scope contains a mix of transformable and at-limit headings, the transformable headings are shifted and the at-limit headings are left unchanged; the outcome is `'changed'` (not a no-op). The existing `'no-op: all in-scope headings at the limit'` outcome is returned only when every in-scope heading is already at the limit.

Do NOT remove `validateHeadings`, `LIMIT_ERRORS`, or the `{ success: false; error }` branch of `TransformResult` in this activity. The shim continues to call `validateHeadings` so that `command.ts` and its tests remain unchanged. `TransformResult` is unchanged. `check-types` passes without touching `command.ts`.

### Task 3.3 — Rewrite abort-string tests in `headingTransform.test.ts`

In `test/unit/features/markdownHeadings/headingTransform.test.ts`:

Locate the two tests currently asserting abort behavior via `transformHeadings`:

- `'should handle h6 headings by aborting'` (inside `describe('increment')`) — currently asserts `{ success: false, error: 'Cannot increment...' }`
- `'should abort when any heading is already h1'` (inside `describe('decrement')`) — currently asserts `{ success: false, error: 'Cannot decrement...' }`

Rewrite both tests to call `transformHeadingsInScope` instead of `transformHeadings` and assert the three-state outcome. Use pure all-at-limit inputs so the asserted no-op is correct:

- The all-H6 increment case: input is `'###### A\n\n###### B'` (every heading already H6). Call `transformHeadingsInScope(input, 'increment', new Set([0, 2]))`. Assert `expect(result).toEqual({ outcome: 'no-op: all in-scope headings at the limit', text: input })`.
- The all-H1 decrement case: input is `'# A\n\n# B'` (every heading already H1). Call `transformHeadingsInScope(input, 'decrement', new Set([0, 2]))`. Assert `expect(result).toEqual({ outcome: 'no-op: all in-scope headings at the limit', text: input })`.

These tests now pass because `transformHeadingsInScope` supports the three-state outcome. The pure all-at-limit inputs guarantee the `no-op` outcome: mixed-scope inputs such as `'## Section\n\n###### Deep heading'` (H2+H6 increment) or `'# Title\n\n## Section'` (H1+H2 decrement) produce `outcome: 'changed'` under partial transform and must not be used for these two tests. If a separate test for the mixed-scope `'changed'` case is desired, add it as a distinct test asserting `outcome: 'changed'` with the expected transformed text.

Do not remove the two abort tests that test `transformHeadings` (the shim) if any remain — confirm whether the `describe('increment')` and `describe('decrement')` blocks contain other tests calling `transformHeadings` that must stay green. Those tests continue to call the shim and assert `{ success: true, text }` or `{ success: false, error }` as before; they will be migrated in Activity 4.

### Task 3.4 — Update JSDoc on `transformHeadingsInScope`

Update the JSDoc comment above `transformHeadingsInScope` to reflect the finalized partial-transform rule: the `'no-op: all in-scope headings at the limit'` outcome is returned only when every in-scope heading is already at the limit; a mixed scope (some at limit, some not) is `'changed'`.

### Task 3.5 — Commit Activity 3

Verify the quality gate is fully green (check-types, lint, test:unit, test:integration:vitest). Commit with:

```text
fix(markdownHeadings): remove limit abort and finalize three-state partial-transform outcome
```

Files: `src/features/markdownHeadings/headingTransform.ts`, `test/unit/features/markdownHeadings/headingTransform.test.ts`.

## Activity 4 — Command layer rewire

**ACs closed:** AC5, AC6 (command notification layer), AC7, AC8 (command notification layer), AC9, AC24, AC25.

### Task 4.1 — Write failing command-layer tests

In `test/unit/features/markdownHeadings/command.test.ts`, extend `createMockEditor` to:

1. Accept `selections?: Array<{ start: { line: number; character: number }; end: { line: number; character: number }; isEmpty: boolean }>` as the third parameter (replacing the current single-object optional parameter).
2. Return the extended type:

```typescript
{
  document: {
    getText: ReturnType<typeof vi.fn>;
    languageId: string;
    lineAt: ReturnType<typeof vi.fn>;
    lineCount: number;
  }
  selection: {
    start: {
      line: number;
      character: number;
    }
    end: {
      line: number;
      character: number;
    }
    isEmpty: boolean;
  }
  selections: Array<{
    start: { line: number; character: number };
    end: { line: number; character: number };
    isEmpty: boolean;
  }>;
  edit: ReturnType<typeof vi.fn>;
}
```

When `selections` is provided and non-empty, `selection` is `selections[0]`; when omitted, both `selection` and `selections` represent a whole-document selection (`isEmpty: true`, start and end at line 0 / character 0).

Add the following failing tests (in a `describe('rewired command')` block or inline with existing tests):

**Whole-document replacement (no selection):** Call `handleEditor` with a mock editor whose `selections` is empty/whole-document. Assert that `editBuilder.replace` is called with the whole-document range (start: `{ line: 0, character: 0 }`, end: `{ line: lineCount - 1, character: lastLineLength }`), not a fragment range.

**Fragment selection replaced by whole-document range:** A document with three headings — `'# Title\n## Section\n### Sub'` (line 0, 1, 2). Selection covers lines 1–2 (a fragment). Assert that `editBuilder.replace` is called with the whole-document range end at `{ line: 2, character: 7 }` (not `character: 9`; `'### Sub'` is 7 characters). Assert that the replacement text is the full transformed document (not just the fragment text). The in-scope set for this call contains line indices 1 and 2.

**No heading in scope:** Call `handleEditor` with a document containing no ATX headings. Assert `showInformationMessage` is called with `"Tangyr: No Markdown heading to change."`. Assert `edit` is not called.

**All at limit (increment):** A document where all headings are `######`. Assert `showInformationMessage` is called with `"Tangyr: All headings are already at the maximum level (H6)."`. Assert `edit` is not called.

**All at limit (decrement):** A document where all headings are `#`. Assert `showInformationMessage` is called with `"Tangyr: All headings are already at the minimum level (H1)."`. Assert `edit` is not called.

**Explorer path — trailing-newline lineCount:** A file with content `'# Title\n## Section\n'`. Assert `lineCount` passed to `transformHeadingsInScope` is 2 (not 3 — `splitLines` gives 2 lines; `split('\n')` gives 3). Confirm `writeFile` is called with the transformed content.

**Explorer path — CRLF lineCount:** A file with content `'# Title\r\n## Section\r\n'`. Assert `lineCount` passed to `transformHeadingsInScope` is 2. Confirm `writeFile` is called and CRLF terminators are preserved in the output.

### Task 4.2 — Rewire `command.ts` and remove the shim infrastructure

In `src/features/markdownHeadings/headingTransform.ts`:

Remove `validateHeadings`, `LIMIT_ERRORS`, the `{ success: false; error: string }` branch of `TransformResult`, and the `transformHeadings` shim. Remove the `TransformResult` type export entirely (it is no longer needed). Keep `Direction`, `TransformOutcome`, `TransformResult` (if still used elsewhere — if not, remove), `splitLines`, `joinLines`, `isAtLimit`, `transformHeadingsInScope`, and all internal helpers (`HEADING_RE`, `FENCE_RE`, `isInsideCodeBlock`, `isClosingFence`, `applyTransform`).

In `src/features/markdownHeadings/command.ts`:

Remove the import of `transformHeadings` and `TransformResult`. Add imports of `transformHeadingsInScope`, `TransformOutcome`, `splitLines`, and `Direction` from `./headingTransform`.

Remove `getTargetRange` entirely.

Rewrite `handleEditor(editor, direction)`:

1. Build the in-scope line-index set by iterating `editor.selections`. For each selection, add every line index from `selection.start.line` to `selection.end.line` (inclusive) to a `Set<number>`. If the resulting set is empty or every selection is `isEmpty`, add all line indices (whole-document scope).
2. Call `transformHeadingsInScope(editor.document.getText(), direction, scopeLines)`.
3. On `outcome === 'no-op: no transformable heading in scope'`: call `vscode.window.showInformationMessage('Tangyr: No Markdown heading to change.')` and return.
4. On `outcome === 'no-op: all in-scope headings at the limit'`: call `vscode.window.showInformationMessage(direction === 'increment' ? 'Tangyr: All headings are already at the maximum level (H6).' : 'Tangyr: All headings are already at the minimum level (H1).')` and return.
5. On `outcome === 'changed'`: call `editor.edit(editBuilder => editBuilder.replace(wholeDocRange, result.text))` where `wholeDocRange` spans from `{ line: 0, character: 0 }` to `{ line: lastLine, character: lastLineLength }`.

Rewrite `handleExplorer(uri, direction)`:

1. Read the file bytes via `vscode.workspace.fs.readFile(uri)`.
2. Decode to text via `new TextDecoder().decode(bytes)`.
3. Derive `lineCount` as `splitLines(text).length`.
4. Build `scopeLines` as `new Set(Array.from({ length: lineCount }, (_, i) => i))` (whole-document scope for Explorer).
5. Call `transformHeadingsInScope(text, direction, scopeLines)`.
6. On `outcome === 'no-op: no transformable heading in scope'`: call `vscode.window.showInformationMessage('Tangyr: No Markdown heading to change.')` and return.
7. On `outcome === 'no-op: all in-scope headings at the limit'`: call `vscode.window.showInformationMessage(direction === 'increment' ? 'Tangyr: All headings are already at the maximum level (H6).' : 'Tangyr: All headings are already at the minimum level (H1).')` and return.
8. On `outcome === 'changed'`: call `vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(result.text))`.

Remove all references to `result.error`, `result.success`, `showWarningMessage` (for limit/heading messages), and `getTargetRange`.

### Task 4.3 — Rewrite command tests and migrate `headingTransform` tests

In `test/unit/features/markdownHeadings/command.test.ts`:

Locate and rewrite these existing tests:

- `'should transform only selection when selection exists'` (currently asserts fragment-range replacement) — rewrite to assert whole-document-range replacement as specified in Task 4.1. The whole-document range end character for the document `'# Title\n## Section\n### Sub'` is `character: 7`.
- `'should show error when transform fails (h6 limit)'` and `'should show error when transform fails from explorer'` — rewrite to assert `showInformationMessage` with `"Tangyr: All headings are already at the maximum level (H6)."`.
- `'should show error when transform fails (h1 limit)'` — rewrite to assert `showInformationMessage` with `"Tangyr: All headings are already at the minimum level (H1)."`.

Confirm that `showWarningMessage` is never asserted in `command.test.ts` after these rewrites.

In `test/unit/features/markdownHeadings/headingTransform.test.ts`:

Migrate all remaining tests that call `transformHeadings` (the now-removed shim) to call `transformHeadingsInScope`. For each migrated test:

- Former `{ success: true, text: '...' }` assertions become `toEqual({ outcome: 'changed', text: '...' })`.
- Former `{ success: true, text: input }` assertions for no-heading cases become `toEqual({ outcome: 'no-op: no transformable heading in scope', text: input })`.
- Each migrated test call must supply a `scopeLines` set covering all lines of the input document: `new Set(Array.from({ length: splitLines(input).length }, (_, i) => i))`.

The two abort-string tests already rewritten in Activity 3 Task 3.3 are already calling `transformHeadingsInScope` — leave them unchanged.

Confirm zero remaining calls to `transformHeadings` in `headingTransform.test.ts` and zero remaining calls to `transformHeadings` in `command.test.ts` after this task.

**Error-level notice pin (AC9).** After the rewrites above, confirm the following in `command.test.ts`: (a) `showWarningMessage` is not asserted anywhere for the limit or no-heading outcomes — those now use `showInformationMessage`; (b) the genuine-failure guards — no active editor (`handleEditor` called when `vscode.window.activeTextEditor` is `undefined`) and non-Markdown Explorer target (AC9) — still assert `showErrorMessage` (or the existing failure-level notice function, whichever the pre-existing tests use). `showErrorMessage` must remain present for those two guards and must not have been removed by the rewrite. If a pre-existing test for these guards used `showWarningMessage`, update it to `showErrorMessage` now.

### Task 4.4 — Update JSDoc above `handleEditor`

In `src/features/markdownHeadings/command.ts`, add a JSDoc comment above `handleEditor` documenting: builds the in-scope line set from `editor.selections`; whole-document scope is used when all selections are empty; calls `transformHeadingsInScope`; replaces the whole document range on `'changed'`; shows an information-level notice on `'no-op'` outcomes; never aborts on limit.

### Task 4.5 — Commit Activity 4

Verify the quality gate is fully green. Commit with:

```text
fix(markdownHeadings): rewire command to transformHeadingsInScope, remove abort, add direction-aware notices
```

Files: `src/features/markdownHeadings/headingTransform.ts`, `src/features/markdownHeadings/command.ts`, `test/unit/features/markdownHeadings/headingTransform.test.ts`, `test/unit/features/markdownHeadings/command.test.ts`.

## Activity 5 — Net-new test coverage and coverage sweep

**ACs closed:** AC1, AC2 (SR-1 representative); BK-005, BK-006, BK-007.

### Task 5.1 — Grep sweep: confirm zero abort-string consumers in test files

Run:

```bash
grep -r 'Cannot increment\|Cannot decrement\|LIMIT_ERRORS\|validateHeadings\|success: false' \
  test/unit/features/markdownHeadings/ \
  test/integration/vitest/features/markdownHeadings/
```

Expected: zero matches. The abort-string tests were rewritten in Activities 3 and 4. If any match is found, it is a defect in a prior activity; fix it in this activity before proceeding.

Separately confirm that `transformHeadings` (the removed shim) is not imported in any test file:

```bash
grep -r 'transformHeadings[^I]' \
  test/unit/features/markdownHeadings/ \
  test/integration/vitest/features/markdownHeadings/
```

Expected: zero matches. (`transformHeadingsInScope` should still appear.)

### Task 5.2 — Add SR-1 representative unit test and CRLF Explorer round-trip test

In `test/unit/features/markdownHeadings/headingTransform.test.ts`, add a `describe('SR-1 representative')` block:

- Input document: a fenced code block opened before the selection that contains a line beginning with `##`. The selection (scope) starts inside the code block. Assert that the heading inside the code block is NOT transformed and `outcome` is `'no-op: no transformable heading in scope'` (or `'changed'` if there are also real headings outside the code block — pin the exact case to confirm the fence-state tracking works correctly regardless of scope).
- Input document: A real heading above the code block and a `##` line inside the code block; the scope covers both. Assert that only the real heading is transformed.

In `test/unit/features/markdownHeadings/command.test.ts`, add a `describe('CRLF round-trip (Explorer)')` block:

- Input file content: `'# Title\r\n## Section\r\n'`. Call `handleExplorer` with increment direction. Assert `writeFile` is called. Assert the content written by `writeFile` preserves `\r\n` terminators: `'## Title\r\n### Section\r\n'`.
- Input file content: `'###### Deep\r\n'`. Call `handleExplorer` with increment direction. Assert `showInformationMessage` is called with the H6 limit message. Assert `writeFile` is NOT called.

In `test/unit/features/markdownHeadings/command.test.ts`, add a `describe('SR-1 command-path (handleEditor)')` block:

- Input document: `'```\n## Inside\n```'` (a fenced code block containing a line that looks like an ATX heading). Build a mock editor with `getText()` returning that document and a `selections` array covering all three lines (`start: { line: 0, character: 0 }, end: { line: 2, character: 3 }, isEmpty: false`). Call `handleEditor(mockEditor, 'increment')`. Assert that `edit` is NOT called (no replacement was applied). Assert that `showInformationMessage` is called with `"Tangyr: No Markdown heading to change."` — confirming that the fence-state tracking prevents the in-code-block heading from being treated as a real heading through the full command dispatch path.

### Task 5.3 — Verify JSDoc completeness on `transformHeadingsInScope`

Read `src/features/markdownHeadings/headingTransform.ts`. Confirm the JSDoc above `transformHeadingsInScope` documents: the `scopeLines` parameter (zero-based line indices in scope), code-block context tracking (all lines, not only in-scope), the three `outcome` values and when each is returned, and the invariant that `text` equals the input when `outcome` starts with `'no-op'`.

If any of these are missing from the JSDoc, add them now. If all are present, proceed.

### Task 5.4 — Commit Activity 5

Verify the quality gate is fully green. Commit with:

```text
test(markdownHeadings): add SR-1 representative unit test and CRLF Explorer round-trip
```

Files: `test/unit/features/markdownHeadings/headingTransform.test.ts`, `test/unit/features/markdownHeadings/command.test.ts`.

## Activity 6 — Setext non-corruption verification

**ACs closed:** AC27, AC28.

**Ordering constraint.** Activity 6 must complete (and its commit must be pushed) before Activity 7 is started. The setext known-limitation note in the README (Activity 7 Task 7.2) and the shipping commit body (Activity 7 Task 7.3) reference the setext behavior; that behavior must be confirmed green before the note is written.

### Task 6.1 — Write failing setext non-corruption test

In `test/unit/features/markdownHeadings/headingTransform.test.ts`, add a `describe('setext headings (non-corruption)')` block:

- A document containing a setext H1 (`Title\n=====`) followed by an ATX heading (`## Section`). Scope covers all lines. Call `transformHeadingsInScope` with increment direction. Assert that the setext heading is not transformed (not treated as a heading, not corrupted). Assert that the ATX heading `## Section` becomes `### Section`. Assert `outcome` is `'changed'`.
- Same document, decrement direction. Assert setext heading is not transformed. Assert `## Section` becomes `# Section`.
- A document containing only a setext heading. Assert `outcome` is `'no-op: no transformable heading in scope'` and `text` equals the input.

Run the quality gate; confirm new tests fail if setext headings are currently mishandled.

### Task 6.2 — Implement setext non-corruption (if tests fail)

If Task 6.1 tests pass without code changes (setext headings are already ignored because `HEADING_RE = /^(#{1,6})\s/` does not match setext), confirm this is the case and skip implementation. Document the confirmation as a comment in the test block: `// Setext headings do not match HEADING_RE — no code change required.`

If tests fail, update `isInsideCodeBlock`, `applyTransform`, or the line iteration in `transformHeadingsInScope` to skip setext underline lines. A setext underline is a line matching `/^[=\-]+\s*$/` that immediately follows a non-empty, non-heading text line. Add the skip logic in the same minimal location.

### Task 6.3 — Commit Activity 6

Verify the quality gate is fully green. Commit with:

```text
test(markdownHeadings): verify setext heading non-corruption
```

Files: `test/unit/features/markdownHeadings/headingTransform.test.ts`. (Add `src/features/markdownHeadings/headingTransform.ts` only if Task 6.2 required code changes.)

## Activity 7 — User-facing documentation

**ACs closed:** SPEC-005 Known limitations §1 (setext desync documentation); release readiness.

### Task 7.1 — Update CHANGELOG.md

In `CHANGELOG.md`, add an `[Unreleased]` section (or append to the existing one) with a `### Fixed` entry:

```text
- Markdown Headings: partial transform — headings at the level limit are skipped; the remaining headings in scope are still changed
- Markdown Headings: multi-selection support — union of all selection ranges determines the in-scope set
- Markdown Headings: limit and no-heading cases now show an information-level notice instead of a warning
- Markdown Headings: CRLF line endings are preserved in the output
- Markdown Headings: known limitation — setext headings (underline style) are not recognised or transformed
```

### Task 7.2 — Update README.md

In `README.md`, locate the `## Markdown Headings` section. Replace the existing sentence "If any heading would exceed the valid range (h1–h6), the entire operation is aborted with a message." with:

"Headings at the level limit are skipped; the remaining headings in scope are still changed. When no heading is found or all headings are already at the limit, an information-level notice appears in the VS Code notification area."

At the end of the `## Markdown Headings` section, add a known-limitation note using the bold-label format (no `###` subsection heading):

**Known limitations.** Setext-style headings (underline with `===` or `---`) are not recognised or transformed. If a document uses setext headings exclusively, the command will show "No Markdown heading to change." Converting setext headings to ATX style before using this command keeps the document visibly in sync.

Do not add a `### Known limitations` subsection heading. The `## Markdown Headings` section uses only `##`-level structure; a bold label is the correct format for this inline limitation note.

### Task 7.3 — Shipping commit

Verify the quality gate is fully green. Commit with the following message and body:

```text
fix(markdownHeadings): partial transform, multi-selection, direction-aware notices, CRLF preservation

Behavior changes visible to users:

- Abort replaced by partial transform: headings that would exceed H1 or H6 are
  now skipped; the remaining in-scope headings are still changed. The operation
  no longer aborts when any heading is at the limit.
- Limit case is now an information-level notice (not a warning): when all
  in-scope headings are already at the maximum or minimum level, a notice
  appears in the VS Code notification area. The direction-specific wording is:
  increment → "All headings are already at the maximum level (H6)."
  decrement → "All headings are already at the minimum level (H1)."
- No-heading case is also an information-level notice: "No Markdown heading to
  change." is shown when no ATX heading is found in scope.
- CRLF line endings are preserved: the output document uses the same per-line
  terminator as the input.
- Known limitation: setext-style headings (underline with === or ---) are not
  recognised or transformed. A document using setext headings exclusively will
  show "No Markdown heading to change." and remain visibly out of sync until
  the headings are converted to ATX style.
```

Files: `README.md`, `CHANGELOG.md`.

## Divergences

**PLAN-007 / Increment 5 — SR-1 test placement.** PLAN-007 Increment 5 names the SR-1 guard an integration test. `transformHeadingsInScope` is not bundle-reachable (`index.ts` exports only `registerMarkdownHeadingsFeature`), so the transform-level SR-1 test is placed in the unit suite (`headingTransform.test.ts`). A command-path SR-1 test through `handleEditor` with a mocked editor whose selection is inside a fenced code block provides the command-level regression coverage: the code bytes inside the block are left unchanged, confirming SR-1 correctness through the full command dispatch path. This command-path test is part of Activity 5 net-new coverage (Task 5.2).

**Task 1.2 — `HEADING_RE` and `applyTransform` modified in Task 1.2 scope.** Task 1.2 said "Do not modify... `HEADING_RE`... or `applyTransform`." However, Task 1.3 required updating `HEADING_RE` for column-based recognition, which also required updating `applyTransform` to correctly extract and preserve leading spaces from indented headings. Both changes were required by Task 1.3 and were made as part of Activity 1's natural sequence (1.2 then 1.3 in one pass). The resulting code is correct and all tests pass. This is a minor sequencing note: the StepLedger authored 1.2 and 1.3 as separate steps but the HEADING_RE change naturally touches both. No behavioral divergence.

**Task 1.3 — `Line` interface required instead of `type`.** The project ESLint config enforces `@typescript-eslint/consistent-type-definitions` (interface over type). The `Line` type added in Task 1.2 was initially declared as `export type Line = {...}` which triggered a lint error. Converted to `export interface Line { ... }` to comply.

**Activity 1 — Completed.**

**Task 2.2 — `applyTransform` removed in Activity 2 (compile necessity).** Task 2.2 said "Do not modify... `applyTransform`." However, `transformHeadings` shim now calls `transformHeadingsInScope` instead of `applyTransform`, making `applyTransform` unreachable dead code. TypeScript `noUnusedLocals: true` blocks compilation unless removed. Removing `applyTransform` has no behavioral effect — its logic is fully superseded by `transformHeadingsInScope`. Recorded as compile-necessity divergence.

**Task 2.2 — Commit scope name adjusted.** StepLedger specifies commit scope `markdownHeadings` (camelCase) but the project's commitlint `subject-case: lower-case` rule rejects uppercase in subjects. All activity commits use `markdown-headings` (kebab-case) matching existing project commit history.

**Activity 2 — Completed.**

**Task 3.1 — Tests passed immediately (no failing phase).** Activity 2's implementation of `transformHeadingsInScope` already correctly handles partial transforms (mixed at-limit and non-limit headings). All three new Task 3.1 tests passed without code changes. This is correct behavior — the StepLedger's "write failing tests first" ordering assumes tests would fail, but the Activity 2 logic was already complete for this case.

**Activity 3 — Completed.**

## Reflection

No reflection entries yet.
