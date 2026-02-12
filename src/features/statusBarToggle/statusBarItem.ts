import * as vscode from 'vscode';
import type { ExtensionStateManager } from '../../core/extensionStateManager';
import type { ConfigManager } from '../../core/configManager';
import type { Logger } from '../../core/logger';
import type { AgentSessionsArchivingConfig } from '../../types';
import {
  COMMAND_ID_TOGGLE,
  STATUS_BAR_PRIORITY,
  ICON_CODICON,
  STATUS_BAR_TEXT,
  STATUS_BAR_NAME,
} from './constants';
import { CONFIG_KEY as ARCHIVING_CONFIG_KEY } from '../agentSessionsArchiving';
import { COMMAND_ID_TOGGLE as ARCHIVING_TOGGLE_CMD } from '../agentSessionsArchiving/constants';

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
    item.color = undefined;
  } else {
    item.backgroundColor = undefined;
    item.color = new vscode.ThemeColor('disabledForeground');
  }

  item.tooltip = buildSingleRootTooltip(stateManager, config);
}

function buildSingleRootTooltip(
  stateManager: ExtensionStateManager,
  config: ConfigManager
): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.supportThemeIcons = true;

  const isEnabled = stateManager.isEnabled;
  const statusIcon = isEnabled ? '$(check)' : '$(circle-slash)';
  const statusText = isEnabled ? 'Enabled' : 'Disabled';
  const action = isEnabled ? 'disable' : 'enable';

  md.appendMarkdown(
    `### $(tools) ARIT Toolkit\n\n` +
      `**Status:** ${statusIcon} ${statusText}\n\n` +
      `---\n\n`
  );
  md.appendMarkdown(buildBackgroundServicesSection(stateManager));
  md.appendMarkdown(
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

function buildBackgroundServicesSection(stateManager: ExtensionStateManager): string {
  const archivingConfig = stateManager.getConfigSection(ARCHIVING_CONFIG_KEY) as
    | AgentSessionsArchivingConfig
    | undefined;
  if (!archivingConfig) {
    return '';
  }

  if (!stateManager.isEnabled) {
    return `**Background Services:**\n\n$(warning) All background services paused\n\n---\n\n`;
  }

  const icon = archivingConfig.enabled ? '$(check)' : '$(circle-slash)';
  const status = archivingConfig.enabled ? 'Active' : 'Inactive';
  const toggleIcon = archivingConfig.enabled ? '$(debug-stop)' : '$(play)';
  const toggleLabel = archivingConfig.enabled ? 'Disable' : 'Enable';

  return (
    `**Background Services:**\n\n` +
    `$(archive) Agent Sessions Archiving: ${icon} ${status} ` +
    `[${toggleIcon} ${toggleLabel}](command:${ARCHIVING_TOGGLE_CMD})\n\n` +
    `---\n\n`
  );
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
