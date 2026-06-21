/**
 * Tests for reconcileArchiveLocation — the one-shot, idempotent archive
 * relocation triggered on the first cycle when the configured path equals
 * the new default (.tangyr/agent-sessions) and a non-empty archive tree
 * exists at the historical default (docs/archive/agent-sessions).
 *
 * WS-0021 Task 3.1
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workspace, FileType } from '../../mocks/vscode';

const { mockCheckAndPromptGitignore } = vi.hoisted(() => ({
  mockCheckAndPromptGitignore: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../src/features/agentSessionsArchiving/gitignorePrompt', () => ({
  checkAndPromptGitignore: mockCheckAndPromptGitignore,
}));

import { AgentSessionArchiveService } from '../../../../src/features/agentSessionsArchiving/archiveService';
import type { AgentSessionsArchivingConfig } from '../../../../src/types';

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

const NEW_DEFAULT_PATH = '.tangyr/agent-sessions';
const HISTORICAL_DEFAULT_PATH = 'docs/archive/agent-sessions';

const NEW_DEFAULT_CONFIG: AgentSessionsArchivingConfig = {
  enabled: true,
  archivePath: NEW_DEFAULT_PATH,
  intervalMinutes: 5,
};

const CUSTOM_PATH_CONFIG: AgentSessionsArchivingConfig = {
  enabled: true,
  archivePath: 'my/custom/archive',
  intervalMinutes: 5,
};

describe('reconcileArchiveLocation', () => {
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
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    // BK-004: stat is used to check whether a destination file already exists
    // before copying. Reject for new-default destination paths so the copy
    // proceeds (destination absent = safe to copy).
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.includes(NEW_DEFAULT_PATH)) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reconciles: new-default config + non-empty historical dir → moveArchive called once', async () => {
    // Historical dir has a year entry
    const historicalEntries: [string, typeof FileType.Directory][] = [
      ['2026', FileType.Directory],
    ];
    const monthEntries: [string, typeof FileType.Directory][] = [
      ['01', FileType.Directory],
    ];
    const fileEntries: [string, typeof FileType.File][] = [
      ['202601010000-session.md', FileType.File],
    ];

    workspace.fs.readDirectory = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH))
        return Promise.resolve(historicalEntries);
      if (uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026`))
        return Promise.resolve(monthEntries);
      if (uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026/01`))
        return Promise.resolve(fileEntries);
      // new default dir — empty (dedup finds nothing to process)
      return Promise.resolve([]);
    });

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(NEW_DEFAULT_CONFIG);
    await service.runArchiveCycle();

    // copy should have been called to move the file from historical to new default
    const copyCalls = vi.mocked(workspace.fs.copy).mock.calls;
    const movedFile = copyCalls.some(
      (call) =>
        (call[0] as { fsPath: string }).fsPath.includes(HISTORICAL_DEFAULT_PATH) &&
        (call[1] as { fsPath: string }).fsPath.includes(NEW_DEFAULT_PATH)
    );
    expect(movedFile).toBe(true);

    service.dispose();
  });

  it('reconciliation is idempotent: second cycle does not re-invoke moveArchive', async () => {
    // Historical dir has content on first cycle only; after move it would be gone
    let readDirCallCount = 0;
    workspace.fs.readDirectory = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      readDirCallCount++;
      if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH) && readDirCallCount === 1) {
        return Promise.resolve([['2026', FileType.Directory]]);
      }
      if (
        uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026`) &&
        readDirCallCount <= 3
      ) {
        return Promise.resolve([['01', FileType.Directory]]);
      }
      if (
        uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026/01`) &&
        readDirCallCount <= 5
      ) {
        return Promise.resolve([['202601010000-session.md', FileType.File]]);
      }
      // historical dir appears empty/gone after first reconcile
      if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH))
        return Promise.reject(new Error('not found'));
      return Promise.resolve([]);
    });

    const copyCallsBefore: number[] = [];
    workspace.fs.copy = vi.fn().mockImplementation(() => {
      copyCallsBefore.push(Date.now());
      return Promise.resolve(undefined);
    });

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(NEW_DEFAULT_CONFIG);
    await service.runArchiveCycle(); // first cycle — reconciliation runs
    const copyCountAfterFirst = vi.mocked(workspace.fs.copy).mock.calls.length;

    await service.runArchiveCycle(); // second cycle — reconciliation must NOT run again
    const copyCountAfterSecond = vi.mocked(workspace.fs.copy).mock.calls.length;

    // No additional copies should have been made on the second cycle
    expect(copyCountAfterSecond).toBe(copyCountAfterFirst);

    service.dispose();
  });

  it('custom archivePath → reconciliation does not run', async () => {
    const historicalEntries: [string, typeof FileType.Directory][] = [
      ['2026', FileType.Directory],
    ];
    workspace.fs.readDirectory = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH))
        return Promise.resolve(historicalEntries);
      return Promise.resolve([]);
    });

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(CUSTOM_PATH_CONFIG);
    await service.runArchiveCycle();

    // copy called only for dedup/archive cycle, never from historical to new-default
    const copyCalls = vi.mocked(workspace.fs.copy).mock.calls;
    const historicalMove = copyCalls.some(
      (call) =>
        (call[0] as { fsPath: string }).fsPath.includes(HISTORICAL_DEFAULT_PATH) &&
        (call[1] as { fsPath: string }).fsPath.includes(NEW_DEFAULT_PATH)
    );
    expect(historicalMove).toBe(false);

    service.dispose();
  });

  it('historical directory absent/empty → no move', async () => {
    workspace.fs.readDirectory = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH)) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve([]);
    });

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(NEW_DEFAULT_CONFIG);
    await service.runArchiveCycle();

    const copyCalls = vi.mocked(workspace.fs.copy).mock.calls;
    const movedFile = copyCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.includes(HISTORICAL_DEFAULT_PATH)
    );
    expect(movedFile).toBe(false);

    service.dispose();
  });
});
