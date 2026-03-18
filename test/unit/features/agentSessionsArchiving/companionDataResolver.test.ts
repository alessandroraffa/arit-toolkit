import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, FileType } from '../../mocks/vscode';
import { resolveCompanionData } from '../../../../src/features/agentSessionsArchiving/companionDataResolver';
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

  it('returns tool-result content keyed by filename without extension', async () => {
    const toolOutput = 'tool output';
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([]) // companion dir check
      .mockResolvedValueOnce([]) // subagents/
      .mockResolvedValueOnce([['toolu_abc.txt', FileType.File]]) // tool-results/
      .mockResolvedValueOnce([]); // subagents/ for compaction
    workspace.fs.readFile = vi.fn().mockResolvedValue(encode(toolOutput));

    const result = await resolveCompanionData(SESSION_URI, logger as any);

    expect(result.toolResultMap.get('toolu_abc')).toBe(toolOutput);
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
});
