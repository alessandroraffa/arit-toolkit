import * as vscode from 'vscode';
import type { Logger } from '../../core/logger';
import { transformHeadingsInScope, splitLines } from './headingTransform';
import type { Direction, Line, TransformOutcome } from './headingTransform';

function isMarkdownUri(uri: vscode.Uri): boolean {
  return uri.fsPath.endsWith('.md') || uri.fsPath.endsWith('.markdown');
}

/**
 * Shows an information-level VS Code notification for a no-op transform outcome.
 * Returns `true` if a notice was shown (caller should return early); `false` if
 * the outcome is `'changed'` and execution should continue.
 */
function showOutcomeNotice(outcome: TransformOutcome, direction: Direction): boolean {
  if (outcome === 'no-op: no transformable heading in scope') {
    void vscode.window.showInformationMessage('Tangyr: No Markdown heading to change.');
    return true;
  }
  if (outcome === 'no-op: all in-scope headings at the limit') {
    void vscode.window.showInformationMessage(
      direction === 'increment'
        ? 'Tangyr: All headings are already at the maximum level (H6).'
        : 'Tangyr: All headings are already at the minimum level (H1).'
    );
    return true;
  }
  return false;
}

function createHeadingCommand(
  direction: Direction,
  logger: Logger
): (uri?: vscode.Uri) => Promise<void> {
  return async (uri?: vscode.Uri): Promise<void> => {
    try {
      if (uri) {
        await handleExplorer(uri, direction, logger);
      } else {
        await handleEditor(direction, logger);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to ${direction} headings`, message);
      void vscode.window.showErrorMessage(
        `Tangyr: Failed to ${direction} headings. See output for details.`
      );
    }
  };
}

async function handleExplorer(
  uri: vscode.Uri,
  direction: Direction,
  logger: Logger
): Promise<void> {
  if (!isMarkdownUri(uri)) {
    void vscode.window.showErrorMessage(
      'Tangyr: This command only works on Markdown files.'
    );
    return;
  }

  const bytes = await vscode.workspace.fs.readFile(uri);
  const text = new TextDecoder().decode(bytes);

  const lineCount = splitLines(text).length;
  const scopeLines = new Set(Array.from({ length: lineCount }, (_, i) => i));
  const result = transformHeadingsInScope(text, direction, scopeLines);

  if (showOutcomeNotice(result.outcome, direction)) {
    return;
  }

  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(result.text));
  logger.info(`${direction} headings in file: ${uri.fsPath}`);
}

function getMarkdownEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showErrorMessage('Tangyr: No active editor found.');
    return undefined;
  }
  if (editor.document.languageId !== 'markdown') {
    void vscode.window.showErrorMessage(
      'Tangyr: This command only works on Markdown files.'
    );
    return undefined;
  }
  return editor;
}

/**
 * Handles heading transformation for the active editor.
 *
 * Builds the in-scope line set from `editor.selections`. When all selections are
 * empty (cursor-only, no text selected), whole-document scope is used. Calls
 * `transformHeadingsInScope` with that set. On `'changed'`, replaces the whole
 * document range (start line 0 through last line) with the transformed text —
 * never a fragment range. On `'no-op'` outcomes, shows an information-level notice
 * in the VS Code notification area. Never aborts on limit.
 *
 * The in-scope set and the whole-document replace range are both derived from
 * `splitLines(text)` so that trailing-newline documents are consistent: a text
 * ending in '\n' produces N lines (the final empty content after the last '\n'
 * is not a separate line in splitLines), matching the line count used by the transform.
 */
async function handleEditor(direction: Direction, logger: Logger): Promise<void> {
  const editor = getMarkdownEditor();
  if (!editor) {
    return;
  }

  const text = editor.document.getText();

  // Build the in-scope line set from splitLines(text) so the line model is consistent
  // with the transform (not with editor.document.lineCount, which counts differently
  // for trailing-newline documents).
  const docLines: Line[] = splitLines(text);
  const lineCount = docLines.length;

  // Build scope from selections. If all selections are empty (cursor only), use whole document.
  const allEmpty = editor.selections.every((s) => s.isEmpty);
  let scopeLines: Set<number>;
  if (allEmpty) {
    scopeLines = new Set(Array.from({ length: lineCount }, (_, i) => i));
  } else {
    scopeLines = new Set<number>();
    for (const sel of editor.selections) {
      for (let ln = sel.start.line; ln <= sel.end.line; ln++) {
        scopeLines.add(ln);
      }
    }
  }

  const result = transformHeadingsInScope(text, direction, scopeLines);

  if (showOutcomeNotice(result.outcome, direction)) {
    return;
  }

  // outcome === 'changed': replace the whole document range.
  // Derive the end position from splitLines so the line model is consistent with the
  // in-scope set above. The last line index is lineCount - 1; its character length is
  // the content length (splitLines strips the terminator).
  const lastLineIdx = lineCount - 1;
  const lastLineContentLen = (docLines[lastLineIdx]?.content ?? '').length;
  const wholeDocRange = new vscode.Range(
    new vscode.Position(0, 0),
    new vscode.Position(lastLineIdx, lastLineContentLen)
  );

  await editor.edit((editBuilder) => {
    editBuilder.replace(wholeDocRange, result.text);
  });

  const scope = editor.selections.every((s) => s.isEmpty) ? '' : ' (selection)';
  logger.info(`${direction} headings in editor${scope}`);
}

export function createIncrementCommand(
  logger: Logger
): (uri?: vscode.Uri) => Promise<void> {
  return createHeadingCommand('increment', logger);
}

export function createDecrementCommand(
  logger: Logger
): (uri?: vscode.Uri) => Promise<void> {
  return createHeadingCommand('decrement', logger);
}
