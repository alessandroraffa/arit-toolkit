import type { FeatureRegistrationContext } from '../index';
import { createStatusBarItem, updateStatusBarItem } from './statusBarItem';
import { toggleEnabledCommand, reinitializeCommand } from './command';
import { COMMAND_ID_TOGGLE, COMMAND_ID_REINITIALIZE } from './constants';

export function registerStatusBarToggleFeature(ctx: FeatureRegistrationContext): void {
  const { registry, stateManager, config, logger, context } = ctx;
  const statusBarItem = createStatusBarItem(stateManager, logger);
  context.subscriptions.push(statusBarItem);

  const commandDeps = { stateManager, logger, statusBarItem };
  registry.register(COMMAND_ID_TOGGLE, toggleEnabledCommand(commandDeps));
  registry.register(COMMAND_ID_REINITIALIZE, reinitializeCommand(commandDeps));
  logger.debug(`Registered commands: ${COMMAND_ID_TOGGLE}, ${COMMAND_ID_REINITIALIZE}`);

  const stateDisposable = stateManager.onDidChangeState(() => {
    updateStatusBarItem(statusBarItem, stateManager);
  });
  context.subscriptions.push(stateDisposable);

  const configDisposable = config.onConfigChange(() => {
    updateStatusBarItem(statusBarItem, stateManager);
  });
  context.subscriptions.push(configDisposable);
}

export { COMMAND_ID_TOGGLE, FEATURE_NAME } from './constants';
