import * as vscode from 'vscode';
import type { SessionProvider } from './types';
import { WATCH_DEBOUNCE_MS } from './constants';

export class SessionFileWatcher implements vscode.Disposable {
  private watchers: vscode.FileSystemWatcher[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly providers: readonly SessionProvider[],
    private readonly onChanged: () => void
  ) {}

  public start(workspaceRootPath: string): void {
    this.stop();
    for (const provider of this.providers) {
      const patterns = provider.getWatchPatterns?.(workspaceRootPath) ?? [];
      for (const { baseUri, glob } of patterns) {
        this.createWatcher(baseUri, glob);
      }
    }
  }

  public stop(): void {
    this.clearDebounce();
    for (const w of this.watchers) {
      w.dispose();
    }
    this.watchers = [];
  }

  public dispose(): void {
    this.stop();
  }

  private createWatcher(baseUri: vscode.Uri, glob: string): void {
    const pattern = new vscode.RelativePattern(baseUri, glob);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidChange(() => {
      this.scheduleCallback();
    });
    watcher.onDidCreate(() => {
      this.scheduleCallback();
    });
    this.watchers.push(watcher);
  }

  private scheduleCallback(): void {
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.onChanged();
    }, WATCH_DEBOUNCE_MS);
  }

  private clearDebounce(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }
}
