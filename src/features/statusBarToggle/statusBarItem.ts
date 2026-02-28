import * as vscode from 'vscode';
import type { ExtensionStateManager } from '../../core/extensionStateManager';
import type { Logger } from '../../core/logger';
import {
  COMMAND_ID_TOGGLE,
  COMMAND_ID_CHECKUP,
  STATUS_BAR_PRIORITY,
  ICON_CODICON,
  STATUS_BAR_TEXT,
  STATUS_BAR_NAME,
} from './constants';

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
  md.appendMarkdown(`[$(gear) Checkup](command:${COMMAND_ID_CHECKUP})\u2002`);
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
  let result = '';
  for (const service of stateManager.registeredServices) {
    const config = stateManager.getConfigSection(service.key) as
      | { enabled?: boolean }
      | undefined;
    if (!config) {
      continue;
    }

    const icon = config.enabled ? '$(check)' : '$(circle-slash)';
    const status = config.enabled ? 'Active' : 'Inactive';
    const toggleIcon = config.enabled ? '$(debug-stop)' : '$(play)';
    const toggleLabel = config.enabled ? 'Disable' : 'Enable';

    let actions = `[${toggleIcon} ${toggleLabel}](command:${service.toggleCommandId})`;
    if (config.enabled && service.actions) {
      for (const action of service.actions) {
        actions += `\u2002[${action.icon} ${action.label}](command:${action.commandId})`;
      }
    }

    result +=
      `${service.icon} ${service.label}\u2002${icon} ${status}\n\n` + `${actions}\n\n`;
  }
  return result;
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
