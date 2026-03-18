import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import type { SessionFile, SessionProvider, WatchPattern } from '../types';
import { getFileTimes } from './providerUtils';

export class ClaudeCodeProvider implements SessionProvider {
  public readonly name = 'claude-code';
  public readonly displayName = 'Claude Code';

  public getWatchPatterns(workspaceRootPath: string): WatchPattern[] {
    const projectDirName = workspaceRootPath.replaceAll('/', '-');
    const baseUri = vscode.Uri.file(`${os.homedir()}/.claude/projects/${projectDirName}`);
    return [
      { baseUri, glob: '*.jsonl' },
      { baseUri, glob: '*/subagents/*.jsonl' },
      { baseUri, glob: '*/tool-results/*' },
    ];
  }

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
      if (type !== vscode.FileType.File || !name.endsWith('.jsonl')) {
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
    const sessionId = path.parse(name).name;
    const companionDirUri = vscode.Uri.file(
      path.join(path.dirname(uri.fsPath), sessionId)
    );
    const compositeMtime = await this.computeCompositeMtime(times.mtime, companionDirUri);
    return {
      uri,
      providerName: this.name,
      archiveName: `claude-code-${sessionId}`,
      displayName: `Claude Code ${name}`,
      mtime: times.mtime,
      compositeMtime,
      ctime: times.ctime,
      extension: path.extname(name) || '',
    };
  }

  private async computeCompositeMtime(
    mainMtime: number,
    companionDirUri: vscode.Uri
  ): Promise<number> {
    let topEntries: [string, vscode.FileType][];
    try {
      topEntries = await vscode.workspace.fs.readDirectory(companionDirUri);
    } catch {
      return mainMtime;
    }

    let max = mainMtime;
    for (const [entryName, entryType] of topEntries) {
      if (
        entryType !== vscode.FileType.Directory ||
        (entryName !== 'subagents' && entryName !== 'tool-results')
      ) {
        continue;
      }
      const subdirUri = vscode.Uri.joinPath(companionDirUri, entryName);
      max = await this.maxMtimeInSubdir(max, subdirUri);
    }
    return max;
  }

  private async maxMtimeInSubdir(
    currentMax: number,
    subdirUri: vscode.Uri
  ): Promise<number> {
    let subEntries: [string, vscode.FileType][];
    try {
      subEntries = await vscode.workspace.fs.readDirectory(subdirUri);
    } catch {
      return currentMax;
    }

    let max = currentMax;
    for (const [fileName, fileType] of subEntries) {
      if (fileType !== vscode.FileType.File) {
        continue;
      }
      const fileUri = vscode.Uri.joinPath(subdirUri, fileName);
      try {
        const stat = await vscode.workspace.fs.stat(fileUri);
        max = Math.max(max, stat.mtime);
      } catch {
        continue;
      }
    }
    return max;
  }
}
