import * as vscode from 'vscode';
import type {
  ExtensionStateManager,
  CheckupResult,
} from '../../core/extensionStateManager';

import type { Logger } from '../../core/logger';
import { updateStatusBarItem } from './statusBarItem';

export interface ToggleCommandDeps {
  stateManager: ExtensionStateManager;
  logger: Logger;
  statusBarItem: vscode.StatusBarItem;
}

export function buildCheckupMessage(result: CheckupResult): string {
  const parts: string[] = [];
  if (result.configUpdated) {
    parts.push('Config updated');
  }
  switch (result.commitResult) {
    case 'committed':
      parts.push('changes committed');
      break;
    case 'skipped':
      parts.push('file has uncommitted changes');
      break;
    case 'failed':
      parts.push('commit failed — check output log');
      break;
  }
  if (parts.length === 0) {
    return 'Tangyr Workbench: Config is up to date.';
  }
  return `Tangyr Workbench: ${parts.join('. ')}.`;
}

export function checkupCommand(deps: ToggleCommandDeps): () => Promise<void> {
  const { stateManager, logger, statusBarItem } = deps;
  return async (): Promise<void> => {
    const result = await stateManager.checkup();
    updateStatusBarItem(statusBarItem, stateManager);
    void vscode.window.showInformationMessage(buildCheckupMessage(result));
    logger.info('Tangyr Workbench checkup completed');
  };
}

export function toggleEnabledCommand(deps: ToggleCommandDeps): () => Promise<void> {
  const { stateManager, logger, statusBarItem } = deps;
  return async (): Promise<void> => {
    if (!stateManager.isToggleable) {
      void vscode.window.showInformationMessage(
        'Tangyr Workbench: Toggle is not available in multi-directory workspaces.'
      );
      return;
    }

    await stateManager.toggle();
    updateStatusBarItem(statusBarItem, stateManager);
    logger.info(
      `Tangyr Workbench ${stateManager.isEnabled ? 'enabled' : 'disabled'} for this workspace`
    );
  };
}
