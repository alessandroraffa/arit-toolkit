import * as vscode from 'vscode';
import type { SessionFile, SessionProvider } from '../types';

const EXTENSION_ID = 'saoudrizwan.claude-dev';
const SESSION_FILE = 'api_conversation_history.json';

export class ClineProvider implements SessionProvider {
  public readonly name = 'cline';
  public readonly displayName = 'Cline';

  constructor(private readonly globalStorageBase: vscode.Uri) {}

  public async findSessions(_workspaceRootPath: string): Promise<SessionFile[]> {
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
      const uri = vscode.Uri.joinPath(tasksUri, taskId, SESSION_FILE);
      const mtime = await this.getMtime(uri);
      if (mtime === undefined) {
        continue;
      }
      results.push({
        uri,
        archiveName: `cline-${taskId}`,
        displayName: `Cline task ${taskId}`,
        mtime,
        extension: '.json',
      });
    }

    return results;
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
