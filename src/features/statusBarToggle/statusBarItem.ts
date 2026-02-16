import * as vscode from 'vscode';
import type { ExtensionStateManager } from '../../core/extensionStateManager';
import type { Logger } from '../../core/logger';
import type { AgentSessionsArchivingConfig } from '../../types';
import {
  COMMAND_ID_TOGGLE,
  COMMAND_ID_REINITIALIZE,
  STATUS_BAR_PRIORITY,
  ICON_CODICON,
  STATUS_BAR_TEXT,
  STATUS_BAR_NAME,
} from './constants';
import { CONFIG_KEY as ARCHIVING_CONFIG_KEY } from '../agentSessionsArchiving';
import { COMMAND_ID_TOGGLE as ARCHIVING_TOGGLE_CMD } from '../agentSessionsArchiving/constants';

export function createStatusBarItem(
  stateManager: ExtensionStateManager,
  logger: Logger
): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    STATUS_BAR_PRIORITY
  );
  item.command = COMMAND_ID_TOGGLE;
  item.name = STATUS_BAR_NAME;

  updateStatusBarItem(item, stateManager);
  item.show();

  logger.debug('Status bar item created');
  return item;
}

export function updateStatusBarItem(
  item: vscode.StatusBarItem,
  stateManager: ExtensionStateManager
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

  item.tooltip = buildSingleRootTooltip(stateManager);
}

function buildSingleRootTooltip(
  stateManager: ExtensionStateManager
): vscode.MarkdownString {
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.supportThemeIcons = true;

  md.appendMarkdown(`### $(tools) ARIT Toolkit\n\n`);

  if (!stateManager.isEnabled) {
    md.appendMarkdown(buildDisabledSection());
  } else {
    md.appendMarkdown(buildServicesSection(stateManager));
  }

  md.appendMarkdown(`---\n\n`);
  md.appendMarkdown(`[$(gear) Run Setup](command:${COMMAND_ID_REINITIALIZE})\u2002`);
  md.appendMarkdown(buildGlobalToggleButton(stateManager.isEnabled));

  return md;
}

function buildGlobalToggleButton(isEnabled: boolean): string {
  const icon = isEnabled ? '$(circle-slash)' : '$(play)';
  const label = isEnabled ? 'Disable All' : 'Enable All';
  return `[${icon} ${label}](command:${COMMAND_ID_TOGGLE})`;
}

function buildDisabledSection(): string {
  return `$(warning) All services paused\n\n`;
}

function buildServicesSection(stateManager: ExtensionStateManager): string {
  const archivingConfig = stateManager.getConfigSection(ARCHIVING_CONFIG_KEY) as
    | AgentSessionsArchivingConfig
    | undefined;
  if (!archivingConfig) {
    return '';
  }

  const icon = archivingConfig.enabled ? '$(check)' : '$(circle-slash)';
  const status = archivingConfig.enabled ? 'Active' : 'Inactive';
  const toggleIcon = archivingConfig.enabled ? '$(debug-stop)' : '$(play)';
  const toggleLabel = archivingConfig.enabled ? 'Disable' : 'Enable';

  return (
    `$(archive) Agent Sessions Archiving\u2002${icon} ${status}\n\n` +
    `[${toggleIcon} ${toggleLabel}](command:${ARCHIVING_TOGGLE_CMD})\n\n`
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
