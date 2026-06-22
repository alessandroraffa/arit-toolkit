/**
 * OpenCode session provider.
 *
 * Two-tier failure taxonomy:
 *   Tier 1 — node:sqlite absent: sqliteAvailable = false; one deduped info
 *             notification; contributes zero sessions.
 *   Tier 2 — store present (exists on disk) but unopenable (locked/corrupt/
 *             permission-denied): per-store throttled user-visible warning;
 *             zero sessions for that store. ENOENT (file absent) is a silent
 *             no-op — distinct from Tier-2 (see F8/AC-8).
 *
 * Out-of-scope detect-and-signal: legacy flat-JSON layout present → one
 *   deduped notification, distinct from Tier-1 and Tier-2.
 *
 * Schema-discovery findings (increment-1):
 *   - Compaction: session-level summary_x/time_compacting only; no per-event
 *     compaction message/part in available store. compactionSummaries = [].
 *   - Windows store path: os.homedir() on Windows returns %USERPROFILE%, so
 *     the resolved path is %USERPROFILE%\.local\share\opencode — the correct
 *     OpenCode CLI store path. The desktop app's %LOCALAPPDATA% store is
 *     intentionally out of scope. Provider degrades to absent-store no-op
 *     when the path does not exist.
 *   - Snapshot isolation confirmed: concurrent writes blocked while deferred
 *     read transaction is open under node:sqlite binding on Node 22.22.
 *   - node:sqlite readOnly: true enforces full SQL-level read-only (exec INSERT
 *     throws "attempt to write a readonly database"); DB file byte-unchanged
 *     after any read cycle (AC-7 confirmed by test).
 */
import type { DatabaseSync } from 'node:sqlite';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { Logger } from '../../../core/logger';
import type { SessionFile, SessionProvider, WatchPattern } from '../types';
import {
  sqliteAvailable,
  openDb,
  closeDb,
  getAllSessionRows,
  getMessagesForSession,
  getPartsForMessage,
  readSessionWithTransaction,
  materializeSession,
} from './openCodeAdapter';
import type { SessionRow } from './openCodeAdapter';

/**
 * Resolve the default OpenCode store directory.
 * On Windows, os.homedir() returns %USERPROFILE%, so the result is
 * %USERPROFILE%\.local\share\opencode — the correct OpenCode CLI path.
 */
function resolveDefaultStoreDir(): string {
  return process.env.XDG_DATA_HOME
    ? path.join(process.env.XDG_DATA_HOME, 'opencode')
    : path.join(os.homedir(), '.local', 'share', 'opencode');
}

function sanitizeSessionId(id: string): string | undefined {
  const sanitized = id.replace(/[^A-Za-z0-9._-]/g, '-').substring(0, 200);
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    return undefined;
  }
  return sanitized;
}

function normalizeDirPath(p: string): string {
  let normalized = p;
  if (process.platform === 'darwin' || process.platform === 'win32') {
    normalized = normalized.toLowerCase();
  }
  normalized = normalized.replace(/\\/g, '/');
  normalized = normalized.replace(/\/+$/, '');
  return normalized;
}

/**
 * Determine if a thrown error from openDb is an ENOENT / file-not-found error
 * (silent no-op) vs a present-but-unopenable store (Tier-2 diagnostic).
 */
function isAbsentStoreError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  // node:sqlite surfaces SQLITE_CANTOPEN with "no such file or directory" for
  // non-existent paths; Node fs errors use ENOENT. Both mean the file is absent.
  return msg.includes('enoent') || msg.includes('no such file or directory');
}

export class OpenCodeProvider implements SessionProvider {
  public readonly name = 'open-code';
  public readonly displayName = 'OpenCode';

  private _tier1SignalEmitted = false;
  private _outOfScopeSignalEmitted = false;
  // Throttle Tier-2 user-visible warnings to once per store path per session
  private readonly _tier2WarnedPaths = new Set<string>();

  constructor(private readonly logger: Logger) {}

  public async resolveStores(): Promise<string[]> {
    const envDb = process.env.OPENCODE_DB;
    if (envDb) {
      return [envDb];
    }
    const storeDir = resolveDefaultStoreDir();
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(storeDir));
    } catch {
      return [];
    }
    const DB_PATTERN = /^opencode(-[a-z0-9]+)?\.db$/i;
    return entries
      .filter(([name, type]) => type === vscode.FileType.File && DB_PATTERN.test(name))
      .map(([name]) => path.join(storeDir, name));
  }

  private async detectOutOfScope(storeDir: string): Promise<boolean> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(storeDir));
    } catch {
      return false;
    }
    const hasAnyEntry = entries.length > 0;
    const hasDbFile = entries.some(
      ([name, type]) => type === vscode.FileType.File && name.endsWith('.db')
    );
    return hasAnyEntry && !hasDbFile;
  }

  private emitTier1Signal(): void {
    if (this._tier1SignalEmitted) return;
    const msg =
      'OpenCode session archiving requires a newer VS Code runtime (node:sqlite absent); other archiving is unaffected';
    this.logger.info(msg);
    void vscode.window.showInformationMessage(msg);
    this._tier1SignalEmitted = true;
  }

  private emitOutOfScopeSignal(storeDir: string): void {
    if (this._outOfScopeSignalEmitted) return;
    const msg = `OpenCode store at ${storeDir} uses an unsupported layout; skipping`;
    this.logger.warn(msg);
    void vscode.window.showInformationMessage(msg);
    this._outOfScopeSignalEmitted = true;
  }

  /**
   * Emit a Tier-2 user-visible warning for a store that is present on disk but
   * cannot be opened (locked/corrupt/permission-denied). Throttled per store path
   * per session — fires at most once per path to avoid notification spam.
   */
  private emitTier2Signal(storePath: string, err: unknown): void {
    const logMsg = `OpenCode: store at ${storePath} could not be opened — ${String(err)}`;
    this.logger.warn(logMsg);
    if (!this._tier2WarnedPaths.has(storePath)) {
      this._tier2WarnedPaths.add(storePath);
      const uiMsg = `OpenCode: could not open session store at ${storePath} (locked, corrupt, or permission denied); archiving skipped for this store`;
      void vscode.window.showWarningMessage(uiMsg);
    }
  }

  public async findSessions(workspaceRootPath: string): Promise<SessionFile[]> {
    if (!sqliteAvailable) {
      this.emitTier1Signal();
      return [];
    }

    const storePaths = await this.resolveStores();

    if (storePaths.length === 0) {
      const storeDir = resolveDefaultStoreDir();
      if (await this.detectOutOfScope(storeDir)) {
        this.emitOutOfScopeSignal(storeDir);
      }
      return [];
    }

    let workspaceNorm: string;
    try {
      workspaceNorm = normalizeDirPath(fs.realpathSync(workspaceRootPath));
    } catch {
      workspaceNorm = normalizeDirPath(workspaceRootPath);
    }

    const results: SessionFile[] = [];

    for (const storePath of storePaths) {
      let db: DatabaseSync | undefined;
      try {
        db = openDb(storePath);
        const allRows = getAllSessionRows(db);

        for (const row of allRows) {
          const session = this.tryBuildSessionFile(db, row, workspaceNorm);
          if (session) {
            results.push(session);
          }
        }
      } catch (err) {
        if (isAbsentStoreError(err)) {
          // Store file does not exist — silent no-op (AC-8/SPEC-003 §session-discovery §2)
          this.logger.debug(
            `OpenCode: store at ${storePath} not found — skipping silently`
          );
        } else {
          // Store exists but cannot be opened — Tier-2 throttled user-visible diagnostic
          this.emitTier2Signal(storePath, err);
        }
      } finally {
        if (db) {
          closeDb(db);
        }
      }
    }

    return results;
  }

  private tryBuildSessionFile(
    db: DatabaseSync,
    row: SessionRow,
    workspaceNorm: string
  ): SessionFile | undefined {
    const dir = row.directory;

    // Absolute-directory guard: skip relative/empty directories
    if (!dir || !path.isAbsolute(dir)) {
      this.logger.debug(
        `OpenCode: skipping session ${row.id} — directory "${dir}" is relative or empty`
      );
      return undefined;
    }

    let dirNorm: string;
    try {
      dirNorm = normalizeDirPath(fs.realpathSync(dir));
    } catch {
      this.logger.debug(
        `OpenCode: skipping session ${row.id} — could not realpath directory "${dir}"`
      );
      return undefined;
    }

    // Exact match only — no prefix/nested match
    if (dirNorm !== workspaceNorm) {
      return undefined;
    }

    const sanitized = sanitizeSessionId(row.id);
    if (!sanitized) {
      this.logger.warn(`OpenCode: skipping session with unsanitizable id "${row.id}"`);
      return undefined;
    }

    const { fingerprint, content } = readSessionWithTransaction(db, () => {
      const msgs = getMessagesForSession(db, row.id);
      const partCount = msgs.reduce((n, m) => n + getPartsForMessage(db, m.id).length, 0);
      const fp = `${String(row.time_updated ?? 0)}:${String(msgs.length)}:${String(partCount)}`;
      const c = materializeSession(db, row, msgs);
      return { fingerprint: fp, content: c };
    });

    const capturedContent = content;

    return {
      providerName: this.name,
      archiveName: `open-code-${sanitized}`,
      displayName: `OpenCode ${row.title ?? row.id}`,
      readContent: (): Promise<string> => Promise.resolve(capturedContent),
      compositeMtime: fingerprint,
      ctime: row.time_created ?? 0,
      mtime: row.time_updated ?? row.time_created ?? 0,
      extension: '',
    };
  }

  public getWatchPatterns(_workspaceRootPath: string): WatchPattern[] {
    const envDb = process.env.OPENCODE_DB;
    if (envDb) {
      // OPENCODE_DB set: watch the exact file (plus WAL) by basename in its directory
      const storeDir = path.dirname(envDb);
      const baseName = path.basename(envDb);
      const baseUri = vscode.Uri.file(storeDir);
      return [
        { baseUri, glob: baseName },
        { baseUri, glob: `${baseName}-wal` },
      ];
    }
    // Default discovery: channel variants (opencode*.db) match the same pattern
    // used by resolveStores — any opencode*.db file plus its WAL
    const storeDir = resolveDefaultStoreDir();
    const baseUri = vscode.Uri.file(storeDir);
    return [
      { baseUri, glob: 'opencode*.db' },
      { baseUri, glob: 'opencode*.db-wal' },
    ];
  }
}
