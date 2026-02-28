import * as vscode from 'vscode';
import type { SessionFile, SessionProvider, WatchPattern } from '../types';
import { getFileTimes, belongsToWorkspace } from './providerUtils';

const EXTENSION_ID = 'saoudrizwan.claude-dev';
const SESSION_FILE = 'api_conversation_history.json';

export class ClineProvider implements SessionProvider {
  public readonly name = 'cline';
  public readonly displayName = 'Cline';

  constructor(private readonly globalStorageBase: vscode.Uri) {}

  public getWatchPatterns(): WatchPattern[] {
    const baseUri = vscode.Uri.joinPath(this.globalStorageBase, EXTENSION_ID, 'tasks');
    return [{ baseUri, glob: '**/*.json' }];
  }

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
    const times = await getFileTimes(uri);
    if (times === undefined) {
      return undefined;
    }
    if (!(await belongsToWorkspace(uri, workspacePath))) {
      return undefined;
    }
    return {
      uri,
      providerName: this.name,
      archiveName: `cline-${taskId}`,
      displayName: `Cline task ${taskId}`,
      mtime: times.mtime,
      ctime: times.ctime,
      extension: '.json',
    };
  }
}
