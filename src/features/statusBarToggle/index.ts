import type { FeatureRegistrationContext } from '../index';
import { createStatusBarItem, updateStatusBarItem } from './statusBarItem';
import { toggleEnabledCommand } from './command';
import { COMMAND_ID_TOGGLE } from './constants';

export function registerStatusBarToggleFeature(ctx: FeatureRegistrationContext): void {
  const { registry, stateManager, config, logger, context } = ctx;
  const statusBarItem = createStatusBarItem(stateManager, config, logger);
  context.subscriptions.push(statusBarItem);

  registry.register(
    COMMAND_ID_TOGGLE,
    toggleEnabledCommand({ stateManager, config, logger, statusBarItem })
  );
  logger.debug(`Registered command: ${COMMAND_ID_TOGGLE}`);

  const stateDisposable = stateManager.onDidChangeState(() => {
    updateStatusBarItem(statusBarItem, stateManager, config);
  });
  context.subscriptions.push(stateDisposable);

  const configDisposable = config.onConfigChange(() => {
    updateStatusBarItem(statusBarItem, stateManager, config);
  });
  context.subscriptions.push(configDisposable);
}

export { COMMAND_ID_TOGGLE, FEATURE_NAME } from './constants';
