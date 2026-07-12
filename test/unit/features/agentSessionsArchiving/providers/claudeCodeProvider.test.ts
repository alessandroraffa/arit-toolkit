import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, FileType } from '../../../mocks/vscode';

const { mockReaddirSync } = vi.hoisted(() => ({
  mockReaddirSync: vi.fn(),
}));
vi.mock('node:fs', () => ({
  readdirSync: mockReaddirSync,
}));

import { ClaudeCodeProvider } from '../../../../../src/features/agentSessionsArchiving/providers/claudeCodeProvider';

/** Builds a Dirent-like fixture entry for the mocked readdirSync. */
function claudeDirent(
  name: string,
  opts?: { isDirectory?: boolean; isSymlink?: boolean }
): { name: string; isDirectory: () => boolean; isSymbolicLink: () => boolean } {
  const isDirectory = opts?.isDirectory ?? true;
  const isSymlink = opts?.isSymlink ?? false;
  return {
    name,
    isDirectory: () => isDirectory && !isSymlink,
    isSymbolicLink: () => isSymlink,
  };
}

describe('ClaudeCodeProvider', () => {
  let provider: ClaudeCodeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: a single ~/.claude directory entry, so pre-existing
    // single-directory tests keep passing unchanged.
    mockReaddirSync.mockReturnValue([claudeDirent('.claude')]);
    provider = new ClaudeCodeProvider();
  });

  it('should have correct name and displayName', () => {
    expect(provider.name).toBe('claude-code');
    expect(provider.displayName).toBe('Claude Code');
  });

  it('should find session files in project directory', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['session1.jsonl', FileType.File],
      ['session2.jsonl', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1000, ctime: 900 });

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.archiveName).toBe('claude-code-session1');
    expect(sessions[0]!.extension).toBe('.jsonl');
    expect(sessions[1]!.archiveName).toBe('claude-code-session2');
  });

  it('should return empty array when project directory does not exist', async () => {
    workspace.fs.readDirectory = vi.fn().mockRejectedValue(new Error('not found'));

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(0);
  });

  it('should skip directories', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['subdir', FileType.Directory],
      ['session.jsonl', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 500, ctime: 400 });

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('claude-code-session');
  });

  it('should skip files that fail stat', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['session1.jsonl', FileType.File],
      ['session2.jsonl', FileType.File],
    ]);
    workspace.fs.stat = vi
      .fn()
      .mockResolvedValueOnce({ mtime: 1000, ctime: 900 })
      .mockRejectedValueOnce(new Error('permission denied'));

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('claude-code-session1');
  });

  it('should convert workspace path to project dir name', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);

    await provider.findSessions('/Users/dev/my-project');

    const readDirCall = vi.mocked(workspace.fs.readDirectory).mock.calls[0]!;
    expect(readDirCall[0].fsPath).toContain('-Users-dev-my-project');
  });

  it('should skip non-jsonl files', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([
      ['.DS_Store', FileType.File],
      ['sessions-index.json', FileType.File],
      ['session1.jsonl', FileType.File],
      ['notes.txt', FileType.File],
    ]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1000, ctime: 900 });

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.archiveName).toBe('claude-code-session1');
  });

  it('should set correct displayName', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValue([['abc123.jsonl', FileType.File]]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 100, ctime: 90 });

    const sessions = await provider.findSessions('/workspace');

    expect(sessions[0]!.displayName).toBe('Claude Code abc123.jsonl');
  });

  it('should return watch patterns for project directory', () => {
    const patterns = provider.getWatchPatterns('/Users/dev/my-project');

    // H-08: collapsed to a single recursive glob
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.baseUri.fsPath).toContain('-Users-dev-my-project');
    expect(patterns[0]!.glob).toBe('**/*');
  });

  // H-12 tests: Windows path normalization in projectDirName encoding

  it('H-12: Windows backslash path encodes backslashes to dashes', () => {
    const patterns = provider.getWatchPatterns('C:\\Users\\me\\proj');

    expect(patterns).toHaveLength(1);
    // Backslashes replaced by dashes; colon also replaced
    expect(patterns[0]!.baseUri.fsPath).toContain('C--Users-me-proj');
    expect(patterns[0]!.baseUri.fsPath).not.toContain('\\');
    expect(patterns[0]!.baseUri.fsPath).not.toContain(':');
  });

  it('H-12: mixed separators encode consistently (no raw backslash or colon)', () => {
    const patterns = provider.getWatchPatterns('C:/Users/me/proj');

    expect(patterns).toHaveLength(1);
    const fsPath = patterns[0]!.baseUri.fsPath;
    expect(fsPath).not.toContain('\\');
    expect(fsPath).not.toContain(':');
    // forward-slash and colon both replaced by dashes
    expect(fsPath).toContain('C--Users-me-proj');
  });

  it('H-12: findSessions uses the same encoding as getWatchPatterns', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);

    await provider.findSessions('C:\\Users\\me\\proj');

    const readDirCall = vi.mocked(workspace.fs.readDirectory).mock.calls[0]!;
    // Both must produce the same encoded directory name
    const fsPath = readDirCall[0].fsPath as string;
    expect(fsPath).toContain('C--Users-me-proj');
    expect(fsPath).not.toContain('\\');
    expect(fsPath).not.toContain(':');
  });

  // H-08 tests: collapsed recursive watcher pattern

  it('H-08: getWatchPatterns returns exactly one recursive pattern covering all companion paths', () => {
    const patterns = provider.getWatchPatterns('/workspace/project');

    expect(patterns).toHaveLength(1);
    const glob = patterns[0]!.glob;
    // The single glob must be a recursive catch-all
    expect(glob).toBe('**/*');
  });

  it('H-08: the single pattern base URI targets the project dir', () => {
    const patterns = provider.getWatchPatterns('/home/user/my-proj');

    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.baseUri.fsPath).toContain('-home-user-my-proj');
  });

  // H-04 / B-02 tests: compound fingerprint with per-file mtime+size

  describe('H-04 / B-02: computeCompositeMtime compound fingerprint', () => {
    it('returns a string fingerprint that includes mainMtime when no companion dir exists', async () => {
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValueOnce([['session.jsonl', FileType.File]]) // project dir
        .mockRejectedValue(new Error('not found')); // companion dir absent
      workspace.fs.stat = vi
        .fn()
        .mockResolvedValue({ mtime: 1234, ctime: 1000, size: 0 });

      const sessions = await provider.findSessions('/workspace');

      // No companion dir → fingerprint is just the main mtime as string
      expect(sessions[0]!.compositeMtime).toBe('1234');
    });

    it('fingerprint reflects file count so a same-tick new file changes the fingerprint', async () => {
      // Baseline: subagents/ has 1 file
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValueOnce([['session.jsonl', FileType.File]]) // project dir
        .mockResolvedValueOnce([['subagents', FileType.Directory]]) // companion dir
        .mockResolvedValueOnce([['agent-abc.jsonl', FileType.File]]); // subagents/ listing
      workspace.fs.stat = vi
        .fn()
        .mockResolvedValueOnce({ mtime: 1000, ctime: 900, size: 0 }) // main file stat
        .mockResolvedValueOnce({ mtime: 500, ctime: 400, size: 100 }); // agent-abc.jsonl stat

      const [session1] = await provider.findSessions('/workspace');
      const fp1 = session1!.compositeMtime;

      // Now subagents/ has 2 files (same file mtime — same-tick scenario)
      vi.clearAllMocks();
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValueOnce([['session.jsonl', FileType.File]]) // project dir
        .mockResolvedValueOnce([['subagents', FileType.Directory]]) // companion dir
        .mockResolvedValueOnce([
          ['agent-abc.jsonl', FileType.File],
          ['agent-def.jsonl', FileType.File],
        ]); // subagents/ listing — 2 files
      workspace.fs.stat = vi
        .fn()
        .mockResolvedValueOnce({ mtime: 1000, ctime: 900, size: 0 }) // main file stat
        .mockResolvedValueOnce({ mtime: 500, ctime: 400, size: 100 }) // agent-abc.jsonl stat
        .mockResolvedValueOnce({ mtime: 500, ctime: 400, size: 200 }); // agent-def.jsonl stat

      const [session2] = await provider.findSessions('/workspace');
      const fp2 = session2!.compositeMtime;

      // File count (and total size) changed → fingerprints differ
      expect(fp1).toBeDefined();
      expect(fp2).toBeDefined();
      expect(fp1).not.toBe(fp2);
    });

    it('fingerprint changes when a file is deleted (file count decreases)', async () => {
      // Start with 2 files in subagents/
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValueOnce([['session.jsonl', FileType.File]]) // project dir
        .mockResolvedValueOnce([['subagents', FileType.Directory]]) // companion dir
        .mockResolvedValueOnce([
          ['agent-abc.jsonl', FileType.File],
          ['agent-def.jsonl', FileType.File],
        ]); // subagents/ listing
      workspace.fs.stat = vi
        .fn()
        .mockResolvedValueOnce({ mtime: 1000, ctime: 900, size: 0 })
        .mockResolvedValueOnce({ mtime: 800, ctime: 700, size: 50 })
        .mockResolvedValueOnce({ mtime: 800, ctime: 700, size: 60 });

      const [before] = await provider.findSessions('/workspace');
      const fpBefore = before!.compositeMtime;

      // Delete one file — count drops
      vi.clearAllMocks();
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValueOnce([['session.jsonl', FileType.File]]) // project dir
        .mockResolvedValueOnce([['subagents', FileType.Directory]]) // companion dir
        .mockResolvedValueOnce([['agent-abc.jsonl', FileType.File]]); // 1 file now
      workspace.fs.stat = vi
        .fn()
        .mockResolvedValueOnce({ mtime: 1000, ctime: 900, size: 0 })
        .mockResolvedValueOnce({ mtime: 800, ctime: 700, size: 50 });

      const [after] = await provider.findSessions('/workspace');
      const fpAfter = after!.compositeMtime;

      expect(fpBefore).not.toBe(fpAfter);
    });

    it('B-02: appending to an existing subagent transcript changes the fingerprint', async () => {
      // Same filename, same file count, but size grew (append) — directory mtime unchanged.
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValueOnce([['session.jsonl', FileType.File]]) // project dir
        .mockResolvedValueOnce([['subagents', FileType.Directory]]) // companion dir
        .mockResolvedValueOnce([['agent-abc.jsonl', FileType.File]]); // subagents/ listing
      workspace.fs.stat = vi
        .fn()
        .mockResolvedValueOnce({ mtime: 1000, ctime: 900, size: 0 }) // main file stat
        .mockResolvedValueOnce({ mtime: 500, ctime: 400, size: 1000 }); // agent-abc.jsonl — 1KB

      const [s1] = await provider.findSessions('/workspace');
      const fp1 = s1!.compositeMtime;

      // Same filename, same mtime (coarse granularity), but file grew to 2KB
      vi.clearAllMocks();
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValueOnce([['session.jsonl', FileType.File]]) // project dir
        .mockResolvedValueOnce([['subagents', FileType.Directory]]) // companion dir
        .mockResolvedValueOnce([['agent-abc.jsonl', FileType.File]]); // same file
      workspace.fs.stat = vi
        .fn()
        .mockResolvedValueOnce({ mtime: 1000, ctime: 900, size: 0 }) // main file stat
        .mockResolvedValueOnce({ mtime: 500, ctime: 400, size: 2000 }); // agent-abc.jsonl — 2KB

      const [s2] = await provider.findSessions('/workspace');
      const fp2 = s2!.compositeMtime;

      // Size changed → fingerprints differ (re-archive triggered)
      expect(fp1).not.toBe(fp2);
    });

    it('B-02: appending bumps file mtime → fingerprint changes via maxCompanionFileMtime', async () => {
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValueOnce([['session.jsonl', FileType.File]])
        .mockResolvedValueOnce([['subagents', FileType.Directory]])
        .mockResolvedValueOnce([['agent-abc.jsonl', FileType.File]]);
      workspace.fs.stat = vi
        .fn()
        .mockResolvedValueOnce({ mtime: 1000, ctime: 900, size: 0 })
        .mockResolvedValueOnce({ mtime: 500, ctime: 400, size: 100 });

      const [s1] = await provider.findSessions('/workspace');
      const fp1 = s1!.compositeMtime;

      vi.clearAllMocks();
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValueOnce([['session.jsonl', FileType.File]])
        .mockResolvedValueOnce([['subagents', FileType.Directory]])
        .mockResolvedValueOnce([['agent-abc.jsonl', FileType.File]]);
      // File mtime advanced (new second boundary)
      workspace.fs.stat = vi
        .fn()
        .mockResolvedValueOnce({ mtime: 1000, ctime: 900, size: 0 })
        .mockResolvedValueOnce({ mtime: 600, ctime: 400, size: 100 }); // mtime bumped

      const [s2] = await provider.findSessions('/workspace');
      const fp2 = s2!.compositeMtime;

      expect(fp1).not.toBe(fp2);
    });

    it('B-02: unchanged tree produces a stable fingerprint', async () => {
      const setupMocks = () => {
        workspace.fs.readDirectory = vi
          .fn()
          .mockResolvedValueOnce([['session.jsonl', FileType.File]])
          .mockResolvedValueOnce([['subagents', FileType.Directory]])
          .mockResolvedValueOnce([['agent-abc.jsonl', FileType.File]]);
        workspace.fs.stat = vi
          .fn()
          .mockResolvedValueOnce({ mtime: 1000, ctime: 900, size: 0 })
          .mockResolvedValueOnce({ mtime: 500, ctime: 400, size: 1024 });
      };

      setupMocks();
      const [s1] = await provider.findSessions('/workspace');

      setupMocks();
      const [s2] = await provider.findSessions('/workspace');

      expect(s1!.compositeMtime).toBe(s2!.compositeMtime);
    });

    it('stats every companion file and includes both subdirs in the fingerprint', async () => {
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValueOnce([['session.jsonl', FileType.File]]) // project dir
        .mockResolvedValueOnce([
          ['subagents', FileType.Directory],
          ['tool-results', FileType.Directory],
        ]) // companion dir
        .mockResolvedValueOnce([
          ['agent-a.jsonl', FileType.File],
          ['agent-b.jsonl', FileType.File],
          ['agent-c.jsonl', FileType.File],
        ]) // subagents/ listing (3 files)
        .mockResolvedValueOnce([
          ['toolu_1.txt', FileType.File],
          ['toolu_2.txt', FileType.File],
        ]); // tool-results/ listing (2 files)

      const statCalls: string[] = [];
      workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
        statCalls.push(uri.fsPath);
        return Promise.resolve({ mtime: 100, ctime: 50, size: 512 });
      });

      const sessions = await provider.findSessions('/workspace');

      expect(sessions).toHaveLength(1);
      // stat calls: 1 for the main .jsonl file + 3 for subagent files + 2 for tool-result files
      // = 6 total (per-file stats, not per-dir)
      const companionFileStats = statCalls.filter(
        (p) => p.includes('agent-') || p.includes('toolu_')
      );
      expect(companionFileStats).toHaveLength(5); // all 5 companion files stat'd
      // fileCount in fingerprint reflects both subdirs: 3 + 2 = 5
      expect(sessions[0]!.compositeMtime).toContain(':5');
    });
  });

  // B-04 tests: encodeProjectDirName replaces ALL non-alphanumerics

  describe('B-04: encodeProjectDirName replaces all non-alphanumeric chars', () => {
    // Helper: extract just the encoded project-dir-name segment (last path component).
    // The full fsPath is ~/.claude/projects/<encoded-name>, so we isolate the encoded
    // name to avoid false positives from dots in the homedir path (e.g. ~/.claude).
    function projectDirSegment(fsPath: string): string {
      return fsPath.split('/').at(-1) ?? fsPath;
    }

    it('B-04: dotted path segment encodes dots to dashes', async () => {
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);

      await provider.findSessions('/Users/me/api.icgene.com');

      const readDirCall = vi.mocked(workspace.fs.readDirectory).mock.calls[0]!;
      const encoded = projectDirSegment(readDirCall[0].fsPath as string);
      // Dots must be replaced with dashes, matching Claude Code's on-disk encoding
      expect(encoded).toBe('-Users-me-api-icgene-com');
      expect(encoded).not.toContain('.');
    });

    it('B-04: path with spaces encodes spaces to dashes', async () => {
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);

      await provider.findSessions('/Users/my name/proj');

      const readDirCall = vi.mocked(workspace.fs.readDirectory).mock.calls[0]!;
      const encoded = projectDirSegment(readDirCall[0].fsPath as string);
      expect(encoded).toBe('-Users-my-name-proj');
      expect(encoded).not.toContain(' ');
    });

    it('B-04: windows dotted path encodes all non-alphanumerics to dashes', async () => {
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);

      await provider.findSessions('C:\\Users\\me\\api.example.com');

      const readDirCall = vi.mocked(workspace.fs.readDirectory).mock.calls[0]!;
      const encoded = projectDirSegment(readDirCall[0].fsPath as string);
      expect(encoded).toBe('C--Users-me-api-example-com');
      expect(encoded).not.toContain('.');
      expect(encoded).not.toContain('\\');
      expect(encoded).not.toContain(':');
    });
  });

  // Activity 4: session discovery across every $HOME/.claude* config directory

  describe('multi-directory Claude Code config discovery (Activity 4)', () => {
    it('findSessions reads projects/<encoded> under .claude, .claude-personal, and .claude-work only, in lexicographic order', async () => {
      mockReaddirSync.mockReturnValue([
        claudeDirent('.claude'),
        claudeDirent('.claude-work'),
        claudeDirent('.claude-personal'),
        claudeDirent('.claude.json', { isDirectory: false }),
        claudeDirent('.claude-backup.tar', { isDirectory: false }),
        claudeDirent('.clauderc'),
      ]);
      const readDirCalls: string[] = [];
      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          readDirCalls.push(uri.fsPath);
          return Promise.resolve([]);
        });

      await provider.findSessions('/my/project');

      expect(readDirCalls).toHaveLength(3);
      const configDirsInOrder = readDirCalls.map(
        (p) => /\/(\.claude[^/]*)\/projects\//.exec(p)?.[1] ?? p
      );
      expect(configDirsInOrder).toEqual(['.claude', '.claude-personal', '.claude-work']);
    });

    it('returns the union of sessions found under ~/.claude and ~/.claude-work project directories', async () => {
      mockReaddirSync.mockReturnValue([
        claudeDirent('.claude'),
        claudeDirent('.claude-work'),
      ]);
      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          if (uri.fsPath.includes('/.claude-work/projects/')) {
            return Promise.resolve([['session-b.jsonl', FileType.File]]);
          }
          if (uri.fsPath.includes('/.claude/projects/')) {
            return Promise.resolve([['session-a.jsonl', FileType.File]]);
          }
          return Promise.resolve([]);
        });
      workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1000, ctime: 900 });

      const sessions = await provider.findSessions('/my/project');

      expect(sessions).toHaveLength(2);
      const names = sessions.map((s) => s.archiveName).sort();
      expect(names).toEqual(['claude-code-session-a', 'claude-code-session-b']);
    });

    it('falls back to ~/.claude alone when readdirSync throws', async () => {
      mockReaddirSync.mockImplementation(() => {
        throw new Error('EPERM: operation not permitted');
      });
      const readDirCalls: string[] = [];
      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          readDirCalls.push(uri.fsPath);
          return Promise.resolve([]);
        });

      await provider.findSessions('/my/project');

      expect(readDirCalls).toHaveLength(1);
      expect(readDirCalls[0]).toContain('/.claude/projects/');

      const patterns = provider.getWatchPatterns('/my/project');
      expect(patterns).toHaveLength(1);
      expect(patterns[0]!.baseUri.fsPath).toContain('/.claude/projects/');
    });

    it('getWatchPatterns returns one WatchPattern per config directory, each ending in <configDir>/projects/<encoded>', () => {
      mockReaddirSync.mockReturnValue([
        claudeDirent('.claude'),
        claudeDirent('.claude-work'),
      ]);

      const patterns = provider.getWatchPatterns('/Users/dev/my-project');

      expect(patterns).toHaveLength(2);
      expect(patterns.every((p) => p.glob === '**/*')).toBe(true);
      const baseUriPaths = patterns.map((p) => p.baseUri.fsPath).sort();
      expect(
        baseUriPaths[0]!.endsWith('.claude-work/projects/-Users-dev-my-project')
      ).toBe(true);
      expect(baseUriPaths[1]!.endsWith('.claude/projects/-Users-dev-my-project')).toBe(
        true
      );
    });

    it('a symlinked ~/.claude is still discovered; a symlinked .claude-* sibling is excluded', async () => {
      mockReaddirSync.mockReturnValue([
        claudeDirent('.claude', { isDirectory: false, isSymlink: true }),
        claudeDirent('.claude-work', { isDirectory: false, isSymlink: true }),
      ]);
      // Only the top-level project-dir listing calls are counted here; the
      // companion-dir lookup that toSessionFile()/computeCompositeMtime()
      // performs for the discovered session is a deeper, different path and
      // must not be mistaken for a second config directory being probed.
      const topLevelProjectDirCalls: string[] = [];
      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          if (uri.fsPath.endsWith('/.claude/projects/-my-project')) {
            topLevelProjectDirCalls.push(uri.fsPath);
            return Promise.resolve([['session.jsonl', FileType.File]]);
          }
          if (uri.fsPath.endsWith('/.claude-work/projects/-my-project')) {
            topLevelProjectDirCalls.push(uri.fsPath);
            return Promise.resolve([]);
          }
          // Companion-dir lookup (subagents/tool-results) for the discovered
          // session: report absent, and do not count it as a config-dir probe.
          return Promise.reject(new Error('not found'));
        });
      workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1000, ctime: 900 });

      const sessions = await provider.findSessions('/my/project');

      expect(topLevelProjectDirCalls).toHaveLength(1);
      expect(topLevelProjectDirCalls[0]).toContain('/.claude/projects/');
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.archiveName).toBe('claude-code-session');

      const patterns = provider.getWatchPatterns('/my/project');
      expect(patterns).toHaveLength(1);
      expect(patterns[0]!.baseUri.fsPath).toContain('/.claude/projects/');
    });
  });
});
