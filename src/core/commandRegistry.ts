import * as vscode from 'vscode';
import type { ExtensionStateManager } from './extensionStateManager';

export type CommandHandler = (uri?: vscode.Uri) => Promise<void>;

export class CommandRegistry {
  private readonly stateManager: ExtensionStateManager | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    stateManager?: ExtensionStateManager
  ) {
    this.stateManager = stateManager;
  }

  public register(commandId: string, handler: CommandHandler): void {
    const disposable = vscode.commands.registerCommand(commandId, handler);
    this.context.subscriptions.push(disposable);
  }

  public registerGuarded(commandId: string, handler: CommandHandler): void {
    const guardedHandler = this.createGuardedHandler(handler);
    const disposable = vscode.commands.registerCommand(commandId, guardedHandler);
    this.context.subscriptions.push(disposable);
  }

  private createGuardedHandler(handler: CommandHandler): CommandHandler {
    return async (uri?: vscode.Uri): Promise<void> => {
      if (this.stateManager && !this.stateManager.isEnabled) {
        void vscode.window.showWarningMessage(
          'ARIT Toolkit is currently disabled for this workspace. ' +
            'Click the ARIT icon in the status bar to re-enable it.'
        );
        return;
      }
      return handler(uri);
    };
  }
}
