import * as vscode from 'vscode';
import type { TextStatsConfig } from '../../types';
import type { MetricsResult } from './formatter';
import { formatStatusBarText, buildTooltipText } from './formatter';
import {
  STATUS_BAR_PRIORITY,
  STATUS_BAR_NAME,
  COMMAND_ID_CHANGE_TOKENIZER,
} from './constants';

export function createTextStatsStatusBarItem(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    STATUS_BAR_PRIORITY
  );
  item.name = STATUS_BAR_NAME;
  item.command = COMMAND_ID_CHANGE_TOKENIZER;
  return item;
}

export function updateTextStatsDisplay(
  item: vscode.StatusBarItem,
  metrics: MetricsResult,
  config: TextStatsConfig
): void {
  item.text = formatStatusBarText(metrics, config);
  item.tooltip = buildTooltipText(metrics, config);
}

export function showTextStatsItem(item: vscode.StatusBarItem): void {
  item.show();
}

export function hideTextStatsItem(item: vscode.StatusBarItem): void {
  item.hide();
}
