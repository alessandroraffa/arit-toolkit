import type * as vscode from 'vscode';
import { Logger, ConfigManager, CommandRegistry, ExtensionStateManager } from './core';
import { registerAllFeatures } from './features';

let logger: Logger | undefined;

export function activate(context: vscode.ExtensionContext): void {
  logger = Logger.getInstance();
  const configManager = new ConfigManager();

  // Set initial log level from configuration
  logger.setLevel(configManager.logLevel);

  // Update log level when configuration changes
  const configDisposable = configManager.onConfigChange(() => {
    logger?.setLevel(configManager.logLevel);
  });
  context.subscriptions.push(configDisposable);

  logger.info('ARIT Toolkit is activating...');

  // Create extension state manager for workspace-level enable/disable
  const stateManager = new ExtensionStateManager(logger);
  context.subscriptions.push(stateManager);

  const commandRegistry = new CommandRegistry(context, stateManager);

  // Register all features
  registerAllFeatures(commandRegistry, stateManager, configManager, logger, context);

  // Initialize state manager (reads config file, shows onboarding if needed)
  void stateManager.initialize();

  logger.info('ARIT Toolkit activated successfully');
}

export function deactivate(): void {
  logger?.info('ARIT Toolkit deactivated');
  logger?.dispose();
  logger = undefined;
}
