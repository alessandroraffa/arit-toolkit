import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import { Logger } from '../../core/logger';
import { SKILL_EDITS_DIR_NAME } from './index';
import type { CompanionEntry } from './bundle';

const SENTINEL_BASENAME = '.pending-failure.json';

export interface PendingFailure {
  reason: 'bundle-missing' | 'repack-io-error' | 'rename-failed';
  message: string;
  timestamp: number;
}

export interface EditSession {
  bundleUri: vscode.Uri;
  tempUri: vscode.Uri;
  document: vscode.TextDocument;
  companions: readonly CompanionEntry[];
  pendingFailure?: PendingFailure;
}

function isFileNotFound(err: unknown): boolean {
  return (err as { code?: string } | undefined)?.code === 'FileNotFound';
}

export class SessionRegistry {
  private readonly _sessions = new Map<string, EditSession>();

  constructor(private readonly _ctx: vscode.ExtensionContext) {}

  public get(bundleFsPath: string): EditSession | undefined {
    return this._sessions.get(bundleFsPath);
  }

  public set(session: EditSession): void {
    this._sessions.set(session.bundleUri.fsPath, session);
  }

  public delete(bundleFsPath: string): void {
    this._sessions.delete(bundleFsPath);
  }

  public entries(): IterableIterator<[string, EditSession]> {
    return this._sessions.entries();
  }

  private sentinelUri(bundleFsPath: string): vscode.Uri {
    const hash = crypto.createHash('sha1').update(bundleFsPath).digest('hex');
    return vscode.Uri.joinPath(
      this._ctx.globalStorageUri,
      SKILL_EDITS_DIR_NAME,
      hash,
      SENTINEL_BASENAME
    );
  }

  public async markFailure(bundleFsPath: string, failure: PendingFailure): Promise<void> {
    const session = this._sessions.get(bundleFsPath);
    if (!session) {
      Logger.getInstance().warn(
        `[SessionRegistry] markFailure: no session for ${bundleFsPath}`
      );
      return;
    }
    session.pendingFailure = failure;
    await vscode.workspace.fs.writeFile(
      this.sentinelUri(bundleFsPath),
      Buffer.from(JSON.stringify({ ...failure, bundleFsPath }), 'utf8')
    );
  }

  public async clearFailure(bundleFsPath: string): Promise<void> {
    const session = this._sessions.get(bundleFsPath);
    if (session?.pendingFailure === undefined) return;
    delete session.pendingFailure;
    try {
      await vscode.workspace.fs.delete(this.sentinelUri(bundleFsPath));
    } catch (err) {
      if (isFileNotFound(err)) return;
      throw err;
    }
  }
}
