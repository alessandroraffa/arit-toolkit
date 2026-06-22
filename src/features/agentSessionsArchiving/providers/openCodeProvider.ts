/**
 * OpenCode session provider.
 *
 * Two-tier failure taxonomy:
 *   Tier 1 — node:sqlite absent: sqliteAvailable = false; one deduped info
 *             notification; contributes zero sessions.
 *   Tier 2 — store present but unopenable: per-store warn; zero sessions for
 *             that store. Fires on every cycle (actionable, not a fixed limit).
 *
 * Out-of-scope detect-and-signal: legacy flat-JSON layout present → one
 *   deduped notification, distinct from Tier-1 and Tier-2.
 *
 * Schema-discovery findings (increment-1):
 *   - Compaction: session-level summary_x/time_compacting only; no per-event
 *     compaction message/part in available store. compactionSummaries = [].
 *   - Windows store path TBV (%USERPROFILE%\.local\share\opencode vs
 *     %LOCALAPPDATA%). Provider degrades to absent-store no-op when wrong.
 *   - Snapshot isolation confirmed: concurrent writes blocked while deferred
 *     read transaction is open under node:sqlite binding on Node 22.22.
 *   - node:sqlite readOnly: exec INSERT on readOnly handle does NOT throw —
 *     writes to in-memory overlay; DB file byte-unchanged (AC-7 satisfied).
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

// Windows store path TBV (%USERPROFILE%\.local\share\opencode vs %LOCALAPPDATA%)
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

export class OpenCodeProvider implements SessionProvider {
  public readonly name = 'open-code';
  public readonly displayName = 'OpenCode';

  private _tier1SignalEmitted = false;
  private _outOfScopeSignalEmitted = false;

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
        this.logger.warn(
          `OpenCode: store at ${storePath} could not be opened — ${String(err)}`
        );
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
    const storeDir = envDb ? path.dirname(envDb) : resolveDefaultStoreDir();
    const baseUri = vscode.Uri.file(storeDir);
    return [
      { baseUri, glob: 'opencode.db' },
      { baseUri, glob: 'opencode.db-wal' },
    ];
  }
}
