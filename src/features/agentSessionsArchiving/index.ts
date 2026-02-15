import type { FeatureRegistrationContext } from '../index';
import type { AgentSessionsArchivingConfig } from '../../types';
import type { ConfigSectionRegistry } from '../../core/configMigration';
import { AgentSessionArchiveService } from './archiveService';
import { getDefaultProviders } from './providers';
import {
  CONFIG_KEY,
  DEFAULT_ARCHIVE_PATH,
  DEFAULT_INTERVAL_MINUTES,
  COMMAND_ID_TOGGLE,
  INTRODUCED_AT_VERSION_CODE,
} from './constants';

function registerMigration(registry: ConfigSectionRegistry): void {
  registry.register({
    key: CONFIG_KEY,
    label: 'Agent Sessions Archiving',
    description: 'Periodically archive AI coding assistant chat sessions',
    defaultValue: {
      enabled: true,
      archivePath: DEFAULT_ARCHIVE_PATH,
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    },
    introducedAtVersionCode: INTRODUCED_AT_VERSION_CODE,
  });
}

export function registerAgentSessionsArchivingFeature(
  ctx: FeatureRegistrationContext
): void {
  const { stateManager, logger } = ctx;
  const workspaceRoot = stateManager.workspaceRootUri;
  if (!workspaceRoot) {
    return;
  }

  registerMigration(ctx.migrationRegistry);

  const providers = getDefaultProviders(ctx.context);
  const service = new AgentSessionArchiveService(workspaceRoot, providers, logger);
  ctx.context.subscriptions.push(service);

  ctx.registry.register(COMMAND_ID_TOGGLE, async () => {
    const config = stateManager.getConfigSection(CONFIG_KEY) as
      | AgentSessionsArchivingConfig
      | undefined;
    if (!config) {
      return;
    }
    await stateManager.updateConfigSection(CONFIG_KEY, {
      ...config,
      enabled: !config.enabled,
    });
  });
  logger.debug(`Registered command: ${COMMAND_ID_TOGGLE}`);

  stateManager.onDidChangeState((globalEnabled) => {
    const config = stateManager.getConfigSection(CONFIG_KEY) as
      | AgentSessionsArchivingConfig
      | undefined;
    if (globalEnabled && config?.enabled) {
      service.start(config);
    } else {
      service.stop();
    }
  });

  const sectionDisposable = stateManager.onConfigSectionChanged(
    CONFIG_KEY,
    (newValue) => {
      const oldConfig = service.currentConfig;
      const newConfig = newValue as AgentSessionsArchivingConfig;
      void service.reconfigure(oldConfig, newConfig);
    }
  );
  ctx.context.subscriptions.push(sectionDisposable);
}

export { CONFIG_KEY } from './constants';
