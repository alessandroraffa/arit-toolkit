import type * as vscode from 'vscode';
import type { CommandRegistry } from '../core/commandRegistry';
import type { ExtensionStateManager } from '../core/extensionStateManager';
import type { ConfigManager } from '../core/configManager';
import type { Logger } from '../core/logger';
import { registerTimestampedFileFeature } from './timestampedFile';
import { registerStatusBarToggleFeature } from './statusBarToggle';

export function registerAllFeatures(
  registry: CommandRegistry,
  stateManager: ExtensionStateManager,
  config: ConfigManager,
  logger: Logger,
  context: vscode.ExtensionContext
): void {
  registerStatusBarToggleFeature(registry, stateManager, config, logger, context);
  registerTimestampedFileFeature(registry, config, logger);
}
