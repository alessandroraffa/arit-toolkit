import * as vscode from 'vscode';
import type { AgentSessionsArchivingConfig } from '../../types';
import type { SessionProvider, SessionFile } from './types';
import type { Logger } from '../../core/logger';
import { generateTimestamp, parseYYYYMMDD } from '../../utils';
import type { SessionParser, ParseResult } from './markdown';
import { getParserForProvider, renderSessionToMarkdown } from './markdown';
import {
  type ArchivedEntry,
  moveArchive,
  deduplicateAndHydrate,
  ensureDirectory,
  deleteFile,
} from './archiveServiceHelpers';
import { resolveCompanionData } from './companionDataResolver';

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
      const oldUri = vscode.Uri.joinPath(this.workspaceRootUri, oldConfig.archivePath);
      const newUri = vscode.Uri.joinPath(this.workspaceRootUri, newConfig.archivePath);
      await moveArchive(oldUri, newUri, this.logger);
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
      await deduplicateAndHydrate(archiveUri, this.lastArchivedMap, this.logger);
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

    await ensureDirectory(archiveUri, this.logger);
    const timestamp = generateTimestamp('YYYYMMDDHHmm', new Date(session.ctime));

    if (entry) {
      await deleteFile(
        vscode.Uri.joinPath(archiveUri, entry.archiveFileName),
        this.logger
      );
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
    const companionContext = await resolveCompanionData(session.uri, this.logger);
    return parser.parse(rawContent, session.archiveName, companionContext);
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
}
