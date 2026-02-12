import * as vscode from 'vscode';
import type { SessionFile, SessionProvider } from '../types';

const EXTENSION_ID = 'github.copilot-chat';
const SESSIONS_DIR = 'chatSessions';

export class CopilotChatProvider implements SessionProvider {
  public readonly name = 'copilot-chat';
  public readonly displayName = 'GitHub Copilot Chat';

  constructor(private readonly workspaceStorageBase: vscode.Uri) {}

  public async findSessions(_workspaceRootPath: string): Promise<SessionFile[]> {
    const sessionsUri = vscode.Uri.joinPath(
      this.workspaceStorageBase,
      EXTENSION_ID,
      SESSIONS_DIR
    );

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
      const session = await this.toSessionFile(sessionsUri, name);
      if (session) {
        results.push(session);
      }
    }
    return results;
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
      archiveName: `copilot-chat-${sessionId}`,
      displayName: `Copilot Chat ${sessionId}`,
      mtime,
      extension: '.json',
    };
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
