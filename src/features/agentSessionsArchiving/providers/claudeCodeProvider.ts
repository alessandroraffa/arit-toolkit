import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import type { SessionFile, SessionProvider } from '../types';
import { getFileTimes } from './providerUtils';

export class ClaudeCodeProvider implements SessionProvider {
  public readonly name = 'claude-code';
  public readonly displayName = 'Claude Code';

  public async findSessions(workspaceRootPath: string): Promise<SessionFile[]> {
    const projectDirName = workspaceRootPath.replaceAll('/', '-');
    const projectUri = vscode.Uri.file(
      `${os.homedir()}/.claude/projects/${projectDirName}`
    );

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(projectUri);
    } catch {
      return [];
    }

    const results: SessionFile[] = [];
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File) {
        continue;
      }
      const session = await this.toSessionFile(projectUri, name);
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
    const times = await getFileTimes(uri);
    if (times === undefined) {
      return undefined;
    }
    return {
      uri,
      providerName: this.name,
      archiveName: `claude-code-${path.parse(name).name}`,
      displayName: `Claude Code ${name}`,
      mtime: times.mtime,
      ctime: times.ctime,
      extension: path.extname(name) || '',
    };
  }
}
