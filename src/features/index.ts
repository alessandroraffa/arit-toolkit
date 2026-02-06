import type * as vscode from 'vscode';
import type { CommandRegistry } from '../core/commandRegistry';
import type { ExtensionStateManager } from '../core/extensionStateManager';
import type { ConfigManager } from '../core/configManager';
import type { Logger } from '../core/logger';
import { registerTimestampedFileFeature } from './timestampedFile';
import { registerStatusBarToggleFeature } from './statusBarToggle';

export interface FeatureRegistrationContext {
  registry: CommandRegistry;
  stateManager: ExtensionStateManager;
  config: ConfigManager;
  logger: Logger;
  context: vscode.ExtensionContext;
}

export function registerAllFeatures(ctx: FeatureRegistrationContext): void {
  registerStatusBarToggleFeature(ctx);
  registerTimestampedFileFeature(ctx.registry, ctx.config, ctx.logger);
}
