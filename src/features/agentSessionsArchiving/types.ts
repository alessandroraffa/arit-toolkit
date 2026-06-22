import type * as vscode from 'vscode';

export interface SessionFile {
  readonly uri?: vscode.Uri;
  readonly readContent?: () => Promise<string>;
  readonly providerName: string;
  readonly archiveName: string;
  readonly displayName: string;
  readonly mtime: number;
  readonly compositeMtime?: string;
  readonly ctime: number;
  readonly extension: string;
}

export interface WatchPattern {
  readonly baseUri: vscode.Uri;
  readonly glob: string;
}

export interface SessionProvider {
  readonly name: string;
  readonly displayName: string;
  findSessions(workspaceRootPath: string): Promise<SessionFile[]>;
  getWatchPatterns?(workspaceRootPath: string): WatchPattern[];
}
