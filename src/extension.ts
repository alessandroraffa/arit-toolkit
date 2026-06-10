import * as vscode from 'vscode';
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
import { runMigrationIfNeeded } from './migration';

let logger: Logger | undefined;

function setupConfiguration(
  context: vscode.ExtensionContext,
  log: Logger
): ConfigManager {
  const configManager = new ConfigManager();
  log.setLevel(configManager.logLevel);
  const configDisposable = configManager.onConfigChange(() => {
    logger?.setLevel(configManager.logLevel);
  });
  context.subscriptions.push(configDisposable);
  return configManager;
}

function setupAutoCommit(stateManager: ExtensionStateManager, log: Logger): void {
  if (stateManager.workspaceRootUri) {
    stateManager.setAutoCommitService(
      new ConfigAutoCommitService(
        stateManager.workspaceRootUri.fsPath,
        '.tangyr.jsonc',
        log
      )
    );
  }
}

function runSettingsMigration(context: vscode.ExtensionContext): void {
  void runMigrationIfNeeded(context).catch((err: unknown) => {
    console.error('[migration] Unexpected failure:', err);
  });
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const folderName = vscode.workspace.workspaceFolders?.[0]?.name;
  logger = Logger.getInstance(
    folderName ? { workspaceFolderName: folderName } : undefined
  );
  const configManager = setupConfiguration(context, logger);
  logger.info('Tangyr Workbench is activating...');

  // Create config migration infrastructure
  const migrationRegistry = new ConfigSectionRegistry();
  const migrationService = new ConfigMigrationService(migrationRegistry, logger);

  // Create extension state manager for workspace-level enable/disable
  const stateManager = new ExtensionStateManager(logger, migrationService);
  context.subscriptions.push(stateManager);

  setupAutoCommit(stateManager, logger);

  const commandRegistry = new CommandRegistry(context, stateManager);

  // Register all features
  await registerAllFeatures({
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

  runSettingsMigration(context);

  logger.info('Tangyr Workbench activated successfully');
}

export function deactivate(): void {
  logger?.info('Tangyr Workbench deactivated');
  logger?.dispose();
  logger = undefined;
}
