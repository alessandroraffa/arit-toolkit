import * as vscode from 'vscode';
import type { ExtensionStateManager } from '../../core/extensionStateManager';
import type { ConfigManager } from '../../core/configManager';
import type { Logger } from '../../core/logger';
import { updateStatusBarItem } from './statusBarItem';

export interface ToggleCommandDeps {
  stateManager: ExtensionStateManager;
  config: ConfigManager;
  logger: Logger;
  statusBarItem: vscode.StatusBarItem;
}

export function toggleEnabledCommand(deps: ToggleCommandDeps): () => Promise<void> {
  const { stateManager, config, logger, statusBarItem } = deps;
  return async (): Promise<void> => {
    if (!stateManager.isToggleable) {
      void vscode.window.showInformationMessage(
        'ARIT Toolkit: Toggle is not available in multi-directory workspaces.'
      );
      return;
    }

    await stateManager.toggle();
    updateStatusBarItem(statusBarItem, stateManager, config);
    logger.info(
      `ARIT Toolkit ${stateManager.isEnabled ? 'enabled' : 'disabled'} for this workspace`
    );
  };
}
