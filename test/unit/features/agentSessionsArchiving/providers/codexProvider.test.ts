import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, FileType } from '../../../mocks/vscode';
import { CodexProvider } from '../../../../../src/features/agentSessionsArchiving/providers/codexProvider';

const SESSION_META_LINE = JSON.stringify({
  type: 'session_meta',
  payload: {
    id: 'abc-123',
    cwd: '/my/project',
  },
});

const OTHER_WORKSPACE_META = JSON.stringify({
  type: 'session_meta',
  payload: {
    id: 'def-456',
    cwd: '/other/project',
  },
});

function makeReadFileMock(firstLine: string): () => Promise<Uint8Array> {
  return vi
    .fn()
    .mockResolvedValue(new TextEncoder().encode(firstLine + '\n{"type":"event_msg"}'));
}

describe('CodexProvider', () => {
  let provider: CodexProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CodexProvider();
  });

  it('should have correct name and displayName', () => {
    expect(provider.name).toBe('codex');
    expect(provider.displayName).toBe('OpenAI Codex');
  });

  it('should return watch pattern for codex sessions directory', () => {
    const patterns = provider.getWatchPatterns('/any/workspace');
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.baseUri.fsPath).toContain('.codex/sessions');
    expect(patterns[0]!.glob).toBe('**/*.jsonl');
  });

  it('should return empty array when sessions directory does not exist', async () => {
    workspace.fs.readDirectory = vi.fn().mockRejectedValue(new Error('not found'));

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(0);
  });

  it('should find sessions matching the workspace cwd', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([['2026', FileType.Directory]])
      .mockResolvedValueOnce([['02', FileType.Directory]])
      .mockResolvedValueOnce([['28', FileType.Directory]])
      .mockResolvedValueOnce([
        ['rollout-2026-02-28T10-00-00-abc-123.jsonl', FileType.File],
      ]);
    workspace.fs.readFile = makeReadFileMock(SESSION_META_LINE);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1000, ctime: 900 });

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.providerName).toBe('codex');
    expect(sessions[0]!.archiveName).toBe('codex-abc-123');
    expect(sessions[0]!.extension).toBe('.jsonl');
  });

  it('should exclude sessions from a different workspace', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([['2026', FileType.Directory]])
      .mockResolvedValueOnce([['02', FileType.Directory]])
      .mockResolvedValueOnce([['28', FileType.Directory]])
      .mockResolvedValueOnce([['rollout-abc.jsonl', FileType.File]]);
    workspace.fs.readFile = makeReadFileMock(OTHER_WORKSPACE_META);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1000, ctime: 900 });

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(0);
  });

  it('should skip non-jsonl files', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([['2026', FileType.Directory]])
      .mockResolvedValueOnce([['02', FileType.Directory]])
      .mockResolvedValueOnce([['28', FileType.Directory]])
      .mockResolvedValueOnce([
        ['rollout-abc.jsonl', FileType.File],
        ['notes.txt', FileType.File],
      ]);
    workspace.fs.readFile = makeReadFileMock(SESSION_META_LINE);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1000, ctime: 900 });

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(1);
  });

  it('should skip files that fail to read', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([['2026', FileType.Directory]])
      .mockResolvedValueOnce([['02', FileType.Directory]])
      .mockResolvedValueOnce([['28', FileType.Directory]])
      .mockResolvedValueOnce([['rollout-abc.jsonl', FileType.File]]);
    workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('permission denied'));

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(0);
  });

  it('should skip files where first line is not session_meta', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([['2026', FileType.Directory]])
      .mockResolvedValueOnce([['02', FileType.Directory]])
      .mockResolvedValueOnce([['28', FileType.Directory]])
      .mockResolvedValueOnce([['rollout-abc.jsonl', FileType.File]]);
    workspace.fs.readFile = makeReadFileMock(
      JSON.stringify({ type: 'user', message: 'hello' })
    );

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(0);
  });

  it('should set displayName from filename', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([['2026', FileType.Directory]])
      .mockResolvedValueOnce([['03', FileType.Directory]])
      .mockResolvedValueOnce([['01', FileType.Directory]])
      .mockResolvedValueOnce([
        ['rollout-2026-03-01T12-00-00-abc-123.jsonl', FileType.File],
      ]);
    workspace.fs.readFile = makeReadFileMock(SESSION_META_LINE);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1000, ctime: 900 });

    const sessions = await provider.findSessions('/my/project');

    expect(sessions[0]!.displayName).toBe(
      'OpenAI Codex rollout-2026-03-01T12-00-00-abc-123.jsonl'
    );
  });

  it('should skip files where stat fails', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([['2026', FileType.Directory]])
      .mockResolvedValueOnce([['02', FileType.Directory]])
      .mockResolvedValueOnce([['28', FileType.Directory]])
      .mockResolvedValueOnce([['rollout-abc.jsonl', FileType.File]]);
    workspace.fs.readFile = makeReadFileMock(SESSION_META_LINE);
    workspace.fs.stat = vi.fn().mockRejectedValue(new Error('stat error'));

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(0);
  });

  it('should handle multiple year/month/day directories', async () => {
    workspace.fs.readDirectory = vi
      .fn()
      .mockResolvedValueOnce([
        ['2025', FileType.Directory],
        ['2026', FileType.Directory],
      ])
      .mockResolvedValueOnce([['12', FileType.Directory]])
      .mockResolvedValueOnce([['31', FileType.Directory]])
      .mockResolvedValueOnce([['rollout-old.jsonl', FileType.File]])
      .mockResolvedValueOnce([['02', FileType.Directory]])
      .mockResolvedValueOnce([['28', FileType.Directory]])
      .mockResolvedValueOnce([['rollout-new.jsonl', FileType.File]]);
    workspace.fs.readFile = makeReadFileMock(SESSION_META_LINE);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 1000, ctime: 900 });

    const sessions = await provider.findSessions('/my/project');

    expect(sessions).toHaveLength(2);
  });
});
