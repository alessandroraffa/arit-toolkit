import type * as vscode from 'vscode';
import type { CommandRegistry } from '../../core/commandRegistry';
import type { ExtensionStateManager } from '../../core/extensionStateManager';
import type { ConfigManager } from '../../core/configManager';
import type { Logger } from '../../core/logger';
import { createStatusBarItem, updateStatusBarItem } from './statusBarItem';
import { toggleEnabledCommand } from './command';
import { COMMAND_ID_TOGGLE } from './constants';

export function registerStatusBarToggleFeature(
  registry: CommandRegistry,
  stateManager: ExtensionStateManager,
  config: ConfigManager,
  logger: Logger,
  context: vscode.ExtensionContext
): void {
  const statusBarItem = createStatusBarItem(stateManager, config, logger);
  context.subscriptions.push(statusBarItem);

  registry.register(
    COMMAND_ID_TOGGLE,
    toggleEnabledCommand(stateManager, config, logger, statusBarItem)
  );
  logger.debug(`Registered command: ${COMMAND_ID_TOGGLE}`);

  const stateDisposable = stateManager.onDidChangeState(() => {
    updateStatusBarItem(statusBarItem, stateManager, config);
  });
  context.subscriptions.push(stateDisposable);

  const configDisposable = config.onConfigChange(() => {
    updateStatusBarItem(statusBarItem, stateManager, config);
  });
  context.subscriptions.push(configDisposable);
}

export { COMMAND_ID_TOGGLE, FEATURE_NAME } from './constants';
