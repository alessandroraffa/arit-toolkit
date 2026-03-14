import * as vscode from 'vscode';
import type { Logger } from '../../core/logger';
import { transformHeadings } from './headingTransform';
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
        `ARIT: Failed to ${direction} headings. See output for details.`
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
      'ARIT: This command only works on Markdown files.'
    );
    return;
  }

  const bytes = await vscode.workspace.fs.readFile(uri);
  const text = new TextDecoder().decode(bytes);
  const result = transformHeadings(text, direction);

  if (!result.success) {
    void vscode.window.showWarningMessage(`ARIT: ${result.error}`);
    return;
  }

  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(result.text));
  logger.info(`${direction} headings in file: ${uri.fsPath}`);
}

function getTargetRange(editor: vscode.TextEditor): vscode.Range {
  if (!editor.selection.isEmpty) {
    const startLine = editor.document.lineAt(editor.selection.start.line);
    const endLine = editor.document.lineAt(editor.selection.end.line);
    return new vscode.Range(startLine.range.start, endLine.range.end);
  }

  const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
  return new vscode.Range(editor.document.lineAt(0).range.start, lastLine.range.end);
}

function getMarkdownEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showErrorMessage('ARIT: No active editor found.');
    return undefined;
  }
  if (editor.document.languageId !== 'markdown') {
    void vscode.window.showErrorMessage(
      'ARIT: This command only works on Markdown files.'
    );
    return undefined;
  }
  return editor;
}

async function handleEditor(direction: Direction, logger: Logger): Promise<void> {
  const editor = getMarkdownEditor();
  if (!editor) {
    return;
  }

  const range = getTargetRange(editor);
  const result = transformHeadings(editor.document.getText(range), direction);

  if (!result.success) {
    void vscode.window.showWarningMessage(`ARIT: ${result.error}`);
    return;
  }

  await editor.edit((editBuilder) => {
    editBuilder.replace(range, result.text);
  });

  const scope = editor.selection.isEmpty ? '' : ' (selection)';
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
