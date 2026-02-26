import * as vscode from 'vscode';
import type { TextStatsConfig } from '../../types';
import type { MetricsResult } from './formatter';
import type { Logger } from '../../core/logger';
import type { TextStatsController } from './controller';
import {
  updateTextStatsDisplay,
  showTextStatsItem,
  hideTextStatsItem,
} from './statusBarItem';
import { extractSelectionText, aggregateSelectionLines } from './textExtractor';
import type { SelectionData, SelectionLineData } from './textExtractor';
import { formatSize } from './metrics/size';

export interface UpdateDeps {
  item: vscode.StatusBarItem;
  controller: TextStatsController;
  logger: Logger;
}

interface EditorData {
  text: string;
  lines: number;
  hasSelection: boolean;
  uri: vscode.Uri;
}

function extractFromEditor(editor: vscode.TextEditor): EditorData {
  const doc = editor.document;
  const sels = editor.selections;
  const selData: SelectionData[] = sels.map((s) => ({
    text: doc.getText(s),
    isEmpty: s.isEmpty,
    startOffset: doc.offsetAt(s.start),
    endOffset: doc.offsetAt(s.end),
  }));
  const text = extractSelectionText(doc.getText(), selData);
  const hasSelection = sels.some((s) => !s.isEmpty);

  let lines: number;
  if (hasSelection) {
    const lineData: SelectionLineData[] = sels
      .filter((s) => !s.isEmpty)
      .map((s) => ({
        startLine: s.start.line,
        endLine: s.end.line,
        endCharacter: s.end.character,
      }));
    lines = aggregateSelectionLines(lineData);
  } else {
    lines = doc.lineCount;
  }

  return { text, lines, hasSelection, uri: doc.uri };
}

async function computeFileSize(data: EditorData): Promise<string> {
  if (data.hasSelection) {
    return formatSize(Buffer.byteLength(data.text, 'utf8'));
  }
  try {
    const stat = await vscode.workspace.fs.stat(data.uri);
    return formatSize(stat.size);
  } catch {
    return formatSize(Buffer.byteLength(data.text, 'utf8'));
  }
}

export async function performUpdate(
  deps: UpdateDeps,
  config: TextStatsConfig
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    hideTextStatsItem(deps.item);
    return;
  }
  try {
    const data = extractFromEditor(editor);
    const size = await computeFileSize(data);
    const partial = await deps.controller.computeMetrics(data.text, config);
    const metrics: MetricsResult = { ...partial, lines: data.lines, size };
    updateTextStatsDisplay(deps.item, metrics, config);
    showTextStatsItem(deps.item);
  } catch (err: unknown) {
    deps.logger.warn(`Text stats update failed: ${String(err)}`);
  }
}
