import * as vscode from 'vscode';

export type CommandHandler = (uri?: vscode.Uri) => Promise<void>;

export class CommandRegistry {
  constructor(private readonly context: vscode.ExtensionContext) {}

  public register(commandId: string, handler: CommandHandler): void {
    const disposable = vscode.commands.registerCommand(commandId, handler);
    this.context.subscriptions.push(disposable);
  }
}
