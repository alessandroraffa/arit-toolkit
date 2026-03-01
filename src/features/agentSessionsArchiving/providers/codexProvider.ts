import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import type { SessionFile, SessionProvider, WatchPattern } from '../types';
import { getFileTimes } from './providerUtils';

const CODEX_SESSIONS_DIR = path.join('.codex', 'sessions');

interface SessionMeta {
  readonly id?: string;
  readonly cwd?: string;
}

interface MetaLine {
  readonly type?: string;
  readonly payload?: SessionMeta;
}

function parseFirstLine(bytes: Uint8Array): MetaLine | undefined {
  const newlineIdx = bytes.indexOf(10);
  const slice = newlineIdx !== -1 ? bytes.slice(0, newlineIdx) : bytes;
  try {
    return JSON.parse(new TextDecoder().decode(slice)) as MetaLine;
  } catch {
    return undefined;
  }
}

function cwdMatches(meta: SessionMeta, workspacePath: string): boolean {
  return !!meta.cwd && path.normalize(meta.cwd) === path.normalize(workspacePath);
}

export class CodexProvider implements SessionProvider {
  public readonly name = 'codex';
  public readonly displayName = 'OpenAI Codex';

  public getWatchPatterns(_workspaceRootPath: string): WatchPattern[] {
    const baseUri = vscode.Uri.file(path.join(os.homedir(), CODEX_SESSIONS_DIR));
    return [{ baseUri, glob: '**/*.jsonl' }];
  }

  public async findSessions(workspaceRootPath: string): Promise<SessionFile[]> {
    const sessionsUri = vscode.Uri.file(path.join(os.homedir(), CODEX_SESSIONS_DIR));
    return this.scanDir(sessionsUri, workspaceRootPath);
  }

  private async scanDir(
    uri: vscode.Uri,
    workspaceRootPath: string
  ): Promise<SessionFile[]> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(uri);
    } catch {
      return [];
    }

    const results: SessionFile[] = [];
    for (const [name, type] of entries) {
      const child = vscode.Uri.joinPath(uri, name);
      if (type === vscode.FileType.Directory) {
        results.push(...(await this.scanDir(child, workspaceRootPath)));
      } else if (type === vscode.FileType.File && name.endsWith('.jsonl')) {
        const session = await this.toSessionFile(child, name, workspaceRootPath);
        if (session) results.push(session);
      }
    }
    return results;
  }

  private async toSessionFile(
    uri: vscode.Uri,
    fname: string,
    workspaceRootPath: string
  ): Promise<SessionFile | undefined> {
    const meta = await this.readSessionMeta(uri);
    if (!meta) return undefined;
    if (!cwdMatches(meta, workspaceRootPath)) return undefined;

    const times = await getFileTimes(uri);
    if (!times) return undefined;

    const sessionId = meta.id ?? path.parse(fname).name;
    return {
      uri,
      providerName: this.name,
      archiveName: `codex-${sessionId}`,
      displayName: `${this.displayName} ${fname}`,
      mtime: times.mtime,
      ctime: times.ctime,
      extension: '.jsonl',
    };
  }

  private async readSessionMeta(uri: vscode.Uri): Promise<SessionMeta | undefined> {
    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(uri);
    } catch {
      return undefined;
    }
    const line = parseFirstLine(bytes);
    if (line?.type !== 'session_meta') return undefined;
    return line.payload;
  }
}
