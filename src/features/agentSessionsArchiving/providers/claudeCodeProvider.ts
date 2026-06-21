import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import type { SessionFile, SessionProvider, WatchPattern } from '../types';
import { getFileTimes } from './providerUtils';

/**
 * H-12 / B-04: Encode a workspace root path as the Claude Code project directory name.
 *
 * Claude Code's actual on-disk encoding replaces EVERY non-alphanumeric character
 * with '-' (verified on macOS: '/Users/.../api.icgene.com' → '-Users-...-api-icgene-com').
 * This subsumes path separators (/ \), the Windows drive colon (:), dots, spaces,
 * and any other punctuation so that dotted-segment paths (e.g. 'api.icgene.com')
 * resolve to the correct directory instead of a non-existent one.
 */
function encodeProjectDirName(workspaceRootPath: string): string {
  return workspaceRootPath.replace(/[^a-zA-Z0-9]/g, '-');
}

export class ClaudeCodeProvider implements SessionProvider {
  public readonly name = 'claude-code';
  public readonly displayName = 'Claude Code';

  public getWatchPatterns(workspaceRootPath: string): WatchPattern[] {
    const projectDirName = encodeProjectDirName(workspaceRootPath);
    const baseUri = vscode.Uri.file(
      path.join(os.homedir(), '.claude', 'projects', projectDirName)
    );
    // H-08: collapse the three per-pattern watchers into one recursive glob so
    // OS watch handles per provider are minimised.  A single '**/*' under the
    // project dir matches:
    //   *.jsonl              (root session files)
    //   */subagents/*.jsonl  (subagent transcripts)
    //   */tool-results/*     (tool-result files, incl. non-.jsonl)
    // The shared debounced callback in SessionFileWatcher already coalesces
    // rapid change events, so change-detection semantics are unchanged.
    return [{ baseUri, glob: '**/*' }];
  }

  public async findSessions(workspaceRootPath: string): Promise<SessionFile[]> {
    const projectDirName = encodeProjectDirName(workspaceRootPath);
    const projectUri = vscode.Uri.file(
      path.join(os.homedir(), '.claude', 'projects', projectDirName)
    );

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(projectUri);
    } catch {
      return [];
    }

    const results: SessionFile[] = [];
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File || !name.endsWith('.jsonl')) {
        continue;
      }
      const session = await this.toSessionFile(projectUri, name);
      if (session) {
        results.push(session);
      }
    }
    return results;
  }

  private async toSessionFile(
    dirUri: vscode.Uri,
    name: string
  ): Promise<SessionFile | undefined> {
    const uri = vscode.Uri.joinPath(dirUri, name);
    const times = await getFileTimes(uri);
    if (times === undefined) {
      return undefined;
    }
    const sessionId = path.parse(name).name;
    const companionDirUri = vscode.Uri.file(
      path.join(path.dirname(uri.fsPath), sessionId)
    );
    const compositeMtime = await this.computeCompositeMtime(times.mtime, companionDirUri);
    return {
      uri,
      providerName: this.name,
      archiveName: `claude-code-${sessionId}`,
      displayName: `Claude Code ${name}`,
      mtime: times.mtime,
      compositeMtime,
      ctime: times.ctime,
      extension: path.extname(name) || '',
    };
  }

  /**
   * Build a compound fingerprint from the companion tree.
   *
   * Fingerprint: "mainMtime:maxCompanionFileMtime:totalSize:fileCount"
   *
   * - mainMtime             — mtime of the main .jsonl (in-place edit detection)
   * - maxCompanionFileMtime — maximum mtime over all companion files (detects in-place
   *                           appends to subagent transcripts even when the parent
   *                           directory mtime is unchanged)
   * - totalSize             — sum of file sizes across all companion files (catches
   *                           in-place rewrites on filesystems with 1s mtime granularity
   *                           where the mtime does not advance within the same second)
   * - fileCount             — total count of companion files (catches same-tick add/remove
   *                           when both mtime and size are unchanged)
   *
   * Per-file stats are collected with bounded-concurrency Promise.all over each
   * subdir's listing, replacing the former directory-level stat that could not detect
   * in-place content changes.
   *
   * When the companion dir does not exist, returns a fingerprint of just the main mtime so
   * normal (no-companion) sessions still advance when the main file changes.
   */
  private async computeCompositeMtime(
    mainMtime: number,
    companionDirUri: vscode.Uri
  ): Promise<string> {
    let topEntries: [string, vscode.FileType][];
    try {
      topEntries = await vscode.workspace.fs.readDirectory(companionDirUri);
    } catch {
      return String(mainMtime);
    }

    let maxCompanionFileMtime = 0;
    let totalSize = 0;
    let fileCount = 0;

    for (const [entryName, entryType] of topEntries) {
      if (
        entryType !== vscode.FileType.Directory ||
        (entryName !== 'subagents' && entryName !== 'tool-results')
      ) {
        continue;
      }
      const subdirUri = vscode.Uri.joinPath(companionDirUri, entryName);

      let subEntries: [string, vscode.FileType][];
      try {
        subEntries = await vscode.workspace.fs.readDirectory(subdirUri);
      } catch {
        continue;
      }

      // B-02: stat every companion file in parallel to fold mtime+size into the
      // fingerprint — directory mtime alone does not advance on in-place writes.
      const fileEntries = subEntries.filter(([, ft]) => ft === vscode.FileType.File);
      fileCount += fileEntries.length;

      const stats = await Promise.all(
        fileEntries.map(async ([name]) => {
          const fileUri = vscode.Uri.joinPath(subdirUri, name);
          try {
            return await vscode.workspace.fs.stat(fileUri);
          } catch {
            return undefined;
          }
        })
      );

      for (const stat of stats) {
        if (stat === undefined) continue;
        if (stat.mtime > maxCompanionFileMtime) maxCompanionFileMtime = stat.mtime;
        totalSize += stat.size;
      }
    }

    return `${String(mainMtime)}:${String(maxCompanionFileMtime)}:${String(totalSize)}:${String(fileCount)}`;
  }
}
