import * as vscode from 'vscode';
import type { ExtensionStateManager } from '../../core/extensionStateManager';

import type { Logger } from '../../core/logger';
import { updateStatusBarItem } from './statusBarItem';

export interface ToggleCommandDeps {
  stateManager: ExtensionStateManager;
  logger: Logger;
  statusBarItem: vscode.StatusBarItem;
}

export function toggleEnabledCommand(deps: ToggleCommandDeps): () => Promise<void> {
  const { stateManager, logger, statusBarItem } = deps;
  return async (): Promise<void> => {
    if (!stateManager.isToggleable) {
      void vscode.window.showInformationMessage(
        'ARIT Toolkit: Toggle is not available in multi-directory workspaces.'
      );
      return;
    }

    await stateManager.toggle();
    updateStatusBarItem(statusBarItem, stateManager);
    logger.info(
      `ARIT Toolkit ${stateManager.isEnabled ? 'enabled' : 'disabled'} for this workspace`
    );
  };
}
