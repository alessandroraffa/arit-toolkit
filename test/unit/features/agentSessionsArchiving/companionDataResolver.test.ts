import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, FileType, FileSystemError } from '../../mocks/vscode';
import { resolveCompanionData } from '../../../../src/features/agentSessionsArchiving/companionDataResolver';
import { COMPANION_FILE_BYTE_CAP } from '../../../../src/features/agentSessionsArchiving/constants';
import type * as vscode from 'vscode';

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const SESSION_URI = { fsPath: '/home/.claude/projects/proj/abc123.jsonl' } as vscode.Uri;

describe('resolveCompanionData', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
  });

  it('returns empty context when companion directory does not exist', async () => {
    workspace.fs.readDirectory = vi.fn().mockRejectedValue(new Error('not found'));

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(result).toEqual({
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [],
    });
  });

  it('returns empty collections when companion directory exists but is empty', async () => {
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(result.subagentEntries).toHaveLength(0);
    expect(result.toolResultMap.size).toBe(0);
    expect(result.compactionEntries).toHaveLength(0);
  });

  it('returns one subagent entry without meta file when meta is absent', async () => {
    const jsonlContent = '{"type":"human","text":"hello"}\n';
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([['agent-abc123.jsonl', FileType.File]]) // subagents/
      .mockResolvedValueOnce([]) // tool-results/
      .mockResolvedValueOnce([['agent-abc123.jsonl', FileType.File]]); // subagents/ for compaction
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValueOnce(encode(jsonlContent)) // agent-abc123.jsonl
      .mockRejectedValueOnce(new Error('not found')); // agent-abc123.meta.json

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(result.subagentEntries).toHaveLength(1);
    expect(result.subagentEntries[0]?.agentId).toBe('abc123');
    expect(result.subagentEntries[0]?.content).toBe(jsonlContent);
    expect(result.subagentEntries[0]?.metaContent).toBeUndefined();
  });

  it('returns subagent entry with meta content when meta file exists', async () => {
    const jsonlContent = '{"type":"human","text":"hello"}\n';
    const metaContent = '{"agentType":"subagent"}';
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([
        ['agent-abc123.jsonl', FileType.File],
        ['agent-abc123.meta.json', FileType.File],
      ]) // subagents/
      .mockResolvedValueOnce([]) // tool-results/
      .mockResolvedValueOnce([
        ['agent-abc123.jsonl', FileType.File],
        ['agent-abc123.meta.json', FileType.File],
      ]); // subagents/ for compaction
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValueOnce(encode(jsonlContent)) // agent-abc123.jsonl
      .mockResolvedValueOnce(encode(metaContent)); // agent-abc123.meta.json

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(result.subagentEntries).toHaveLength(1);
    expect(result.subagentEntries[0]?.metaContent).toBe(metaContent);
  });

  it('returns compaction entry with mtime when compaction file exists', async () => {
    const compactionContent = '{"type":"assistant","text":"summary"}\n';
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([['agent-acompact-xyz.jsonl', FileType.File]]) // subagents/
      .mockResolvedValueOnce([]) // tool-results/
      .mockResolvedValueOnce([['agent-acompact-xyz.jsonl', FileType.File]]); // subagents/ for compaction
    workspace.fs.readFile = vi.fn().mockResolvedValue(encode(compactionContent));
    workspace.fs.stat = vi
      .fn()
      .mockResolvedValue({ mtime: 9000, ctime: 8000, size: 42, type: FileType.File });

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(result.compactionEntries).toHaveLength(1);
    expect(result.compactionEntries[0]?.mtime).toBe(9000);
    expect(result.compactionEntries[0]?.content).toBe(compactionContent);
  });

  it('returns tool-result content keyed by full filename including extension', async () => {
    const toolOutput = 'tool output';
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([]) // subagents/
      .mockResolvedValueOnce([['toolu_abc.txt', FileType.File]]) // tool-results/
      .mockResolvedValueOnce([]); // subagents/ for compaction
    workspace.fs.readFile = vi.fn().mockResolvedValue(encode(toolOutput));

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(result.toolResultMap.get('toolu_abc.txt')).toBe(toolOutput);
    expect(result.toolResultMap.get('toolu_abc')).toBeUndefined();
  });

  it('resolves same-stem-different-extension files to distinct map entries', async () => {
    const txtOutput = 'txt content';
    const jsonOutput = 'json content';
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([]) // subagents/
      .mockResolvedValueOnce([
        ['toolu_abc.txt', FileType.File],
        ['toolu_abc.json', FileType.File],
      ]) // tool-results/
      .mockResolvedValueOnce([]); // subagents/ for compaction
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValueOnce(encode(txtOutput))
      .mockResolvedValueOnce(encode(jsonOutput));

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(result.toolResultMap.size).toBe(2);
    expect(result.toolResultMap.get('toolu_abc.txt')).toBe(txtOutput);
    expect(result.toolResultMap.get('toolu_abc.json')).toBe(jsonOutput);
  });

  it('logs warning and includes entry with unreadable flag when subagent file is unreadable', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([['agent-abc123.jsonl', FileType.File]]) // subagents/
      .mockResolvedValueOnce([]) // tool-results/
      .mockResolvedValueOnce([['agent-abc123.jsonl', FileType.File]]); // subagents/ for compaction
    workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('permission denied'));

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(logger.warn).toHaveBeenCalled();
    expect(result.subagentEntries).toHaveLength(1);
    expect(result.subagentEntries[0]?.agentId).toBe('abc123');
    expect(result.subagentEntries[0]?.content).toBe('');
    expect(result.subagentEntries[0]?.unreadable).toBe(true);
  });

  it('logs warning and skips tool-result entry when file is unreadable', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([]) // subagents/
      .mockResolvedValueOnce([['toolu_abc.txt', FileType.File]]) // tool-results/
      .mockResolvedValueOnce([]); // subagents/ for compaction
    workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('permission denied'));

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(logger.warn).toHaveBeenCalled();
    expect(result.toolResultMap.size).toBe(0);
  });

  // H-01 tests: broaden companionPartial to cover tool-result and compaction failures

  it('H-01: tool-result readFile rejects EACCES → companionPartial:true, failing entry absent from map', async () => {
    const accessError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([]) // subagents/
      .mockResolvedValueOnce([['toolu_abc.txt', FileType.File]]) // tool-results/
      .mockResolvedValueOnce([]); // subagents/ for compaction
    workspace.fs.readFile = vi.fn().mockRejectedValue(accessError);

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(result.companionPartial).toBe(true);
    expect(result.toolResultMap.size).toBe(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('H-01: compaction readOneCompactionFile rejects → companionPartial:true, entry dropped', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([]) // subagents/
      .mockResolvedValueOnce([]) // tool-results/
      .mockResolvedValueOnce([['agent-acompact-abc.jsonl', FileType.File]]); // subagents/ for compaction
    workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('read error'));

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(result.companionPartial).toBe(true);
    expect(result.compactionEntries).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('H-01: tool-results/ readDirectory rejects with FileNotFound → companionPartial stays false (benign-absent)', async () => {
    const notFoundErr = FileSystemError.FileNotFound('tool-results not found');
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([]) // subagents/
      .mockRejectedValueOnce(notFoundErr) // tool-results/ — benign absence
      .mockResolvedValueOnce([]); // subagents/ for compaction
    workspace.fs.readFile = vi.fn().mockResolvedValue(encode(''));

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(result.companionPartial).toBeUndefined();
    expect(result.toolResultMap.size).toBe(0);
  });

  it('H-01: tool-results/ readDirectory rejects with NoPermissions → companionPartial:true', async () => {
    const permErr = Object.assign(new Error('NoPermissions'), { code: 'NoPermissions' });
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([]) // subagents/
      .mockRejectedValueOnce(permErr) // tool-results/ — permission error → partial
      .mockResolvedValueOnce([]); // subagents/ for compaction

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(result.companionPartial).toBe(true);
    expect(result.toolResultMap.size).toBe(0);
  });

  // H-06 tests: FileType filtering in readToolResults and readSubagents

  it('H-06: Directory entry in tool-results/ is skipped (no readFile, no warn, absent from map)', async () => {
    const toolOutput = 'tool output';
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([]) // subagents/
      .mockResolvedValueOnce([
        ['subdir', FileType.Directory],
        ['toolu_abc.txt', FileType.File],
      ]) // tool-results/ — one dir, one file
      .mockResolvedValueOnce([]); // subagents/ for compaction
    workspace.fs.readFile = vi.fn().mockResolvedValue(encode(toolOutput));

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    // Directory entry skipped; only the File entry read
    expect(result.toolResultMap.size).toBe(1);
    expect(result.toolResultMap.get('toolu_abc.txt')).toBe(toolOutput);
    expect(result.toolResultMap.get('subdir')).toBeUndefined();
    // readFile called exactly once (for the File entry only)
    expect(workspace.fs.readFile).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  // H-07 tests: lazy/referenced loading and per-file byte cap

  it("H-07: only referenced tool-result files are readFile'd (lazy loading)", async () => {
    // Main session references toolu_used.txt but NOT toolu_unused.txt
    const mainContent = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: '<persisted-output>toolu_used.txt</persisted-output>' },
        ],
      },
    });
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([]) // subagents/
      .mockResolvedValueOnce([
        ['toolu_used.txt', FileType.File],
        ['toolu_unused.txt', FileType.File],
      ]) // tool-results/
      .mockResolvedValueOnce([]); // subagents/ for compaction
    workspace.fs.readFile = vi.fn().mockResolvedValue(encode('content'));

    const result = await resolveCompanionData(SESSION_URI, logger as any, mainContent);

    // Only the referenced file should be in the map
    expect(result.toolResultMap.has('toolu_used.txt')).toBe(true);
    expect(result.toolResultMap.has('toolu_unused.txt')).toBe(false);
    // readFile called only once (for toolu_used.txt only)
    expect(workspace.fs.readFile).toHaveBeenCalledTimes(1);
  });

  it('H-07: all tool-result files are read when no rawSessionContent provided', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([]) // subagents/
      .mockResolvedValueOnce([
        ['toolu_a.txt', FileType.File],
        ['toolu_b.txt', FileType.File],
      ]) // tool-results/
      .mockResolvedValueOnce([]); // subagents/ for compaction
    workspace.fs.readFile = vi.fn().mockResolvedValue(encode('content'));

    // No rawSessionContent → no lazy filtering
    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(result.toolResultMap.size).toBe(2);
    expect(workspace.fs.readFile).toHaveBeenCalledTimes(2);
  });

  it('H-07: tool-result file exceeding byte cap is stored as truncated head + elision note', async () => {
    const bigContent = 'A'.repeat(COMPANION_FILE_BYTE_CAP + 100);
    // Reference the big file in main content
    const mainContent = `<persisted-output>big.txt</persisted-output>`;
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([]) // subagents/
      .mockResolvedValueOnce([['big.txt', FileType.File]]) // tool-results/
      .mockResolvedValueOnce([]); // subagents/ for compaction
    workspace.fs.readFile = vi.fn().mockResolvedValue(encode(bigContent));

    const result = await resolveCompanionData(SESSION_URI, logger as any, mainContent);

    const stored = result.toolResultMap.get('big.txt');
    expect(stored).toBeDefined();
    // Must be shorter than the original
    expect(stored!.length).toBeLessThan(bigContent.length);
    // Head must be preserved
    expect(stored!.startsWith('A'.repeat(100))).toBe(true);
    // Elision note must be present
    expect(stored).toContain('bytes elided');
    expect(stored).toContain('big.txt');
  });

  it('H-01: all readers succeed → companionPartial is not set', async () => {
    const toolOutput = 'tool output';
    const jsonlContent = '{"type":"human","text":"hello"}\n';
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([['agent-abc123.jsonl', FileType.File]]) // subagents/
      .mockResolvedValueOnce([['toolu_abc.txt', FileType.File]]) // tool-results/
      .mockResolvedValueOnce([['agent-abc123.jsonl', FileType.File]]); // subagents/ for compaction
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValueOnce(encode(jsonlContent)) // subagent content
      .mockRejectedValueOnce(new Error('meta not found')) // meta file absent (not an error)
      .mockResolvedValueOnce(encode(toolOutput)); // tool-result
    workspace.fs.stat = vi
      .fn()
      .mockResolvedValue({ mtime: 100, ctime: 0, size: 10, type: FileType.File });

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(result.companionPartial).toBeUndefined();
  });
});
