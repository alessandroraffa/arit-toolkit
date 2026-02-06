import * as vscode from 'vscode';
import type { ExtensionStateManager } from '../../core/extensionStateManager';
import type { ConfigManager } from '../../core/configManager';
import type { Logger } from '../../core/logger';
import {
  COMMAND_ID_TOGGLE,
  STATUS_BAR_PRIORITY,
  ICON_CODICON,
  STATUS_BAR_TEXT,
  STATUS_BAR_NAME,
} from './constants';

export function createStatusBarItem(
  stateManager: ExtensionStateManager,
  config: ConfigManager,
  logger: Logger
): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    STATUS_BAR_PRIORITY
  );
  item.command = COMMAND_ID_TOGGLE;
  item.name = STATUS_BAR_NAME;

  updateStatusBarItem(item, stateManager, config);
  item.show();

  logger.debug('Status bar item created');
  return item;
}

export function updateStatusBarItem(
  item: vscode.StatusBarItem,
  stateManager: ExtensionStateManager,
  config: ConfigManager
): void {
  item.text = `${ICON_CODICON} ${STATUS_BAR_TEXT}`;

  if (!stateManager.isSingleRoot) {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    item.tooltip = buildMultiRootTooltip();
    return;
  }

  if (stateManager.isEnabled) {
    item.backgroundColor = undefined;
  } else {
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  item.tooltip = buildSingleRootTooltip(stateManager.isEnabled, config);
}

function buildSingleRootTooltip(
  isEnabled: boolean,
  config: ConfigManager
): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.supportThemeIcons = true;

  const statusIcon = isEnabled ? '$(check)' : '$(circle-slash)';
  const statusText = isEnabled ? 'Enabled' : 'Disabled';
  const action = isEnabled ? 'disable' : 'enable';

  md.appendMarkdown(
    `### $(tools) ARIT Toolkit\n\n` +
      `**Status:** ${statusIcon} ${statusText}\n\n` +
      `---\n\n` +
      `**Features:**\n\n` +
      `- $(new-file) Timestamped File Creator\n` +
      `- $(calendar) Prefix Creation Timestamp\n\n` +
      `---\n\n` +
      `**Configuration:**\n\n` +
      `- Timestamp Format: \`${config.timestampFormat}\`\n` +
      `- Separator: \`${config.timestampSeparator}\`\n\n` +
      `---\n\n` +
      `*Click to ${action}*`
  );

  return md;
}

function buildMultiRootTooltip(): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.supportThemeIcons = true;

  md.appendMarkdown(`### $(tools) ARIT Toolkit\n\n`);
  md.appendMarkdown(
    `$(warning) Some features are limited because this is a multi-directory workspace.\n\n`
  );
  md.appendMarkdown(`Basic commands remain available.`);

  return md;
}
