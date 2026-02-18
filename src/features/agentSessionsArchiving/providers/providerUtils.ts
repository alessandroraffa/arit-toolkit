import * as vscode from 'vscode';
import * as path from 'path';

export interface FileTimes {
  readonly mtime: number;
  readonly ctime: number;
}

export async function getFileTimes(uri: vscode.Uri): Promise<FileTimes | undefined> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return { mtime: stat.mtime, ctime: stat.ctime };
  } catch {
    return undefined;
  }
}

export async function belongsToWorkspace(
  uri: vscode.Uri,
  workspacePath: string
): Promise<boolean> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const content = new TextDecoder().decode(bytes);
    const normalized = path.normalize(workspacePath) + path.sep;
    return content.includes(normalized) || content.includes(workspacePath);
  } catch {
    return false;
  }
}
