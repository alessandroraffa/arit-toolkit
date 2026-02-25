import type * as vscode from 'vscode';
import type { CommandRegistry } from '../core/commandRegistry';
import type { ExtensionStateManager } from '../core/extensionStateManager';
import type { ConfigManager } from '../core/configManager';
import type { ConfigSectionRegistry } from '../core/configMigration';
import type { Logger } from '../core/logger';
import { registerTimestampedFileFeature } from './timestampedFile';
import { registerTimestampedDirectoryFeature } from './timestampedDirectory';
import { registerStatusBarToggleFeature } from './statusBarToggle';
import { registerAgentSessionsArchivingFeature } from './agentSessionsArchiving';
import { registerTextStatsFeature } from './textStats';

export interface FeatureRegistrationContext {
  registry: CommandRegistry;
  stateManager: ExtensionStateManager;
  config: ConfigManager;
  logger: Logger;
  context: vscode.ExtensionContext;
  migrationRegistry: ConfigSectionRegistry;
}

export function registerAllFeatures(ctx: FeatureRegistrationContext): void {
  registerTimestampedFileFeature(ctx.registry, ctx.config, ctx.logger);
  registerTimestampedDirectoryFeature(ctx.registry, ctx.config, ctx.logger);
  registerAgentSessionsArchivingFeature(ctx);
  registerStatusBarToggleFeature(ctx);
  registerTextStatsFeature(ctx);
}
