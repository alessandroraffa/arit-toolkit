import type { CommandRegistry } from '../../core/commandRegistry';
import type { Logger } from '../../core/logger';
import { COMMAND_ID_INCREMENT, COMMAND_ID_DECREMENT } from './constants';
import { createIncrementCommand, createDecrementCommand } from './command';

export function registerMarkdownHeadingsFeature(
  registry: CommandRegistry,
  logger: Logger
): void {
  registry.register(COMMAND_ID_INCREMENT, createIncrementCommand(logger));
  registry.register(COMMAND_ID_DECREMENT, createDecrementCommand(logger));
  logger.debug(`Registered feature: Markdown Headings`);
}
