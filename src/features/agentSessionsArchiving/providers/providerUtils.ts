import * as vscode from 'vscode';
import * as path from 'path';

export async function getMtime(uri: vscode.Uri): Promise<number | undefined> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return stat.mtime;
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
