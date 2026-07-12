import * as crypto from 'crypto';
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
import {
  MAX_ARCHIVE_BYTES,
  DEFAULT_ARCHIVE_PATH,
  HISTORICAL_DEFAULT_ARCHIVE_PATH,
} from './constants';

/**
 * Compares two byte arrays for exact equality (length, then every byte).
 * Used by relocateFile() to decide whether a pre-existing destination file
 * is byte-identical to its source before treating a copy as a no-op success.
 */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

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
  /** One-shot guard: reconcileArchiveLocation runs only on the first cycle. */
  private _locationReconciled = false;

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
      this._locationReconciled = false;
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
    if (!this._locationReconciled) {
      await this.reconcileArchiveLocation();
      this._locationReconciled = true;
    }
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

    const {
      fileName: archiveFileName,
      companionPartial,
      contentHash,
    } = await this.writeArchiveFile(session, archiveUri, timestamp, entry);
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
          ...(contentHash !== undefined ? { contentHash } : {}),
        });
      } else {
        this.lastArchivedMap.set(session.archiveName, {
          mtime: effectiveMtime,
          archiveFileName,
          ...(contentHash !== undefined ? { contentHash } : {}),
        });
      }
      this.logger.debug(`Archived ${session.displayName} → ${archiveFileName}`);
    } else {
      // B-03: when the session was skipped as empty but the companion data was
      // partial (e.g. a compaction file was transiently locked), record mtime '0'
      // so the session is retried next cycle rather than being permanently skipped.
      // Once companion data is readable the session will be re-evaluated; if it
      // is still empty (zero non-empty turns, no subagents, no compaction) it will
      // be skipped again and this time the recorded mtime will match effectiveMtime.
      this.lastArchivedMap.set(session.archiveName, {
        mtime: companionPartial ? '0' : effectiveMtime,
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

  /**
   * Compute a stable SHA-1 hex fingerprint of the rendered markdown string.
   * Used by H-03 to detect byte-identical re-renders and skip the writeFile call.
   */
  private computeContentHash(markdown: string): string {
    return crypto.createHash('sha1').update(markdown, 'utf8').digest('hex');
  }

  private async writeArchiveFile(
    session: SessionFile,
    archiveUri: vscode.Uri,
    timestamp: string,
    priorEntry?: ArchivedEntry
  ): Promise<{
    fileName: string | undefined;
    companionPartial: boolean;
    contentHash?: string;
  }> {
    const parser = getParserForProvider(session.providerName);
    if (!parser) {
      if (session.readContent !== undefined) {
        this.logger.warn(
          `No parser for content-backed session ${session.displayName} (provider: ${session.providerName}) — skipping`
        );
        return { fileName: undefined, companionPartial: false };
      }
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
        if (session.readContent !== undefined) {
          return { fileName: undefined, companionPartial };
        }
        return {
          fileName: await this.copyRawArchive(session, archiveUri, timestamp),
          companionPartial,
        };
      }

      const allTurnsEmpty =
        result.session.turns.every(
          (turn) =>
            !turn.content.trim() &&
            turn.toolCalls.length === 0 &&
            !turn.thinking &&
            turn.filesRead.length === 0 &&
            turn.filesModified.length === 0
        ) &&
        !(
          result.session.subagentSessions && result.session.subagentSessions.length > 0
        ) &&
        !(
          result.session.compactionSummaries &&
          result.session.compactionSummaries.length > 0
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
      let markdown = renderSessionToMarkdown(result.session);

      // R-05: enforce max-archive-bytes ceiling with structure-aware truncation.
      // A blind byte slice can cut mid-code-fence or mid-<details> block; we
      // instead snap to the last top-level block boundary ('\n---\n') at or
      // before the cap.  When no such boundary exists in the head, we scan the
      // sliced head for unclosed ``` fences and unclosed <details> tags and
      // emit the required closers before the elision banner so the resulting
      // document remains structurally valid.
      if (markdown.length > MAX_ARCHIVE_BYTES) {
        markdown = this.truncateMarkdownSafely(markdown);
        this.logger.warn(
          `Archive for ${session.displayName} exceeded max size and was truncated`
        );
      }

      const contentHash = this.computeContentHash(markdown);

      // H-03: skip writeFile when the rendered markdown is byte-identical to the prior
      // archive AND the archive file still exists on disk. Still update lastArchivedMap
      // mtime to effectiveMtime via the returned contentHash (archiveSession handles that).
      const priorHash = priorEntry?.contentHash;
      const priorFileName = priorEntry?.archiveFileName;
      if (
        priorHash !== undefined &&
        priorHash === contentHash &&
        priorFileName === mdFileName
      ) {
        // Verify the archive file still exists before declaring a no-op skip
        let archiveExists = false;
        try {
          await vscode.workspace.fs.stat(mdUri);
          archiveExists = true;
        } catch {
          // File absent — fall through to write it
        }
        if (archiveExists) {
          this.logger.debug(
            `No-op write skip for ${session.displayName} — content hash unchanged`
          );
          return { fileName: mdFileName, companionPartial, contentHash };
        }
      }

      await vscode.workspace.fs.writeFile(mdUri, new TextEncoder().encode(markdown));
      return { fileName: mdFileName, companionPartial, contentHash };
    } catch (err) {
      this.logger.warn(
        `Failed to convert ${session.displayName} to markdown: ${String(err)}`
      );
      if (session.readContent !== undefined) {
        return { fileName: undefined, companionPartial: false };
      }
      return {
        fileName: await this.copyRawArchive(session, archiveUri, timestamp),
        companionPartial: false,
      };
    }
  }

  /**
   * Read session content and parse it.
   *
   * When `session.readContent` is present (content-backed sessions such as
   * OpenCode), it is called in its own try/catch. A throw logs a per-session
   * warn and skips the session (does NOT rethrow). Companion resolution is
   * skipped for content-backed sessions (no file URI).
   *
   * When `session.readContent` is absent, the existing file-read path runs via
   * `vscode.workspace.fs.readFile(session.uri)` and companion data is resolved.
   */
  private async readAndParse(
    session: SessionFile,
    parser: SessionParser
  ): Promise<{ parseResult: ParseResult; companionPartial: boolean }> {
    if (session.readContent !== undefined) {
      let rawContent: string;
      try {
        rawContent = await session.readContent();
      } catch (err) {
        this.logger.warn(
          `OpenCode session ${session.displayName}: readContent threw — skipping: ${String(err)}`
        );
        return {
          parseResult: { status: 'unrecognized', reason: 'readContent threw' },
          companionPartial: false,
        };
      }
      return {
        parseResult: parser.parse(rawContent, session.archiveName),
        companionPartial: false,
      };
    }

    const sessionUri = session.uri;
    if (!sessionUri) {
      return {
        parseResult: { status: 'unrecognized', reason: 'no uri and no readContent' },
        companionPartial: false,
      };
    }
    const rawBytes = await vscode.workspace.fs.readFile(sessionUri);
    const rawContent = new TextDecoder().decode(rawBytes);
    // H-07: pass rawContent so resolveCompanionData can build the referenced-filename
    // set and skip unreferenced tool-result files (lazy/referenced loading).
    const companionContext = await resolveCompanionData(
      sessionUri,
      this.logger,
      rawContent
    );
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
    // Content-backed sessions (readContent present) have no file URI — skip copy.
    if (!session.uri) {
      return undefined;
    }
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

  /**
   * Returns true only for Finder metadata entries (a File named exactly
   * .DS_Store) that must never gate relocation success or be copied to the
   * new archive root. Applied at both the top-level traversal (moveEntry)
   * and the per-month traversal (moveMonthDirectory).
   */
  private shouldIgnoreArchiveEntry(name: string, type: vscode.FileType): boolean {
    return type === vscode.FileType.File && name === '.DS_Store';
  }

  /**
   * Relocates a single file from srcUri to destUri, loss-safely:
   * - Destination absent: copy with { overwrite: false }.
   * - Destination present: compare bytes. Identical → success without
   *   copying. Divergent → failure, destination is never overwritten.
   *   A read/stat failure during comparison is treated identically to a
   *   confirmed mismatch (never success) — see SPEC-002 Constraint 4 and
   *   KZ-2026-06-21-001 (catch-returns-success anti-pattern) — so the source
   *   is always preserved when the destination's true content is unknown.
   */
  private async relocateFile(
    srcUri: vscode.Uri,
    destUri: vscode.Uri,
    label: string,
    logPrefix: string
  ): Promise<boolean> {
    let destExists = true;
    try {
      await vscode.workspace.fs.stat(destUri);
    } catch {
      destExists = false;
    }
    if (!destExists) {
      try {
        await vscode.workspace.fs.copy(srcUri, destUri, { overwrite: false });
        return true;
      } catch (err) {
        this.logger.warn(`${logPrefix}: failed to move "${label}" — ${String(err)}`);
        return false;
      }
    }
    let srcBytes: Uint8Array;
    let destBytes: Uint8Array;
    try {
      srcBytes = await vscode.workspace.fs.readFile(srcUri);
      destBytes = await vscode.workspace.fs.readFile(destUri);
    } catch (err) {
      this.logger.warn(`${logPrefix}: failed to compare "${label}" — ${String(err)}`);
      return false;
    }
    if (bytesEqual(srcBytes, destBytes)) {
      return true;
    }
    this.logger.warn(
      `${logPrefix}: destination differs for "${label}" — leaving source for manual reconciliation`
    );
    return false;
  }

  private async moveTopLevelFile(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    name: string
  ): Promise<boolean> {
    const srcUri = vscode.Uri.joinPath(oldUri, name);
    const destUri = vscode.Uri.joinPath(newUri, name);
    return this.relocateFile(srcUri, destUri, name, 'moveTopLevelFile');
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
      if (this.shouldIgnoreArchiveEntry(fileName, fileType)) {
        continue;
      }
      if (fileType !== vscode.FileType.File) {
        continue;
      }
      const srcUri = vscode.Uri.joinPath(monthOldUri, fileName);
      const destUri = vscode.Uri.joinPath(monthNewUri, fileName);
      const ok = await this.relocateFile(
        srcUri,
        destUri,
        `${label}/${fileName}`,
        'moveMonthDirectory'
      );
      if (!ok) {
        allOK = false;
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
  ): Promise<boolean> {
    if (!allCopiesSucceeded) {
      this.logger.warn(
        `moveArchive completed with copy failures — left source archive in place at "${oldPath}" for manual cleanup after verifying "${newPath}" is complete. Do NOT delete "${oldPath}" until verifying the target tree is intact.`
      );
      return false;
    }
    try {
      await vscode.workspace.fs.delete(oldUri, { recursive: true });
    } catch (err) {
      this.logger.warn(
        `Failed to delete old archive directory ${oldPath} after move: ${String(err)} — left in place`
      );
    }
    this.logger.info(`Moved archive from ${oldPath} to ${newPath}`);
    return true;
  }

  private async moveEntry(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    entry: [string, vscode.FileType]
  ): Promise<boolean> {
    const [name, type] = entry;
    if (this.shouldIgnoreArchiveEntry(name, type)) {
      return true;
    }
    if (type === vscode.FileType.File) {
      return this.moveTopLevelFile(oldUri, newUri, name);
    }
    if (type === vscode.FileType.Directory && /^\d{4}$/.test(name)) {
      return this.moveYearDirectory(oldUri, newUri, name);
    }
    // Unrecognized entry (non-year directory, symlink, etc.): return false so
    // the source tree is preserved and surfaced for manual reconciliation.
    this.logger.warn(
      `moveArchive: skipping unrecognized entry "${name}" (type ${String(type)}) — source will be left intact for manual reconciliation`
    );
    return false;
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

  /**
   * One-shot, idempotent relocation of the historical archive tree to the new
   * default location. Only executes when:
   * - currentConfig.archivePath equals DEFAULT_ARCHIVE_PATH (new default); AND
   * - the historical default directory exists and is non-empty; AND
   * - the historical and configured paths differ.
   *
   * Reuses moveArchive's loss-safe copy-then-delete-on-full-success mechanism.
   * Surfaces ONE non-blocking VS Code notification after the move:
   * - showInformationMessage on full success
   * - showWarningMessage on partial failure (some archives remain at old location)
   * No notification when there is nothing to move (SPEC-002 AC-10: not a prompt).
   * Errors are caught and logged; they do not propagate out of the cycle.
   */
  private async reconcileArchiveLocation(): Promise<void> {
    if (!this._currentConfig) {
      return;
    }
    if (this._currentConfig.archivePath !== DEFAULT_ARCHIVE_PATH) {
      return;
    }
    try {
      const historicalUri = vscode.Uri.joinPath(
        this.workspaceRootUri,
        HISTORICAL_DEFAULT_ARCHIVE_PATH
      );
      let entries: [string, vscode.FileType][];
      try {
        entries = await vscode.workspace.fs.readDirectory(historicalUri);
      } catch {
        return; // historical directory absent or unreadable — nothing to move
      }
      if (entries.length === 0) {
        return; // empty — nothing to move
      }
      const allSucceeded = await this.moveArchive(
        HISTORICAL_DEFAULT_ARCHIVE_PATH,
        DEFAULT_ARCHIVE_PATH
      );
      if (allSucceeded) {
        void vscode.window.showInformationMessage(
          `Tangyr: relocated session archives to ${DEFAULT_ARCHIVE_PATH}.`
        );
      } else {
        const action = await vscode.window.showWarningMessage(
          `Tangyr: some archives remain at ${HISTORICAL_DEFAULT_ARCHIVE_PATH} — see docs/operations/runbooks/agent-session-archiving-verification.md for reconciliation steps.`,
          'View Log'
        );
        if (action === 'View Log') {
          this.logger.show();
        }
      }
    } catch (err) {
      this.logger.warn(`reconcileArchiveLocation: unexpected error — ${String(err)}`);
    }
  }

  /**
   * Moves the archive tree from oldPath to newPath using a loss-safe
   * copy-all-then-delete-source strategy. Returns true when all entries were
   * copied and the source was deleted; returns false on any copy failure
   * (source is left intact for manual reconciliation).
   */
  private async moveArchive(oldPath: string, newPath: string): Promise<boolean> {
    if (!this.validateMovePaths(oldPath, newPath)) {
      return false;
    }
    const oldUri = vscode.Uri.joinPath(this.workspaceRootUri, oldPath);
    const newUri = vscode.Uri.joinPath(this.workspaceRootUri, newPath);
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(oldUri);
    } catch {
      this.logger.debug(`Old archive directory not found, skipping move: ${oldPath}`);
      return true; // nothing to move is not a failure
    }
    await this.ensureDirectory(newUri);
    const allCopiesSucceeded = await this.copyAllMoveEntries(oldUri, newUri, entries);
    return await this.finalizeMoveArchive(oldUri, oldPath, newPath, allCopiesSucceeded);
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

  /**
   * R-05: Truncate a markdown document to at most MAX_ARCHIVE_BYTES while
   * preserving structural validity.
   *
   * Strategy:
   * 1. Search for the last occurrence of '\n---\n' (top-level block separator)
   *    at or before MAX_ARCHIVE_BYTES and snap to that boundary.
   * 2. When no separator is found in the head, slice at MAX_ARCHIVE_BYTES and
   *    then scan the head for unclosed ``` fences and unclosed <details> tags,
   *    emitting the minimum set of closers needed before the elision banner.
   */
  private truncateMarkdownSafely(markdown: string): string {
    const totalBytes = markdown.length;
    const elisionBanner =
      `\n\n---\n> **Archive truncated** — rendered output exceeded ` +
      `${String(MAX_ARCHIVE_BYTES)} bytes. ` +
      `${String(totalBytes - MAX_ARCHIVE_BYTES)} bytes elided.\n`;

    // Step 1: snap to the last top-level block boundary in the head.
    const SEPARATOR = '\n---\n';
    const head = markdown.slice(0, MAX_ARCHIVE_BYTES);
    const lastSepIdx = head.lastIndexOf(SEPARATOR);
    if (lastSepIdx !== -1) {
      // Include the separator itself so the document boundary is clean.
      return head.slice(0, lastSepIdx + SEPARATOR.length) + elisionBanner;
    }

    // Step 2: no separator — slice at cap and repair open fences/details.
    const closers = this.buildMarkdownClosers(head);
    return head + closers + elisionBanner;
  }

  /**
   * Scan a markdown string and return the minimum set of closing tokens needed
   * to balance any open ``` fences and unclosed <details> blocks.
   * Returned string is empty when the document head is already balanced.
   */
  private buildMarkdownClosers(head: string): string {
    const lines = head.split('\n');
    let openFence: string | undefined;
    let openDetailsCount = 0;
    const closers: string[] = [];

    for (const line of lines) {
      const trimmed = line.trimStart();

      // Track ``` / ~~~ fences (code blocks).
      // A fence opens when a line starts with 3+ backticks or tildes and no
      // open fence is active.  It closes when the same (or longer) sequence
      // appears on its own line.
      if (!openFence) {
        const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
        if (fenceMatch) {
          openFence = fenceMatch[1];
        }
      } else {
        const closeMatch = /^(`{3,}|~{3,})\s*$/.exec(trimmed);
        if (closeMatch?.[1] !== undefined && closeMatch[1].length >= openFence.length) {
          openFence = undefined;
        }
      }

      // Track <details> / </details> nesting (only outside code fences).
      if (!openFence) {
        if (/<details(\s[^>]*)?>/.test(trimmed)) openDetailsCount++;
        if (trimmed.includes('</details>') && openDetailsCount > 0) openDetailsCount--;
      }
    }

    // Emit closers in reverse nesting order: close fence first, then details.
    if (openFence) closers.push('\n```');
    for (let i = 0; i < openDetailsCount; i++) {
      closers.push('\n</details>');
    }
    return closers.join('');
  }
}
