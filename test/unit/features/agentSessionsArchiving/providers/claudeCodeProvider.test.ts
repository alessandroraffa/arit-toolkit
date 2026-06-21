import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, FileType } from '../../../mocks/vscode';
import { ClaudeCodeProvider } from '../../../../../src/features/agentSessionsArchiving/providers/claudeCodeProvider';

describe('ClaudeCodeProvider', () => {
  let provider: ClaudeCodeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(patterns).toHaveLength(3);
    expect(patterns[0]!.baseUri.fsPath).toContain('-Users-dev-my-project');
    expect(patterns[0]!.glob).toBe('*.jsonl');
    expect(patterns[1]!.glob).toBe('*/subagents/*.jsonl');
    expect(patterns[2]!.glob).toBe('*/tool-results/*');
  });

  // H-04 tests: compound fingerprint replaces scalar max-mtime

  describe('H-04: computeCompositeMtime compound fingerprint', () => {
    it('returns a string fingerprint that includes mainMtime when no companion dir exists', async () => {
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValueOnce([['session.jsonl', FileType.File]]) // project dir
        .mockRejectedValue(new Error('not found')); // companion dir absent
      workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1234, ctime: 1000 });

      const sessions = await provider.findSessions('/workspace');

      // No companion dir → fingerprint is just the main mtime as string
      expect(sessions[0]!.compositeMtime).toBe('1234');
    });

    it('fingerprint reflects file count so a same-mtime new file changes the fingerprint', async () => {
      // Baseline: subagents/ has 1 file, tool-results/ has 0 files
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValueOnce([['session.jsonl', FileType.File]]) // project dir
        .mockResolvedValueOnce([['subagents', FileType.Directory]]) // companion dir
        .mockResolvedValueOnce([['agent-abc.jsonl', FileType.File]]); // subagents/ listing
      workspace.fs.stat = vi
        .fn()
        .mockResolvedValueOnce({ mtime: 1000, ctime: 900 }) // main file stat
        .mockResolvedValueOnce({ mtime: 500, ctime: 400 }); // subagents/ dir stat

      const [session1] = await provider.findSessions('/workspace');
      const fp1 = session1!.compositeMtime;

      // Now subagents/ has 2 files (same subdir mtime — same-tick scenario)
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
        .mockResolvedValueOnce({ mtime: 1000, ctime: 900 }) // main file stat
        .mockResolvedValueOnce({ mtime: 500, ctime: 400 }); // subagents/ dir stat (same mtime!)

      const [session2] = await provider.findSessions('/workspace');
      const fp2 = session2!.compositeMtime;

      // File count changed even though mtime is the same → fingerprints differ
      expect(fp1).toBeDefined();
      expect(fp2).toBeDefined();
      expect(fp1).not.toBe(fp2);
    });

    it('fingerprint changes when a file is deleted (file count decreases) even if max mtime is unchanged', async () => {
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
        .mockResolvedValueOnce({ mtime: 1000, ctime: 900 })
        .mockResolvedValueOnce({ mtime: 800, ctime: 700 });

      const [before] = await provider.findSessions('/workspace');
      const fpBefore = before!.compositeMtime;

      // Delete one file — count drops, subdir mtime stays the same (simulating coarse FS)
      vi.clearAllMocks();
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValueOnce([['session.jsonl', FileType.File]]) // project dir
        .mockResolvedValueOnce([['subagents', FileType.Directory]]) // companion dir
        .mockResolvedValueOnce([['agent-abc.jsonl', FileType.File]]); // 1 file now
      workspace.fs.stat = vi
        .fn()
        .mockResolvedValueOnce({ mtime: 1000, ctime: 900 })
        .mockResolvedValueOnce({ mtime: 800, ctime: 700 }); // same subdir mtime

      const [after] = await provider.findSessions('/workspace');
      const fpAfter = after!.compositeMtime;

      expect(fpBefore).not.toBe(fpAfter);
    });

    it('uses subdir-level stat and does not call per-file stat for companion files', async () => {
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
        return Promise.resolve({ mtime: 100, ctime: 50 });
      });

      const sessions = await provider.findSessions('/workspace');

      expect(sessions).toHaveLength(1);
      // stat calls: 1 for the main .jsonl file, 1 for subagents/ dir, 1 for tool-results/ dir
      // = 3 total; NOT 3+2+2=7 (per-file stats for the 5 companion files)
      const companionFileStat = statCalls.find(
        (p) => p.includes('agent-') || p.includes('toolu_')
      );
      expect(companionFileStat).toBeUndefined(); // no per-file stat calls
      // fileCount in fingerprint reflects both subdirs: 3 + 2 = 5
      expect(sessions[0]!.compositeMtime).toContain(':5');
    });
  });
});
