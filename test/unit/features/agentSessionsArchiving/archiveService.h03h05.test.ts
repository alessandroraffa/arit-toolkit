import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workspace } from '../../mocks/vscode';

const { mockCheckAndPromptGitignore, mockResolveCompanionData } = vi.hoisted(() => ({
  mockCheckAndPromptGitignore: vi.fn().mockResolvedValue(undefined),
  mockResolveCompanionData: vi.fn(),
}));

vi.mock('../../../../src/features/agentSessionsArchiving/gitignorePrompt', () => ({
  checkAndPromptGitignore: mockCheckAndPromptGitignore,
}));

vi.mock('../../../../src/features/agentSessionsArchiving/companionDataResolver', () => ({
  resolveCompanionData: mockResolveCompanionData,
}));

import { AgentSessionArchiveService } from '../../../../src/features/agentSessionsArchiving/archiveService';
import type {
  SessionProvider,
  SessionFile,
} from '../../../../src/features/agentSessionsArchiving/types';
import type { AgentSessionsArchivingConfig } from '../../../../src/types';

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

function createMockSession(overrides: Partial<SessionFile> = {}): SessionFile {
  return {
    uri: { fsPath: '/source/session.jsonl' } as any,
    providerName: 'claude-code',
    archiveName: 'claude-code-testsession',
    displayName: 'Claude Code testsession.jsonl',
    mtime: 5000,
    ctime: 1_609_459_200_000, // 2021-01-01T00:00:00Z → 202101010000
    extension: '.jsonl',
    ...overrides,
  };
}

function createMockProvider(sessions: SessionFile[]): SessionProvider {
  return {
    name: 'test-provider',
    displayName: 'Test Provider',
    findSessions: vi.fn().mockResolvedValue(sessions),
  };
}

const DEFAULT_CONFIG: AgentSessionsArchivingConfig = {
  enabled: true,
  archivePath: 'docs/archive/agent-sessions',
  intervalMinutes: 5,
};

const workspaceRootUri = { fsPath: '/workspace' } as any;

// A minimal valid claude-code JSONL with one non-empty user+assistant turn
const VALID_JSONL = [
  JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  }),
  JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there.' }] },
  }),
].join('\n');

// A minimal claude-code JSONL with empty turns (no text in any event)
const EMPTY_TURNS_JSONL = [
  JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [] },
  }),
].join('\n');

describe('AgentSessionArchiveService — H-03: content-hash no-op write skip', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    logger = createMockLogger();
    workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 100, ctime: 90, size: 10 });
    mockResolveCompanionData.mockResolvedValue({
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('H-03: second write with identical content does not call writeFile; lastArchivedMap.mtime advances', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(VALID_JSONL));
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

    const session = createMockSession({ mtime: 5000, compositeMtime: '5000' });
    const service = new AgentSessionArchiveService(
      workspaceRootUri,
      [createMockProvider([session])],
      logger as any
    );
    (service as any)._currentConfig = DEFAULT_CONFIG;
    (service as any)._needsDedup = false;

    // First cycle — should write
    await service.runArchiveCycle();
    const writeCallsAfterFirst = vi.mocked(workspace.fs.writeFile).mock.calls.length;
    expect(writeCallsAfterFirst).toBe(1);

    const entryAfterFirst = (service as any).lastArchivedMap.get(
      'claude-code-testsession'
    ) as { mtime: string; contentHash?: string } | undefined;
    expect(entryAfterFirst?.mtime).toBe('5000');
    expect(entryAfterFirst?.contentHash).toBeDefined();

    // Change only the fingerprint/mtime to simulate a companion touch (same bytes)
    const sessionTouched = createMockSession({ mtime: 5000, compositeMtime: '5001' });
    (service as any).providers[0].findSessions.mockResolvedValue([sessionTouched]);
    vi.mocked(workspace.fs.writeFile).mockClear();

    // Second cycle — rendered markdown is byte-identical → should NOT write
    await service.runArchiveCycle();
    expect(workspace.fs.writeFile).not.toHaveBeenCalled();

    // But the fingerprint in the map must have advanced to '5001'
    const entryAfterSecond = (service as any).lastArchivedMap.get(
      'claude-code-testsession'
    ) as { mtime: string; contentHash?: string } | undefined;
    expect(entryAfterSecond?.mtime).toBe('5001');
    // contentHash stays the same (identical render)
    expect(entryAfterSecond?.contentHash).toBe(entryAfterFirst?.contentHash);
  });

  it('H-03: changed content causes writeFile to be called and contentHash updates', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(VALID_JSONL));
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

    const session = createMockSession({ mtime: 5000, compositeMtime: '5000' });
    const service = new AgentSessionArchiveService(
      workspaceRootUri,
      [createMockProvider([session])],
      logger as any
    );
    (service as any)._currentConfig = DEFAULT_CONFIG;
    (service as any)._needsDedup = false;

    // First write
    await service.runArchiveCycle();
    const hashAfterFirst = (
      (service as any).lastArchivedMap.get('claude-code-testsession') as {
        contentHash?: string;
      }
    )?.contentHash;

    // Change content for second write
    const differentJsonl = [
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'Different content' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Changed.' }] },
      }),
    ].join('\n');
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(differentJsonl));

    const sessionUpdated = createMockSession({ mtime: 5000, compositeMtime: '5002' });
    (service as any).providers[0].findSessions.mockResolvedValue([sessionUpdated]);
    vi.mocked(workspace.fs.writeFile).mockClear();

    // Second write — content changed → must write
    await service.runArchiveCycle();
    expect(workspace.fs.writeFile).toHaveBeenCalledOnce();

    const hashAfterSecond = (
      (service as any).lastArchivedMap.get('claude-code-testsession') as {
        contentHash?: string;
      }
    )?.contentHash;
    expect(hashAfterSecond).toBeDefined();
    expect(hashAfterSecond).not.toBe(hashAfterFirst);
  });

  it('H-03: partial companion with constant source mtime does not produce repeated writeFile calls', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(VALID_JSONL));
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

    // Companion is always partial (locked file) — partial forces mtime '0'
    mockResolveCompanionData.mockResolvedValue({
      subagentEntries: [{ agentId: 'sub', content: '', unreadable: true }],
      toolResultMap: new Map(),
      compactionEntries: [],
      companionPartial: true,
    });

    const session = createMockSession({ mtime: 5000, compositeMtime: '5000' });
    const service = new AgentSessionArchiveService(
      workspaceRootUri,
      [createMockProvider([session])],
      logger as any
    );
    (service as any)._currentConfig = DEFAULT_CONFIG;
    (service as any)._needsDedup = false;

    // First cycle: partial → writes archive, records mtime '0' with contentHash
    await service.runArchiveCycle();
    expect(workspace.fs.writeFile).toHaveBeenCalledOnce();
    vi.mocked(workspace.fs.writeFile).mockClear();

    // Second cycle: effectiveMtime '5000' !== '0' → enters writeArchiveFile again,
    // but H-03 detects identical hash → no write. mtime stays '0' (still partial).
    await service.runArchiveCycle();
    expect(workspace.fs.writeFile).not.toHaveBeenCalled();

    // Third cycle: same — still no write
    await service.runArchiveCycle();
    expect(workspace.fs.writeFile).not.toHaveBeenCalled();
  });
});

describe('AgentSessionArchiveService — H-05: empty-session skip includes subagents and compaction', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    logger = createMockLogger();
    workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 100, ctime: 90, size: 10 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('H-05: empty main turns + non-empty subagentSessions → NOT skipped, archive written', async () => {
    // JSONL with empty turns so main session is "empty"
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(EMPTY_TURNS_JSONL));
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

    // Companion has a readable subagent — parser will populate subagentSessions
    mockResolveCompanionData.mockResolvedValue({
      subagentEntries: [{ agentId: 'abc123', content: VALID_JSONL }],
      toolResultMap: new Map(),
      compactionEntries: [],
    });

    const session = createMockSession({ mtime: 5000, compositeMtime: '5000' });
    const service = new AgentSessionArchiveService(
      workspaceRootUri,
      [createMockProvider([session])],
      logger as any
    );
    (service as any)._currentConfig = DEFAULT_CONFIG;
    (service as any)._needsDedup = false;

    await service.runArchiveCycle();

    // Must NOT be skipped — writeFile should have been called
    expect(workspace.fs.writeFile).toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Skipped empty session')
    );
  });

  it('H-05: empty main turns + non-empty compactionSummaries → NOT skipped', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(EMPTY_TURNS_JSONL));
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

    // Compaction file exists and is readable
    const compactionJsonl = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Compaction summary text.' }],
      },
    });
    mockResolveCompanionData.mockResolvedValue({
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [{ content: compactionJsonl, mtime: 1000 }],
    });

    const session = createMockSession({ mtime: 5000, compositeMtime: '5000' });
    const service = new AgentSessionArchiveService(
      workspaceRootUri,
      [createMockProvider([session])],
      logger as any
    );
    (service as any)._currentConfig = DEFAULT_CONFIG;
    (service as any)._needsDedup = false;

    await service.runArchiveCycle();

    expect(workspace.fs.writeFile).toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Skipped empty session')
    );
  });

  it('H-05: empty main turns + no subagents + no compaction → skipped as before', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(EMPTY_TURNS_JSONL));
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

    mockResolveCompanionData.mockResolvedValue({
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [],
    });

    const session = createMockSession({ mtime: 5000, compositeMtime: '5000' });
    const service = new AgentSessionArchiveService(
      workspaceRootUri,
      [createMockProvider([session])],
      logger as any
    );
    (service as any)._currentConfig = DEFAULT_CONFIG;
    (service as any)._needsDedup = false;

    await service.runArchiveCycle();

    expect(workspace.fs.writeFile).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Skipped empty session')
    );
  });

  it('H-05: non-empty main turns → archived regardless of subagentSessions', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(VALID_JSONL));
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

    mockResolveCompanionData.mockResolvedValue({
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [],
    });

    const session = createMockSession({ mtime: 5000, compositeMtime: '5000' });
    const service = new AgentSessionArchiveService(
      workspaceRootUri,
      [createMockProvider([session])],
      logger as any
    );
    (service as any)._currentConfig = DEFAULT_CONFIG;
    (service as any)._needsDedup = false;

    await service.runArchiveCycle();

    expect(workspace.fs.writeFile).toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Skipped empty session')
    );
  });
});
