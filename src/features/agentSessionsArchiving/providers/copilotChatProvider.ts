import * as vscode from 'vscode';
import * as path from 'path';
import type { SessionFile, SessionProvider } from '../types';

const SESSIONS_DIR = 'chatSessions';

function isSessionFile(name: string): boolean {
  return name.endsWith('.json') || name.endsWith('.jsonl');
}

export class CopilotChatProvider implements SessionProvider {
  public readonly name = 'copilot-chat';
  public readonly displayName = 'GitHub Copilot Chat';

  constructor(private readonly workspaceStorageDir: vscode.Uri) {}

  public async findSessions(_workspaceRootPath: string): Promise<SessionFile[]> {
    const sessionsUri = vscode.Uri.joinPath(this.workspaceStorageDir, SESSIONS_DIR);

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(sessionsUri);
    } catch {
      return [];
    }

    const results: SessionFile[] = [];
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File || !isSessionFile(name)) {
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
    const ext = path.extname(name);
    const sessionId = name.replace(ext, '');
    return {
      uri,
      archiveName: `copilot-chat-${sessionId}`,
      displayName: `Copilot Chat ${sessionId}`,
      mtime,
      extension: ext,
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
