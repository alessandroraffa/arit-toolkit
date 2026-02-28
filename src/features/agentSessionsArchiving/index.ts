import type { FeatureRegistrationContext } from '../index';
import type { AgentSessionsArchivingConfig } from '../../types';
import type { ConfigSectionRegistry } from '../../core/configMigration';
import type { ExtensionStateManager } from '../../core';
import { AgentSessionArchiveService } from './archiveService';
import { SessionFileWatcher } from './sessionFileWatcher';
import { getDefaultProviders } from './providers';
import * as vscode from 'vscode';
import {
  CONFIG_KEY,
  DEFAULT_ARCHIVE_PATH,
  DEFAULT_INTERVAL_MINUTES,
  COMMAND_ID_TOGGLE,
  COMMAND_ID_ARCHIVE_NOW,
  INTRODUCED_AT_VERSION_CODE,
} from './constants';

function registerWithCore(
  registry: ConfigSectionRegistry,
  stateManager: ExtensionStateManager
): void {
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
  stateManager.registerService({
    key: CONFIG_KEY,
    label: 'Agent Sessions Archiving',
    icon: '$(archive)',
    toggleCommandId: COMMAND_ID_TOGGLE,
    actions: [
      { commandId: COMMAND_ID_ARCHIVE_NOW, label: 'Archive Now', icon: '$(sync)' },
    ],
  });
}

function registerCommands(
  ctx: FeatureRegistrationContext,
  service: AgentSessionArchiveService
): void {
  const { stateManager, registry, logger } = ctx;

  registry.register(COMMAND_ID_TOGGLE, async () => {
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

  registry.register(COMMAND_ID_ARCHIVE_NOW, async () => {
    if (!service.currentConfig) {
      void vscode.window.showWarningMessage(
        'Agent sessions archiving is not running. Enable it first.'
      );
      return;
    }
    await service.runArchiveCycle();
  });

  logger.debug(`Registered commands: ${COMMAND_ID_TOGGLE}, ${COMMAND_ID_ARCHIVE_NOW}`);
}

export function registerAgentSessionsArchivingFeature(
  ctx: FeatureRegistrationContext
): void {
  const { stateManager } = ctx;
  if (!stateManager.isSingleRoot) {
    return;
  }
  const workspaceRoot = stateManager.workspaceRootUri;
  if (!workspaceRoot) {
    return;
  }

  registerWithCore(ctx.migrationRegistry, stateManager);

  const providers = getDefaultProviders(ctx.context);
  const service = new AgentSessionArchiveService(workspaceRoot, providers, ctx.logger);
  const watcher = new SessionFileWatcher(providers, () => {
    void service.runArchiveCycle();
  });
  ctx.context.subscriptions.push(service, watcher);

  registerCommands(ctx, service);

  stateManager.onDidChangeState((globalEnabled) => {
    const config = stateManager.getConfigSection(CONFIG_KEY) as
      | AgentSessionsArchivingConfig
      | undefined;
    if (globalEnabled && config?.enabled) {
      service.start(config);
      watcher.start(workspaceRoot.fsPath);
    } else {
      service.stop();
      watcher.stop();
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
