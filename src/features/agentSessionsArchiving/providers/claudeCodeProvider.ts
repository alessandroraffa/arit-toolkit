import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import type { SessionFile, SessionProvider, WatchPattern } from '../types';
import { getFileTimes } from './providerUtils';

export class ClaudeCodeProvider implements SessionProvider {
  public readonly name = 'claude-code';
  public readonly displayName = 'Claude Code';

  public getWatchPatterns(workspaceRootPath: string): WatchPattern[] {
    const projectDirName = workspaceRootPath.replaceAll('/', '-');
    const baseUri = vscode.Uri.file(`${os.homedir()}/.claude/projects/${projectDirName}`);
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
    const projectDirName = workspaceRootPath.replaceAll('/', '-');
    const projectUri = vscode.Uri.file(
      `${os.homedir()}/.claude/projects/${projectDirName}`
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
   * Build a compound fingerprint from the companion tree without per-file stat walks.
   *
   * The fingerprint is a stable string: "mainMtime:subagentsDirMtime:toolResultsDirMtime:fileCount"
   *
   * - mainMtime       — mtime of the main .jsonl (in-place edit detection)
   * - subagentsDirMtime   — mtime of the subagents/ directory itself (advances on add/delete)
   * - toolResultsDirMtime — mtime of the tool-results/ directory itself (advances on add/delete)
   * - fileCount       — total count of entries across both subdirs (catches same-tick mtime collisions)
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

    let subagentsDirMtime = 0;
    let toolResultsDirMtime = 0;
    let fileCount = 0;

    for (const [entryName, entryType] of topEntries) {
      if (
        entryType !== vscode.FileType.Directory ||
        (entryName !== 'subagents' && entryName !== 'tool-results')
      ) {
        continue;
      }
      const subdirUri = vscode.Uri.joinPath(companionDirUri, entryName);

      // Use the subdirectory's own mtime as the primary change signal.
      // A child add or delete advances the directory mtime on most filesystems.
      let subdirMtime = 0;
      try {
        const subdirStat = await vscode.workspace.fs.stat(subdirUri);
        subdirMtime = subdirStat.mtime;
      } catch {
        // Subdir not readable — leave mtime 0 (will differ from any real value)
      }

      // Count entries in this subdir to catch same-tick mtime collisions.
      let subdirCount = 0;
      try {
        const subEntries = await vscode.workspace.fs.readDirectory(subdirUri);
        subdirCount = subEntries.length;
      } catch {
        // Ignore
      }

      fileCount += subdirCount;

      if (entryName === 'subagents') {
        subagentsDirMtime = subdirMtime;
      } else {
        toolResultsDirMtime = subdirMtime;
      }
    }

    return `${String(mainMtime)}:${String(subagentsDirMtime)}:${String(toolResultsDirMtime)}:${String(fileCount)}`;
  }
}
