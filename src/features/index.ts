import type { CommandRegistry } from '../core/commandRegistry';
import type { ConfigManager } from '../core/configManager';
import type { Logger } from '../core/logger';
import { registerTimestampedFileFeature } from './timestampedFile';

export function registerAllFeatures(
  registry: CommandRegistry,
  config: ConfigManager,
  logger: Logger
): void {
  registerTimestampedFileFeature(registry, config, logger);
  // Add future features here:
  // registerNewFeature(registry, config, logger);
}
