import * as vscode from 'vscode';
import type { SessionFile, SessionProvider } from '../types';

const EXTENSION_ID = 'rooveterinaryinc.roo-cline';
const SESSION_FILE = 'api_conversation_history.json';

export class RooCodeProvider implements SessionProvider {
  public readonly name = 'roo-code';
  public readonly displayName = 'Roo Code';

  constructor(private readonly globalStorageBase: vscode.Uri) {}

  public async findSessions(workspaceRootPath: string): Promise<SessionFile[]> {
    const tasksUri = vscode.Uri.joinPath(this.globalStorageBase, EXTENSION_ID, 'tasks');

    let taskDirs: [string, vscode.FileType][];
    try {
      taskDirs = await vscode.workspace.fs.readDirectory(tasksUri);
    } catch {
      return [];
    }

    const results: SessionFile[] = [];
    for (const [taskId, type] of taskDirs) {
      if (type !== vscode.FileType.Directory) {
        continue;
      }
      const session = await this.toSessionFile(tasksUri, taskId, workspaceRootPath);
      if (session) {
        results.push(session);
      }
    }

    return results;
  }

  private async toSessionFile(
    tasksUri: vscode.Uri,
    taskId: string,
    workspacePath: string
  ): Promise<SessionFile | undefined> {
    const uri = vscode.Uri.joinPath(tasksUri, taskId, SESSION_FILE);
    const mtime = await this.getMtime(uri);
    if (mtime === undefined) {
      return undefined;
    }
    if (!(await this.belongsToWorkspace(uri, workspacePath))) {
      return undefined;
    }
    return {
      uri,
      archiveName: `roo-code-${taskId}`,
      displayName: `Roo Code task ${taskId}`,
      mtime,
      extension: '.json',
    };
  }

  private async belongsToWorkspace(
    uri: vscode.Uri,
    workspacePath: string
  ): Promise<boolean> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = new TextDecoder().decode(bytes);
      return content.includes(workspacePath);
    } catch {
      return false;
    }
  }

  private async getMtime(uri: vscode.Uri): Promise<number | undefined> {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      return stat.mtime;
    } catch {
      return undefined;
    }
  }
}
