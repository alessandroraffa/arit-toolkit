import type { CommandRegistry } from '../../core/commandRegistry';
import type { ConfigManager } from '../../core/configManager';
import type { Logger } from '../../core/logger';
import { createTimestampedFileCommand, prefixTimestampToFileCommand } from './command';
import { COMMAND_ID_CREATE, COMMAND_ID_PREFIX } from './constants';

export function registerTimestampedFileFeature(
  registry: CommandRegistry,
  config: ConfigManager,
  logger: Logger
): void {
  registry.register(COMMAND_ID_CREATE, createTimestampedFileCommand(config, logger));
  logger.debug(`Registered command: ${COMMAND_ID_CREATE}`);

  registry.register(COMMAND_ID_PREFIX, prefixTimestampToFileCommand(config, logger));
  logger.debug(`Registered command: ${COMMAND_ID_PREFIX}`);
}

export { COMMAND_ID_CREATE, COMMAND_ID_PREFIX, FEATURE_NAME } from './constants';
export { generateTimestamp } from './utils';
