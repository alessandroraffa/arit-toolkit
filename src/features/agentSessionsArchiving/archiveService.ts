import * as vscode from 'vscode';
import type { AgentSessionsArchivingConfig } from '../../types';
import type { SessionProvider, SessionFile } from './types';
import type { Logger } from '../../core/logger';
import { generateTimestamp, parseYYYYMMDD } from '../../utils';
import type { SessionParser, ParseResult } from './markdown';
import { getParserForProvider, renderSessionToMarkdown } from './markdown';

interface ArchivedEntry {
  mtime: number;
  archiveFileName: string;
}

export class AgentSessionArchiveService implements vscode.Disposable {
  private intervalHandle: ReturnType<typeof setInterval> | undefined;
  private _currentConfig: AgentSessionsArchivingConfig | undefined;
  private readonly lastArchivedMap = new Map<string, ArchivedEntry>();
  private _needsDedup = true;

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
    this._needsDedup = true;
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
    const archiveUri = vscode.Uri.joinPath(
      this.workspaceRootUri,
      this._currentConfig.archivePath
    );
    if (this._needsDedup) {
      await this.deduplicateAndHydrate(archiveUri);
      this._needsDedup = false;
    }
    await this.archiveFromProviders(archiveUri);
  }

  private async archiveFromProviders(archiveUri: vscode.Uri): Promise<void> {
    const workspacePath = this.workspaceRootUri.fsPath;
    const cutoffMs = this._currentConfig?.ignoreSessionsBefore
      ? parseYYYYMMDD(this._currentConfig.ignoreSessionsBefore)
      : 0;

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
        if (session.ctime < cutoffMs) {
          continue;
        }
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
    const timestamp = generateTimestamp('YYYYMMDDHHmm', new Date(session.ctime));

    if (entry) {
      await this.deleteFile(vscode.Uri.joinPath(archiveUri, entry.archiveFileName));
    }

    const archiveFileName = await this.writeArchiveFile(session, archiveUri, timestamp);
    if (archiveFileName) {
      this.lastArchivedMap.set(session.archiveName, {
        mtime: session.mtime,
        archiveFileName,
      });
      this.logger.debug(`Archived ${session.displayName} → ${archiveFileName}`);
    }
  }

  private async writeArchiveFile(
    session: SessionFile,
    archiveUri: vscode.Uri,
    timestamp: string
  ): Promise<string | undefined> {
    const parser = getParserForProvider(session.providerName);
    if (!parser) {
      return await this.copyRawArchive(session, archiveUri, timestamp);
    }

    try {
      const result = await this.readAndParse(session, parser);
      if (result.status === 'unrecognized') {
        this.logger.warn(
          `Unrecognized format for ${session.displayName}: ${result.reason}`
        );
        return await this.copyRawArchive(session, archiveUri, timestamp);
      }

      const mdFileName = `${timestamp}-${session.archiveName}.md`;
      const mdUri = vscode.Uri.joinPath(archiveUri, mdFileName);
      const markdown = renderSessionToMarkdown(result.session);
      await vscode.workspace.fs.writeFile(mdUri, new TextEncoder().encode(markdown));
      return mdFileName;
    } catch (err) {
      this.logger.warn(
        `Failed to convert ${session.displayName} to markdown: ${String(err)}`
      );
      return await this.copyRawArchive(session, archiveUri, timestamp);
    }
  }

  private async readAndParse(
    session: SessionFile,
    parser: SessionParser
  ): Promise<ParseResult> {
    const rawBytes = await vscode.workspace.fs.readFile(session.uri);
    const rawContent = new TextDecoder().decode(rawBytes);
    return parser.parse(rawContent, session.archiveName);
  }

  private async copyRawArchive(
    session: SessionFile,
    archiveUri: vscode.Uri,
    timestamp: string
  ): Promise<string | undefined> {
    const rawFileName = `${timestamp}-${session.archiveName}${session.extension}`;
    const destUri = vscode.Uri.joinPath(archiveUri, rawFileName);

    try {
      await vscode.workspace.fs.copy(session.uri, destUri, { overwrite: true });
      return rawFileName;
    } catch (err) {
      this.logger.error(`Failed to archive ${session.displayName}: ${String(err)}`);
      return undefined;
    }
  }

  private async moveArchive(oldPath: string, newPath: string): Promise<void> {
    const oldUri = vscode.Uri.joinPath(this.workspaceRootUri, oldPath);
    const newUri = vscode.Uri.joinPath(this.workspaceRootUri, newPath);

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(oldUri);
    } catch {
      this.logger.debug(`Old archive directory not found, skipping move: ${oldPath}`);
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
    this.logger.info(`Moved archive from ${oldPath} to ${newPath}`);
  }

  private async deduplicateAndHydrate(archiveUri: vscode.Uri): Promise<void> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(archiveUri);
    } catch {
      return;
    }
    const grouped = this.groupArchiveFiles(entries);
    for (const [archiveName, files] of grouped) {
      if (files.length > 1) {
        await this.removeDuplicates(archiveUri, files);
      }
      const best = files[0];
      if (best && !this.lastArchivedMap.has(archiveName)) {
        this.lastArchivedMap.set(archiveName, { mtime: 0, archiveFileName: best.name });
      }
    }
  }

  private groupArchiveFiles(
    entries: [string, vscode.FileType][]
  ): Map<string, { ts: string; name: string }[]> {
    const PATTERN = /^(\d{12})-(.+)\.\w+$/;
    const groups = new Map<string, { ts: string; name: string }[]>();
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File) {
        continue;
      }
      const m = PATTERN.exec(name);
      if (!m?.[1] || !m[2]) {
        continue;
      }
      const list = groups.get(m[2]) ?? [];
      list.push({ ts: m[1], name });
      groups.set(m[2], list);
    }
    return groups;
  }

  private async removeDuplicates(
    archiveUri: vscode.Uri,
    files: { ts: string; name: string }[]
  ): Promise<void> {
    files.sort((a, b) => b.ts.localeCompare(a.ts));
    for (let i = 1; i < files.length; i++) {
      const dup = files[i];
      if (dup) {
        await this.deleteFile(vscode.Uri.joinPath(archiveUri, dup.name));
        this.logger.info(`Removed duplicate archive: ${dup.name}`);
      }
    }
  }

  private async ensureDirectory(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(uri);
    } catch (err) {
      this.logger.debug(`ensureDirectory: ${String(err)}`);
    }
  }

  private async deleteFile(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.delete(uri);
    } catch (err) {
      this.logger.debug(`deleteFile: ${String(err)}`);
    }
  }
}
