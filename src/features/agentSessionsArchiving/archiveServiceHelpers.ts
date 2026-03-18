import * as vscode from 'vscode';
import type { Logger } from '../../core/logger';

export interface ArchivedEntry {
  mtime: number;
  archiveFileName: string;
}

export async function moveArchive(
  oldUri: vscode.Uri,
  newUri: vscode.Uri,
  logger: Logger
): Promise<void> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(oldUri);
  } catch {
    logger.debug(`Old archive directory not found, skipping move: ${oldUri.fsPath}`);
    return;
  }

  await ensureDirectory(newUri, logger);
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
  logger.info(`Moved archive from ${oldUri.fsPath} to ${newUri.fsPath}`);
}

export async function deduplicateAndHydrate(
  archiveUri: vscode.Uri,
  lastArchivedMap: Map<string, ArchivedEntry>,
  logger: Logger
): Promise<void> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(archiveUri);
  } catch {
    return;
  }
  const grouped = groupArchiveFiles(entries);
  for (const [archiveName, files] of grouped) {
    if (files.length > 1) {
      await removeDuplicates(archiveUri, files, logger);
    }
    const best = files[0];
    if (best && !lastArchivedMap.has(archiveName)) {
      lastArchivedMap.set(archiveName, { mtime: 0, archiveFileName: best.name });
    }
  }
}

export function groupArchiveFiles(
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

export async function removeDuplicates(
  archiveUri: vscode.Uri,
  files: { ts: string; name: string }[],
  logger: Logger
): Promise<void> {
  files.sort((a, b) => b.ts.localeCompare(a.ts));
  for (let i = 1; i < files.length; i++) {
    const dup = files[i];
    if (dup) {
      await deleteFile(vscode.Uri.joinPath(archiveUri, dup.name), logger);
      logger.info(`Removed duplicate archive: ${dup.name}`);
    }
  }
}

export async function ensureDirectory(uri: vscode.Uri, logger: Logger): Promise<void> {
  try {
    await vscode.workspace.fs.createDirectory(uri);
  } catch (err) {
    logger.debug(`ensureDirectory: ${String(err)}`);
  }
}

export async function deleteFile(uri: vscode.Uri, logger: Logger): Promise<void> {
  try {
    await vscode.workspace.fs.delete(uri);
  } catch (err) {
    logger.debug(`deleteFile: ${String(err)}`);
  }
}
