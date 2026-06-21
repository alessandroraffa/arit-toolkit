import * as vscode from 'vscode';
import type { AgentSessionsArchivingConfig } from '../../types';
import type { SessionProvider, SessionFile } from './types';
import type { Logger } from '../../core/logger';
import { generateTimestamp, parseYYYYMMDD } from '../../utils';
import type { SessionParser, ParseResult } from './markdown';
import { getParserForProvider, renderSessionToMarkdown } from './markdown';
import { checkAndPromptGitignore } from './gitignorePrompt';
import { validateArchivePath } from './archivePathValidation';
import { ArchiveCycleGuard } from './archiveCycleGuard';
import { resolveCompanionData } from './companionDataResolver';

interface ArchivedEntry {
  /**
   * The compound fingerprint string (or stringified numeric mtime) recorded
   * when this entry was last successfully archived. Compared against
   * effectiveMtime (session.compositeMtime ?? String(session.mtime)) to decide
   * whether a re-archive is needed. The sentinel value '0' (used by H-02
   * hydration and the partial-retry path) is guaranteed to differ from any
   * real positive fingerprint.
   */
  mtime: string;
  archiveFileName: string;
  /** Content hash of the last written markdown, used for no-op write skip (H-03). */
  contentHash?: string;
}

export class AgentSessionArchiveService implements vscode.Disposable {
  private intervalHandle: ReturnType<typeof setInterval> | undefined;
  private _currentConfig: AgentSessionsArchivingConfig | undefined;
  private readonly lastArchivedMap = new Map<string, ArchivedEntry>();
  private _needsDedup = true;
  /**
   * Cache of URIs already ensured via ensureDirectory(), keyed by uri.fsPath.
   * Keys are raw fsPath strings — do not introduce relative-segment normalization
   * (e.g., './2026/05' vs '2026/05') without invalidating the cache, otherwise
   * the same logical directory may be cached under multiple keys.
   */
  private readonly ensuredDirectories = new Set<string>();
  /**
   * Re-entrancy guard for reconfigure(). Set to true on entry, reset to false in
   * a finally block on exit. When a recursive call is detected (the gitignore
   * prompt's updateConfig callback writes the config, which fires the section
   * listener, which calls reconfigure again on the same instance), the inner
   * invocation returns early without running moveArchive, the prompt, or
   * start(). The outer invocation continues normally and is the only one that
   * mutates timer/cache state. Without this guard, start() is invoked twice in
   * rapid sequence (once from the inner call, once from the outer), churning
   * the interval handle and racing two runArchiveCycle() invocations on
   * lastArchivedMap.
   */
  private _reconfiguring = false;
  private readonly _cycleGuard = new ArchiveCycleGuard();
  private _pendingStartConfig: AgentSessionsArchivingConfig | undefined;

  constructor(
    private readonly workspaceRootUri: vscode.Uri,
    private readonly providers: readonly SessionProvider[],
    private readonly logger: Logger
  ) {}

  public get currentConfig(): AgentSessionsArchivingConfig | undefined {
    return this._currentConfig;
  }

  public async start(config: AgentSessionsArchivingConfig): Promise<void> {
    if (!this._cycleGuard.beginStart()) {
      this.logger.debug('start(): stashing config for deferred start');
      this._pendingStartConfig = config;
      return;
    }
    this._pendingStartConfig = undefined;
    try {
      await this.stop();
      this.ensuredDirectories.clear();
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
    } finally {
      this._cycleGuard.endStart();
      const pending = this._pendingStartConfig;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (pending !== undefined) {
        this._pendingStartConfig = undefined;
        await this.start(pending);
      }
    }
  }

  public async stop(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
      this.logger.info('Agent sessions archiving stopped');
    }
    await this._cycleGuard.awaitAndReset();
  }

  public async reconfigure(
    oldConfig: AgentSessionsArchivingConfig | undefined,
    newConfig: AgentSessionsArchivingConfig,
    updateConfig: (patch: Partial<AgentSessionsArchivingConfig>) => Promise<void>
  ): Promise<void> {
    if (this._reconfiguring) {
      this.logger.debug(
        'Re-entrant reconfigure call detected (likely via updateConfig → section listener) — short-circuiting'
      );
      return;
    }
    this._reconfiguring = true;
    try {
      if (!oldConfig) {
        if (newConfig.enabled) {
          await this.start(newConfig);
        }
        return;
      }
      if (!newConfig.enabled) {
        await this.stop();
        this._currentConfig = newConfig;
        return;
      }
      if (oldConfig.archivePath !== newConfig.archivePath) {
        await this.moveArchive(oldConfig.archivePath, newConfig.archivePath);
        await checkAndPromptGitignore(
          newConfig.archivePath,
          this.workspaceRootUri,
          newConfig,
          this.logger,
          updateConfig
        );
      }
      await this.start(newConfig);
    } finally {
      this._reconfiguring = false;
    }
  }

  public async runArchiveCycle(force = false): Promise<void> {
    return this._cycleGuard.run((f) => this._runCycleInternal(f), force);
  }

  private async _runCycleInternal(force = false): Promise<void> {
    if (!this._currentConfig) {
      return;
    }
    const validation = validateArchivePath(this._currentConfig.archivePath);
    if (!validation.valid) {
      this.logger.warn(
        `Skipping archive cycle: invalid archivePath "${this._currentConfig.archivePath}" — ${validation.reason ?? 'unknown'}`
      );
      return;
    }
    const archiveUri = vscode.Uri.joinPath(
      this.workspaceRootUri,
      this._currentConfig.archivePath
    );
    this.logger.info('Archive cycle starting — archive root: ' + archiveUri.fsPath);
    if (this._needsDedup) {
      await this.deduplicateAndHydrate(archiveUri);
      this._needsDedup = false;
    }
    await this.archiveFromProviders(archiveUri, force);
    this.logger.debug('Archive cycle complete');
  }

  private async archiveFromProviders(
    archiveUri: vscode.Uri,
    force = false
  ): Promise<void> {
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
        await this.archiveSession(session, archiveUri, force);
      }
    }
  }

  public dispose(): void {
    void this.stop();
    this._cycleGuard.endStart();
    this._pendingStartConfig = undefined;
  }

  private async archiveSession(
    session: SessionFile,
    archiveUri: vscode.Uri,
    force = false
  ): Promise<void> {
    const effectiveMtime: string = session.compositeMtime ?? String(session.mtime);
    const entry = this.lastArchivedMap.get(session.archiveName);
    if (!force && entry?.mtime === effectiveMtime) {
      this.logger.debug(
        `Skipped ${session.displayName} — fingerprint unchanged (${effectiveMtime})`
      );
      return;
    }

    await this.ensureDirectory(archiveUri);
    const timestamp = generateTimestamp('YYYYMMDDHHmm', new Date(session.ctime));

    const { fileName: archiveFileName, companionPartial } = await this.writeArchiveFile(
      session,
      archiveUri,
      timestamp
    );
    if (archiveFileName) {
      // L2 guard: empty-session skip records '' as archiveFileName; joinPath(archiveUri, '') equals archiveUri itself
      if (entry?.archiveFileName && entry.archiveFileName !== archiveFileName) {
        await this.deleteOldArchive(
          vscode.Uri.joinPath(archiveUri, entry.archiveFileName)
        );
      }
      if (companionPartial) {
        this.logger.warn(
          `Partial archive written for ${session.displayName} — companion data unreadable; ` +
            `session will be retried on the next cycle`
        );
        this.lastArchivedMap.set(session.archiveName, {
          mtime: '0',
          archiveFileName,
        });
      } else {
        this.lastArchivedMap.set(session.archiveName, {
          mtime: effectiveMtime,
          archiveFileName,
        });
      }
      this.logger.debug(`Archived ${session.displayName} → ${archiveFileName}`);
    } else {
      this.lastArchivedMap.set(session.archiveName, {
        mtime: effectiveMtime,
        archiveFileName: '',
      });
    }
  }

  private async deleteOldArchive(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.delete(uri);
    } catch (err) {
      this.logger.warn(
        'deleteOldArchive failed — orphan duplicate left; dedup will recover on next startup: ' +
          String(err)
      );
    }
  }

  private async writeArchiveFile(
    session: SessionFile,
    archiveUri: vscode.Uri,
    timestamp: string
  ): Promise<{ fileName: string | undefined; companionPartial: boolean }> {
    const parser = getParserForProvider(session.providerName);
    if (!parser) {
      return {
        fileName: await this.copyRawArchive(session, archiveUri, timestamp),
        companionPartial: false,
      };
    }

    try {
      const { parseResult: result, companionPartial } = await this.readAndParse(
        session,
        parser
      );
      if (result.status === 'unrecognized') {
        this.logger.warn(
          `Unrecognized format for ${session.displayName}: ${result.reason}`
        );
        return {
          fileName: await this.copyRawArchive(session, archiveUri, timestamp),
          companionPartial,
        };
      }

      const allTurnsEmpty = result.session.turns.every(
        (turn) =>
          !turn.content.trim() &&
          turn.toolCalls.length === 0 &&
          !turn.thinking &&
          turn.filesRead.length === 0 &&
          turn.filesModified.length === 0
      );
      if (allTurnsEmpty) {
        this.logger.info(
          `Skipped empty session ${session.displayName} — zero non-empty turns`
        );
        return { fileName: undefined, companionPartial };
      }

      const yyyy = timestamp.substring(0, 4);
      const mm = timestamp.substring(4, 6);
      const monthUri = vscode.Uri.joinPath(archiveUri, yyyy, mm);
      await this.ensureDirectory(monthUri);
      const mdFileName = `${yyyy}/${mm}/${timestamp}-${session.archiveName}.md`;
      const mdUri = vscode.Uri.joinPath(
        archiveUri,
        yyyy,
        mm,
        `${timestamp}-${session.archiveName}.md`
      );
      const markdown = renderSessionToMarkdown(result.session);
      await vscode.workspace.fs.writeFile(mdUri, new TextEncoder().encode(markdown));
      return { fileName: mdFileName, companionPartial };
    } catch (err) {
      this.logger.warn(
        `Failed to convert ${session.displayName} to markdown: ${String(err)}`
      );
      return {
        fileName: await this.copyRawArchive(session, archiveUri, timestamp),
        companionPartial: false,
      };
    }
  }

  private async readAndParse(
    session: SessionFile,
    parser: SessionParser
  ): Promise<{ parseResult: ParseResult; companionPartial: boolean }> {
    const rawBytes = await vscode.workspace.fs.readFile(session.uri);
    const rawContent = new TextDecoder().decode(rawBytes);
    const companionContext = await resolveCompanionData(session.uri, this.logger);
    const companionPartial = companionContext.companionPartial === true;
    return {
      parseResult: parser.parse(rawContent, session.archiveName, companionContext),
      companionPartial,
    };
  }

  private async copyRawArchive(
    session: SessionFile,
    archiveUri: vscode.Uri,
    timestamp: string
  ): Promise<string | undefined> {
    const yyyy = timestamp.substring(0, 4);
    const mm = timestamp.substring(4, 6);
    const monthUri = vscode.Uri.joinPath(archiveUri, yyyy, mm);
    await this.ensureDirectory(monthUri);
    const rawFileName = `${yyyy}/${mm}/${timestamp}-${session.archiveName}${session.extension}`;
    const destUri = vscode.Uri.joinPath(
      archiveUri,
      yyyy,
      mm,
      `${timestamp}-${session.archiveName}${session.extension}`
    );

    try {
      await vscode.workspace.fs.copy(session.uri, destUri, { overwrite: true });
      return rawFileName;
    } catch (err) {
      this.logger.error(`Failed to archive ${session.displayName}: ${String(err)}`);
      return undefined;
    }
  }

  private async moveTopLevelFile(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    name: string
  ): Promise<boolean> {
    try {
      await vscode.workspace.fs.copy(
        vscode.Uri.joinPath(oldUri, name),
        vscode.Uri.joinPath(newUri, name),
        { overwrite: true }
      );
      return true;
    } catch (err) {
      this.logger.warn(`Failed to move file ${name}: ${String(err)}`);
      return false;
    }
  }

  private async moveMonthDirectory(
    monthOldUri: vscode.Uri,
    monthNewUri: vscode.Uri,
    label: string
  ): Promise<boolean> {
    let fileEntries: [string, vscode.FileType][];
    try {
      fileEntries = await vscode.workspace.fs.readDirectory(monthOldUri);
    } catch (err) {
      this.logger.warn(`Failed to read month dir ${label} during move: ${String(err)}`);
      return false;
    }
    await this.ensureDirectory(monthNewUri);
    let allOK = true;
    for (const [fileName, fileType] of fileEntries) {
      if (fileType !== vscode.FileType.File) {
        continue;
      }
      try {
        await vscode.workspace.fs.copy(
          vscode.Uri.joinPath(monthOldUri, fileName),
          vscode.Uri.joinPath(monthNewUri, fileName),
          { overwrite: true }
        );
      } catch (err) {
        allOK = false;
        this.logger.warn(`Failed to move file ${label}/${fileName}: ${String(err)}`);
      }
    }
    return allOK;
  }

  private async moveYearDirectory(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    yyyy: string
  ): Promise<boolean> {
    let monthEntries: [string, vscode.FileType][];
    try {
      monthEntries = await vscode.workspace.fs.readDirectory(
        vscode.Uri.joinPath(oldUri, yyyy)
      );
    } catch (err) {
      this.logger.warn(`Failed to read year dir ${yyyy} during move: ${String(err)}`);
      return false;
    }
    let allOK = true;
    for (const [mmName, mmType] of monthEntries) {
      if (mmType !== vscode.FileType.Directory || !/^\d{2}$/.test(mmName)) {
        continue;
      }
      const monthOK = await this.moveMonthDirectory(
        vscode.Uri.joinPath(oldUri, yyyy, mmName),
        vscode.Uri.joinPath(newUri, yyyy, mmName),
        `${yyyy}/${mmName}`
      );
      if (!monthOK) {
        allOK = false;
      }
    }
    return allOK;
  }

  private validateMovePaths(oldPath: string, newPath: string): boolean {
    const oldValidation = validateArchivePath(oldPath);
    if (!oldValidation.valid) {
      this.logger.warn(
        `Skipping moveArchive: invalid oldPath "${oldPath}" — ${oldValidation.reason ?? 'unknown'}`
      );
      return false;
    }
    const newValidation = validateArchivePath(newPath);
    if (!newValidation.valid) {
      this.logger.warn(
        `Skipping moveArchive: invalid newPath "${newPath}" — ${newValidation.reason ?? 'unknown'}`
      );
      return false;
    }
    return true;
  }

  private async finalizeMoveArchive(
    oldUri: vscode.Uri,
    oldPath: string,
    newPath: string,
    allCopiesSucceeded: boolean
  ): Promise<void> {
    if (!allCopiesSucceeded) {
      this.logger.warn(
        `moveArchive completed with copy failures — left source archive in place at "${oldPath}" for manual cleanup after verifying "${newPath}" is complete. Do NOT delete "${oldPath}" until verifying the target tree is intact.`
      );
      return;
    }
    try {
      await vscode.workspace.fs.delete(oldUri, { recursive: true });
    } catch (err) {
      this.logger.warn(
        `Failed to delete old archive directory ${oldPath} after move: ${String(err)} — left in place`
      );
    }
    this.logger.info(`Moved archive from ${oldPath} to ${newPath}`);
  }

  private async moveEntry(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    entry: [string, vscode.FileType]
  ): Promise<boolean> {
    const [name, type] = entry;
    if (type === vscode.FileType.File) {
      return this.moveTopLevelFile(oldUri, newUri, name);
    }
    if (type === vscode.FileType.Directory && /^\d{4}$/.test(name)) {
      return this.moveYearDirectory(oldUri, newUri, name);
    }
    return true;
  }

  private async copyAllMoveEntries(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    entries: [string, vscode.FileType][]
  ): Promise<boolean> {
    let allOK = true;
    for (const entry of entries) {
      const ok = await this.moveEntry(oldUri, newUri, entry);
      if (!ok) {
        allOK = false;
      }
    }
    return allOK;
  }

  private async moveArchive(oldPath: string, newPath: string): Promise<void> {
    if (!this.validateMovePaths(oldPath, newPath)) {
      return;
    }
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
    const allCopiesSucceeded = await this.copyAllMoveEntries(oldUri, newUri, entries);
    await this.finalizeMoveArchive(oldUri, oldPath, newPath, allCopiesSucceeded);
  }

  private async migrateFlatLayout(
    archiveUri: vscode.Uri,
    topEntries: [string, vscode.FileType][]
  ): Promise<void> {
    // Month constrained to 01-12 to prevent migration of files with invalid month components
    // (e.g., a manually-placed '202099310000-foo.md' would otherwise be moved into '2020/99/').
    // Total 12 digits before the '-': YYYY(4) + MM(2) + DDHHmm(6).
    const FLAT_PATTERN = /^(\d{4})(0[1-9]|1[0-2])\d{6}-.+\.\w+$/;
    for (const [name, type] of topEntries) {
      if (type !== vscode.FileType.File) {
        continue;
      }
      const m = FLAT_PATTERN.exec(name);
      if (!m?.[1] || !m[2]) {
        continue;
      }
      const yyyy = m[1];
      const mm = m[2];
      const targetDirUri = vscode.Uri.joinPath(archiveUri, yyyy, mm);
      await this.ensureDirectory(targetDirUri);
      const srcUri = vscode.Uri.joinPath(archiveUri, name);
      const destUri = vscode.Uri.joinPath(archiveUri, yyyy, mm, name);
      try {
        await vscode.workspace.fs.copy(srcUri, destUri, { overwrite: true });
        await this.deleteFile(srcUri);
        this.logger.info(`Migrated flat archive file ${name} → ${yyyy}/${mm}/${name}`);
      } catch (err) {
        this.logger.warn(
          `Failed to migrate flat archive file ${name}: ${String(err)} — left in place`
        );
      }
    }
  }

  private async deduplicateAndHydrate(archiveUri: vscode.Uri): Promise<void> {
    let topEntries: [string, vscode.FileType][];
    try {
      topEntries = await vscode.workspace.fs.readDirectory(archiveUri);
    } catch {
      return;
    }
    // Idempotent flat-layout migration sweep (see migrateFlatLayout)
    await this.migrateFlatLayout(archiveUri, topEntries);
    // Re-read after migration
    try {
      topEntries = await vscode.workspace.fs.readDirectory(archiveUri);
    } catch {
      return;
    }
    const combined: [string, vscode.FileType][] = [];
    for (const [name, type] of topEntries) {
      if (type === vscode.FileType.Directory && /^\d{4}$/.test(name)) {
        let monthEntries: [string, vscode.FileType][];
        try {
          monthEntries = await vscode.workspace.fs.readDirectory(
            vscode.Uri.joinPath(archiveUri, name)
          );
        } catch (err) {
          this.logger.debug(`Failed to read year directory ${name}: ${String(err)}`);
          continue;
        }
        for (const [mmName, mmType] of monthEntries) {
          if (mmType === vscode.FileType.Directory && /^\d{2}$/.test(mmName)) {
            let fileEntries: [string, vscode.FileType][];
            try {
              fileEntries = await vscode.workspace.fs.readDirectory(
                vscode.Uri.joinPath(archiveUri, name, mmName)
              );
            } catch (err) {
              this.logger.debug(
                `Failed to read month directory ${name}/${mmName}: ${String(err)}`
              );
              continue;
            }
            for (const [fileName, fileType] of fileEntries) {
              combined.push([`${name}/${mmName}/${fileName}`, fileType]);
            }
          }
        }
      }
    }
    const grouped = this.groupArchiveFiles(combined);
    for (const [archiveName, files] of grouped) {
      if (files.length > 1) {
        await this.removeDuplicates(archiveUri, files);
      }
      const best = files[0];
      if (best && !this.lastArchivedMap.has(archiveName)) {
        // H-02: always seed with the '0' sentinel instead of the archive file's
        // own stat mtime. The source clock (effectiveMtime from the session's
        // compositeMtime) and the archive file's mtime are different clocks and
        // never coincide, so seeding from the stat mtime would cause every
        // previously-archived session to be fully rewritten on every restart.
        // The '0' sentinel forces exactly ONE re-archive per restart; H-03's
        // content-hash skip makes that re-archive a no-op write when the
        // rendered markdown is byte-identical.
        this.lastArchivedMap.set(archiveName, { mtime: '0', archiveFileName: best.name });
      }
    }
  }

  private groupArchiveFiles(
    entries: [string, vscode.FileType][]
  ): Map<string, { ts: string; name: string }[]> {
    // Optional YYYY/MM/ prefix retained as defense-in-depth: it covers the
    // transitional state where migrateFlatLayout fails on some files and the
    // post-migrate readDirectory still returns flat-form entries. Currently
    // `combined` is built only from entries under YYYY/MM/ subdirectories, so
    // the optional branch is unreachable for combined entries. Remove only after
    // confirming (via the migration tests and at least one release cycle) that
    // no code path can surface flat-form entries to groupArchiveFiles.
    const PATTERN = /^(?:\d{4}\/\d{2}\/)?(\d{12})-(.+)\.\w+$/;
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
    const key = uri.fsPath;
    if (this.ensuredDirectories.has(key)) {
      return;
    }
    try {
      await vscode.workspace.fs.createDirectory(uri);
      this.ensuredDirectories.add(key);
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
