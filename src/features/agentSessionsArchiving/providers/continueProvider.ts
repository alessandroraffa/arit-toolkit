import * as vscode from 'vscode';
import * as os from 'os';
import type { SessionFile, SessionProvider } from '../types';

export class ContinueProvider implements SessionProvider {
  public readonly name = 'continue';
  public readonly displayName = 'Continue';

  public async findSessions(workspaceRootPath: string): Promise<SessionFile[]> {
    const sessionsUri = vscode.Uri.file(`${os.homedir()}/.continue/sessions`);

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(sessionsUri);
    } catch {
      return [];
    }

    const results: SessionFile[] = [];
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File || !name.endsWith('.json')) {
        continue;
      }
      const session = await this.toWorkspaceSession(sessionsUri, name, workspaceRootPath);
      if (session) {
        results.push(session);
      }
    }
    return results;
  }

  private async toWorkspaceSession(
    dirUri: vscode.Uri,
    name: string,
    workspacePath: string
  ): Promise<SessionFile | undefined> {
    const session = await this.toSessionFile(dirUri, name);
    if (!session) {
      return undefined;
    }
    if (!(await this.belongsToWorkspace(session.uri, workspacePath))) {
      return undefined;
    }
    return session;
  }

  private async toSessionFile(
    dirUri: vscode.Uri,
    name: string
  ): Promise<SessionFile | undefined> {
    const uri = vscode.Uri.joinPath(dirUri, name);
    const mtime = await this.getMtime(uri);
    if (mtime === undefined) {
      return undefined;
    }
    const sessionId = name.replace('.json', '');
    return {
      uri,
      providerName: this.name,
      archiveName: `continue-${sessionId}`,
      displayName: `Continue session ${sessionId}`,
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
