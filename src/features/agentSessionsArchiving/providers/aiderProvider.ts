import * as vscode from 'vscode';
import type { SessionFile, SessionProvider } from '../types';
import { getMtime } from './providerUtils';

const FILES = [
  { name: '.aider.chat.history.md', archiveName: 'aider-chat-history', ext: '.md' },
  { name: '.aider.input.history', archiveName: 'aider-input-history', ext: '.txt' },
] as const;

export class AiderProvider implements SessionProvider {
  public readonly name = 'aider';
  public readonly displayName = 'Aider';

  public async findSessions(workspaceRootPath: string): Promise<SessionFile[]> {
    const results: SessionFile[] = [];
    const rootUri = vscode.Uri.file(workspaceRootPath);

    for (const file of FILES) {
      const uri = vscode.Uri.joinPath(rootUri, file.name);
      const mtime = await getMtime(uri);
      if (mtime !== undefined) {
        results.push({
          uri,
          providerName: this.name,
          archiveName: file.archiveName,
          displayName: `Aider ${file.name}`,
          mtime,
          extension: file.ext,
        });
      }
    }

    return results;
  }
}
