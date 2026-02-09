import type { CommandRegistry } from '../../core/commandRegistry';
import type { ConfigManager } from '../../core/configManager';
import type { Logger } from '../../core/logger';
import {
  createTimestampedDirectoryCommand,
  prefixTimestampToDirectoryCommand,
} from './command';
import { COMMAND_ID_CREATE, COMMAND_ID_PREFIX } from './constants';

export function registerTimestampedDirectoryFeature(
  registry: CommandRegistry,
  config: ConfigManager,
  logger: Logger
): void {
  registry.register(COMMAND_ID_CREATE, createTimestampedDirectoryCommand(config, logger));
  logger.debug(`Registered command: ${COMMAND_ID_CREATE}`);

  registry.register(COMMAND_ID_PREFIX, prefixTimestampToDirectoryCommand(config, logger));
  logger.debug(`Registered command: ${COMMAND_ID_PREFIX}`);
}

export { COMMAND_ID_CREATE, COMMAND_ID_PREFIX, FEATURE_NAME } from './constants';
