import * as vscode from 'vscode';
import type { Logger } from '../../core/logger';
import { transformHeadingsInScope, splitLines } from './headingTransform';
import type { Direction } from './headingTransform';

function isMarkdownUri(uri: vscode.Uri): boolean {
  return uri.fsPath.endsWith('.md') || uri.fsPath.endsWith('.markdown');
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

  if (result.outcome === 'no-op: no transformable heading in scope') {
    void vscode.window.showInformationMessage('Tangyr: No Markdown heading to change.');
    return;
  }

  if (result.outcome === 'no-op: all in-scope headings at the limit') {
    void vscode.window.showInformationMessage(
      direction === 'increment'
        ? 'Tangyr: All headings are already at the maximum level (H6).'
        : 'Tangyr: All headings are already at the minimum level (H1).'
    );
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
 */
async function handleEditor(direction: Direction, logger: Logger): Promise<void> {
  const editor = getMarkdownEditor();
  if (!editor) {
    return;
  }

  const text = editor.document.getText();

  // Build scope from selections. If all selections are empty (cursor only), use whole document.
  const allEmpty = editor.selections.every((s) => s.isEmpty);
  let scopeLines: Set<number>;
  if (allEmpty) {
    const lineCount = splitLines(text).length;
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

  if (result.outcome === 'no-op: no transformable heading in scope') {
    void vscode.window.showInformationMessage('Tangyr: No Markdown heading to change.');
    return;
  }

  if (result.outcome === 'no-op: all in-scope headings at the limit') {
    void vscode.window.showInformationMessage(
      direction === 'increment'
        ? 'Tangyr: All headings are already at the maximum level (H6).'
        : 'Tangyr: All headings are already at the minimum level (H1).'
    );
    return;
  }

  // outcome === 'changed': replace the whole document range
  const lastLineNum = editor.document.lineCount - 1;
  const lastLineLength = (
    editor.document.lineAt(lastLineNum).range.end as { character: number }
  ).character;
  const wholeDocRange = {
    start: { line: 0, character: 0 },
    end: { line: lastLineNum, character: lastLineLength },
  };

  await editor.edit((editBuilder) => {
    editBuilder.replace(wholeDocRange as never, result.text);
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
