import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import { Logger } from '../../core/logger';
import { SKILL_EDITS_DIR_NAME, SKILL_MD_BASENAME } from './index';

const SENTINEL_BASENAME = '.pending-failure.json';

export interface PreservedFailureRecord {
  bundleFsPath: string;
  reason: string;
  message: string;
  timestamp: number;
  preservedTempFilePath: string;
}

export function resolveTempUri(
  bundleUri: vscode.Uri,
  ctx: vscode.ExtensionContext
): vscode.Uri {
  const hash = crypto.createHash('sha1').update(bundleUri.fsPath).digest('hex');
  return vscode.Uri.joinPath(
    ctx.globalStorageUri,
    SKILL_EDITS_DIR_NAME,
    hash,
    SKILL_MD_BASENAME
  );
}

export async function writeTempFile(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}

export async function deleteTempDir(dirUri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.delete(dirUri, { recursive: true });
}

function isFileNotFound(err: unknown): boolean {
  return (err as { code?: string } | undefined)?.code === 'FileNotFound';
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function toRecord(
  parsed: Record<string, unknown>,
  preservedTempFilePath: string
): PreservedFailureRecord {
  return {
    bundleFsPath: asString(parsed.bundleFsPath),
    reason: asString(parsed.reason),
    message: asString(parsed.message),
    timestamp: asNumber(parsed.timestamp),
    preservedTempFilePath,
  };
}

async function sweepEntry(
  skillEditsUri: vscode.Uri,
  entryName: string
): Promise<PreservedFailureRecord | undefined> {
  const entryUri = vscode.Uri.joinPath(skillEditsUri, entryName);
  const sentinelUri = vscode.Uri.joinPath(entryUri, SENTINEL_BASENAME);
  try {
    const bytes = await vscode.workspace.fs.readFile(sentinelUri);
    const parsed = JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<
      string,
      unknown
    >;
    return toRecord(parsed, vscode.Uri.joinPath(entryUri, SKILL_MD_BASENAME).fsPath);
  } catch {
    try {
      await vscode.workspace.fs.delete(entryUri, { recursive: true });
    } catch (delErr) {
      Logger.getInstance().warn(
        `[sweepOrphans] Failed to delete orphan ${entryName}: ${String(delErr)}`
      );
    }
    return undefined;
  }
}

export async function sweepOrphans(
  ctx: vscode.ExtensionContext
): Promise<readonly PreservedFailureRecord[]> {
  const skillEditsUri = vscode.Uri.joinPath(ctx.globalStorageUri, SKILL_EDITS_DIR_NAME);
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(skillEditsUri);
  } catch (err) {
    if (isFileNotFound(err)) return [];
    throw err;
  }
  const preserved: PreservedFailureRecord[] = [];
  for (const [entryName] of entries) {
    const record = await sweepEntry(skillEditsUri, entryName);
    if (record !== undefined) preserved.push(record);
  }
  return preserved;
}
