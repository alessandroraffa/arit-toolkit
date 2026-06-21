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
    uri: { fsPath: '/source/session.json' } as any,
    providerName: 'test-provider',
    archiveName: 'test-session',
    displayName: 'Test Session',
    mtime: 1000,
    ctime: 900,
    extension: '.json',
    ...overrides,
  };
}

function createMockProvider(sessions: SessionFile[] = []): SessionProvider {
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

describe('AgentSessionArchiveService — companionPartial retry behaviour', () => {
  let logger: ReturnType<typeof createMockLogger>;
  const workspaceRootUri = { fsPath: '/workspace' } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    logger = createMockLogger();
    workspace.fs.copy = vi.fn().mockResolvedValue(undefined);
    workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('leaves effectiveMtime as 0 in lastArchivedMap when companion is partial so the session is retried next cycle', async () => {
    // The session has a claude-code JSONL file so the parser path is exercised.
    const userEvent = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    });
    const assistantEvent = JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hi.' }] },
    });
    const rawContent = `${userEvent}\n${assistantEvent}`;

    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(rawContent));
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

    // Companion context signals that one subagent was unreadable.
    mockResolveCompanionData.mockResolvedValue({
      subagentEntries: [{ agentId: 'sub-1', content: '', unreadable: true }],
      toolResultMap: new Map(),
      compactionEntries: [],
      companionPartial: true,
    });

    const session = createMockSession({
      providerName: 'claude-code',
      archiveName: 'partial-session',
      displayName: 'Partial Session',
      extension: '.jsonl',
      mtime: 5000,
      ctime: 900,
    });
    const provider = createMockProvider([session]);
    const service = new AgentSessionArchiveService(
      workspaceRootUri,
      [provider],
      logger as any
    );
    (
      service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
    )._currentConfig = DEFAULT_CONFIG;
    (service as unknown as { _needsDedup: boolean })._needsDedup = false;

    await service.runArchiveCycle();

    // The archive was written (writeFile called).
    expect(workspace.fs.writeFile).toHaveBeenCalled();

    // A warning must be logged about the partial archive.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Partial archive written')
    );

    // lastArchivedMap must record mtime '0' sentinel, not effectiveMtime ('5000'), so the
    // session is re-processed on the next cycle.
    const entry = (service as any).lastArchivedMap.get('partial-session') as
      | { mtime: string }
      | undefined;
    expect(entry).toBeDefined();
    expect(entry!.mtime).toBe('0');

    service.dispose();
  });

  it('re-archives the session on the next cycle when the previous archive was partial', async () => {
    const userEvent = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    });
    const assistantEvent = JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hi.' }] },
    });
    const rawContent = `${userEvent}\n${assistantEvent}`;

    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(rawContent));
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

    // First cycle: partial companion.
    mockResolveCompanionData.mockResolvedValueOnce({
      subagentEntries: [{ agentId: 'sub-1', content: '', unreadable: true }],
      toolResultMap: new Map(),
      compactionEntries: [],
      companionPartial: true,
    });
    // Second cycle: all subagents readable.
    mockResolveCompanionData.mockResolvedValueOnce({
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [],
    });

    const session = createMockSession({
      providerName: 'claude-code',
      archiveName: 'retry-session',
      displayName: 'Retry Session',
      extension: '.jsonl',
      mtime: 5000,
      ctime: 900,
    });
    const provider = createMockProvider([session]);
    const service = new AgentSessionArchiveService(
      workspaceRootUri,
      [provider],
      logger as any
    );
    (
      service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
    )._currentConfig = DEFAULT_CONFIG;
    (service as unknown as { _needsDedup: boolean })._needsDedup = false;

    // First cycle — partial.
    await service.runArchiveCycle();

    vi.mocked(workspace.fs.writeFile).mockClear();

    // Second cycle — mtime '0' sentinel in the map means effectiveMtime ('5000') != '0', so the
    // session is NOT skipped and writeFile is called again.
    await service.runArchiveCycle();

    expect(workspace.fs.writeFile).toHaveBeenCalled();

    service.dispose();
  });

  // B-03: empty-session skip must honour companionPartial

  it('B-03: empty main turns + companionPartial true records mtime 0 so session is retried', async () => {
    // The main JSONL is valid but has zero non-empty turns (empty session).
    // The companion data is partial (e.g. a compaction file was transiently locked).
    // Expected: the session is skipped as empty AND the recorded mtime is '0',
    // so the next cycle will re-evaluate it once companion data is readable.
    const emptyEvent = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: '' }] },
    });
    const rawContent = emptyEvent; // produces zero non-empty turns

    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(rawContent));
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

    mockResolveCompanionData.mockResolvedValue({
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [],
      companionPartial: true,
    });

    const session = createMockSession({
      providerName: 'claude-code',
      archiveName: 'empty-partial-session',
      displayName: 'Empty Partial Session',
      extension: '.jsonl',
      mtime: 7000,
      ctime: 900,
    });
    const provider = createMockProvider([session]);
    const service = new AgentSessionArchiveService(
      workspaceRootUri,
      [provider],
      logger as any
    );
    (
      service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
    )._currentConfig = DEFAULT_CONFIG;
    (service as unknown as { _needsDedup: boolean })._needsDedup = false;

    await service.runArchiveCycle();

    // The session was empty so writeFile was NOT called.
    expect(workspace.fs.writeFile).not.toHaveBeenCalled();

    // But because companionPartial is true, the recorded mtime must be '0'
    // (not effectiveMtime '7000') so the session is retried next cycle.
    const entry = (service as any).lastArchivedMap.get('empty-partial-session') as
      | { mtime: string }
      | undefined;
    expect(entry).toBeDefined();
    expect(entry!.mtime).toBe('0');

    service.dispose();
  });

  it('B-03: empty main turns without companionPartial records effectiveMtime so session is not retried', async () => {
    // Same scenario but companion data is complete — a genuinely empty session
    // should be recorded with the real effectiveMtime and not retried.
    const emptyEvent = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: '' }] },
    });
    const rawContent = emptyEvent;

    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(rawContent));
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

    mockResolveCompanionData.mockResolvedValue({
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [],
    });

    const session = createMockSession({
      providerName: 'claude-code',
      archiveName: 'empty-complete-session',
      displayName: 'Empty Complete Session',
      extension: '.jsonl',
      mtime: 8000,
      ctime: 900,
    });
    const provider = createMockProvider([session]);
    const service = new AgentSessionArchiveService(
      workspaceRootUri,
      [provider],
      logger as any
    );
    (
      service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
    )._currentConfig = DEFAULT_CONFIG;
    (service as unknown as { _needsDedup: boolean })._needsDedup = false;

    await service.runArchiveCycle();

    expect(workspace.fs.writeFile).not.toHaveBeenCalled();

    // companionPartial is false → record the real effectiveMtime, not '0'
    const entry = (service as any).lastArchivedMap.get('empty-complete-session') as
      | { mtime: string }
      | undefined;
    expect(entry).toBeDefined();
    expect(entry!.mtime).toBe('8000');

    service.dispose();
  });
});
