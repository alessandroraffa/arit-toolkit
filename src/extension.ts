import type * as vscode from 'vscode';
import {
  Logger,
  ConfigManager,
  CommandRegistry,
  ExtensionStateManager,
  ConfigAutoCommitService,
  ConfigSectionRegistry,
  ConfigMigrationService,
} from './core';
import { registerAllFeatures } from './features';

let logger: Logger | undefined;

function setupAutoCommit(stateManager: ExtensionStateManager, log: Logger): void {
  if (stateManager.workspaceRootUri) {
    stateManager.setAutoCommitService(
      new ConfigAutoCommitService(
        stateManager.workspaceRootUri.fsPath,
        '.arit-toolkit.jsonc',
        log
      )
    );
  }
}

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

  // Create config migration infrastructure
  const migrationRegistry = new ConfigSectionRegistry();
  const migrationService = new ConfigMigrationService(migrationRegistry, logger);

  // Create extension state manager for workspace-level enable/disable
  const stateManager = new ExtensionStateManager(logger, migrationService);
  context.subscriptions.push(stateManager);

  setupAutoCommit(stateManager, logger);

  const commandRegistry = new CommandRegistry(context, stateManager);

  // Register all features
  registerAllFeatures({
    registry: commandRegistry,
    stateManager,
    config: configManager,
    logger,
    context,
    migrationRegistry,
  });

  // Initialize state manager (reads config file, checks version, shows onboarding if needed)
  void stateManager.initialize(
    String((context.extension.packageJSON as Record<string, unknown>).version)
  );

  logger.info('ARIT Toolkit activated successfully');
}

export function deactivate(): void {
  logger?.info('ARIT Toolkit deactivated');
  logger?.dispose();
  logger = undefined;
}
