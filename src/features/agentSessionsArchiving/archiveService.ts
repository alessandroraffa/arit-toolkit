import * as vscode from 'vscode';
import type { AgentSessionsArchivingConfig } from '../../types';
import type { SessionProvider, SessionFile } from './types';
import type { Logger } from '../../core/logger';
import { generateTimestamp } from '../../utils';

interface ArchivedEntry {
  mtime: number;
  archiveFileName: string;
}

export class AgentSessionArchiveService implements vscode.Disposable {
  private intervalHandle: ReturnType<typeof setInterval> | undefined;
  private _currentConfig: AgentSessionsArchivingConfig | undefined;
  private readonly lastArchivedMap = new Map<string, ArchivedEntry>();

  constructor(
    private readonly workspaceRootUri: vscode.Uri,
    private readonly providers: readonly SessionProvider[],
    private readonly logger: Logger
  ) {}

  public get currentConfig(): AgentSessionsArchivingConfig | undefined {
    return this._currentConfig;
  }

  public start(config: AgentSessionsArchivingConfig): void {
    this.stop();
    this._currentConfig = config;
    const intervalMs = config.intervalMinutes * 60_000;
    this.logger.info(
      `Agent sessions archiving started (interval: ${String(config.intervalMinutes)}m)`
    );
    void this.runArchiveCycle();
    this.intervalHandle = setInterval(() => {
      void this.runArchiveCycle();
    }, intervalMs);
  }

  public stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
      this.logger.info('Agent sessions archiving stopped');
    }
  }

  public async reconfigure(
    oldConfig: AgentSessionsArchivingConfig | undefined,
    newConfig: AgentSessionsArchivingConfig
  ): Promise<void> {
    if (!oldConfig) {
      if (newConfig.enabled) {
        this.start(newConfig);
      }
      return;
    }
    if (!newConfig.enabled) {
      this.stop();
      this._currentConfig = newConfig;
      return;
    }
    if (oldConfig.archivePath !== newConfig.archivePath) {
      await this.moveArchive(oldConfig.archivePath, newConfig.archivePath);
    }
    this.start(newConfig);
  }

  public async runArchiveCycle(): Promise<void> {
    if (!this._currentConfig) {
      return;
    }
    const workspacePath = this.workspaceRootUri.fsPath;
    const archiveUri = vscode.Uri.joinPath(
      this.workspaceRootUri,
      this._currentConfig.archivePath
    );

    for (const provider of this.providers) {
      let sessions: SessionFile[];
      try {
        sessions = await provider.findSessions(workspacePath);
      } catch (err) {
        this.logger.error(
          `Error finding sessions for ${provider.displayName}: ${String(err)}`
        );
        continue;
      }
      for (const session of sessions) {
        await this.archiveSession(session, archiveUri);
      }
    }
  }

  public dispose(): void {
    this.stop();
  }

  private async archiveSession(
    session: SessionFile,
    archiveUri: vscode.Uri
  ): Promise<void> {
    const entry = this.lastArchivedMap.get(session.archiveName);
    if (entry?.mtime === session.mtime) {
      return;
    }

    await this.ensureDirectory(archiveUri);
    const timestamp = generateTimestamp('YYYYMMDDHHmm');
    const newFileName = `${timestamp}-${session.archiveName}${session.extension}`;

    if (entry) {
      await this.deleteFile(vscode.Uri.joinPath(archiveUri, entry.archiveFileName));
    }

    const destUri = vscode.Uri.joinPath(archiveUri, newFileName);
    try {
      await vscode.workspace.fs.copy(session.uri, destUri, { overwrite: true });
      this.lastArchivedMap.set(session.archiveName, {
        mtime: session.mtime,
        archiveFileName: newFileName,
      });
      this.logger.debug(`Archived ${session.displayName} → ${newFileName}`);
    } catch (err) {
      this.logger.error(`Failed to archive ${session.displayName}: ${String(err)}`);
    }
  }

  private async moveArchive(oldPath: string, newPath: string): Promise<void> {
    const oldUri = vscode.Uri.joinPath(this.workspaceRootUri, oldPath);
    const newUri = vscode.Uri.joinPath(this.workspaceRootUri, newPath);

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(oldUri);
    } catch {
      return;
    }

    await this.ensureDirectory(newUri);
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File) {
        continue;
      }
      await vscode.workspace.fs.copy(
        vscode.Uri.joinPath(oldUri, name),
        vscode.Uri.joinPath(newUri, name)
      );
    }
    await vscode.workspace.fs.delete(oldUri, { recursive: true });

    for (const [key, entry] of this.lastArchivedMap) {
      this.lastArchivedMap.set(key, entry);
    }
    this.logger.info(`Moved archive from ${oldPath} to ${newPath}`);
  }

  private async ensureDirectory(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(uri);
    } catch {
      // directory already exists
    }
  }

  private async deleteFile(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.delete(uri);
    } catch {
      // file may not exist
    }
  }
}
