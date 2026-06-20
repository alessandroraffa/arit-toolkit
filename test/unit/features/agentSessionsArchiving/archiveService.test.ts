import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workspace, FileType } from '../../mocks/vscode';

const { mockCheckAndPromptGitignore } = vi.hoisted(() => ({
  mockCheckAndPromptGitignore: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../src/features/agentSessionsArchiving/gitignorePrompt', () => ({
  checkAndPromptGitignore: mockCheckAndPromptGitignore,
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

describe('AgentSessionArchiveService', () => {
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

  describe('start and stop', () => {
    it('should start archiving and run initial cycle', async () => {
      const session = createMockSession();
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );

      await service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();

      expect(provider.findSessions).toHaveBeenCalledWith('/workspace');
      expect(workspace.fs.copy).toHaveBeenCalled();

      service.dispose();
    });

    it('should stop interval on stop()', async () => {
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );

      await service.start(DEFAULT_CONFIG);
      await service.stop();

      expect(logger.info).toHaveBeenCalledWith('Agent sessions archiving stopped');

      service.dispose();
    });

    it('should expose current config', async () => {
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );

      expect(service.currentConfig).toBeUndefined();
      await service.start(DEFAULT_CONFIG);
      expect(service.currentConfig).toEqual(DEFAULT_CONFIG);

      service.dispose();
    });
  });

  describe('runArchiveCycle', () => {
    it('should copy new session files to archive', async () => {
      const session = createMockSession();
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      await service.runArchiveCycle();

      expect(workspace.fs.createDirectory).toHaveBeenCalled();
      expect(workspace.fs.copy).toHaveBeenCalled();
      const copyCall = vi.mocked(workspace.fs.copy).mock.calls[0]!;
      expect((copyCall[0] as { fsPath: string }).fsPath).toBe('/source/session.json');
      const destPath = (copyCall[1] as { fsPath: string }).fsPath;
      expect(destPath).toContain('test-session.json');

      service.dispose();
    });

    it('should use session ctime for archive filename timestamp', async () => {
      // ctime 1_609_459_200_000 = 2021-01-01T00:00:00.000Z → 202101010000
      // mtime 1_612_137_600_000 = 2021-02-01T00:00:00.000Z → 202102010000
      const session = createMockSession({
        ctime: 1_609_459_200_000,
        mtime: 1_612_137_600_000,
      });
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      await service.runArchiveCycle();

      const copyCall = vi.mocked(workspace.fs.copy).mock.calls[0]!;
      const destPath = (copyCall[1] as { fsPath: string }).fsPath;
      expect(destPath).toContain('202101010000-test-session.json');
      expect(destPath).not.toContain('202102010000');

      service.dispose();
    });

    it('should write archive file into YYYY/MM subdirectory', async () => {
      // ctime 1_609_459_200_000 = 2021-01-01T00:00:00.000Z → timestamp 202101010000
      const session = createMockSession({ ctime: 1_609_459_200_000, mtime: 1500 });
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      await service.runArchiveCycle();

      const copyCall = vi.mocked(workspace.fs.copy).mock.calls[0]!;
      const destPath = (copyCall[1] as { fsPath: string }).fsPath;
      expect(destPath).toContain('2021/01/202101010000-test-session.json');

      service.dispose();
    });

    it('should skip files with unchanged mtime', async () => {
      const session = createMockSession({ mtime: 1000 });
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      await service.runArchiveCycle();
      vi.mocked(workspace.fs.copy).mockClear();

      await service.runArchiveCycle();

      expect(workspace.fs.copy).not.toHaveBeenCalled();

      service.dispose();
    });

    it('should re-archive a session with unchanged mtime when force is true', async () => {
      const session = createMockSession({ mtime: 1000 });
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      await service.runArchiveCycle();
      vi.mocked(workspace.fs.copy).mockClear();

      await service.runArchiveCycle(true);

      expect(workspace.fs.copy).toHaveBeenCalled();

      service.dispose();
    });

    it('should replace old archive when mtime changes and ctime changes (new filename)', async () => {
      const session = createMockSession({ mtime: 1000, ctime: 1_609_459_200_000 });
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();

      // Update both mtime and ctime so the archive filename changes
      const updatedSession = createMockSession({
        mtime: 2000,
        ctime: 1_612_137_600_000,
      });
      vi.mocked(provider.findSessions).mockResolvedValue([updatedSession]);
      vi.mocked(workspace.fs.copy).mockClear();

      await service.runArchiveCycle();

      expect(workspace.fs.delete).toHaveBeenCalled();
      expect(workspace.fs.copy).toHaveBeenCalled();

      service.dispose();
    });

    it('should overwrite in place when mtime changes but ctime is unchanged (same filename)', async () => {
      const session = createMockSession({ mtime: 1000, ctime: 1_609_459_200_000 });
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();

      // Update mtime only — ctime unchanged means same archive filename
      const updatedSession = createMockSession({ mtime: 2000, ctime: 1_609_459_200_000 });
      vi.mocked(provider.findSessions).mockResolvedValue([updatedSession]);
      vi.mocked(workspace.fs.copy).mockClear();
      vi.mocked(workspace.fs.delete).mockClear();

      await service.runArchiveCycle();

      // write happens (copy), but no delete because filename is unchanged
      expect(workspace.fs.copy).toHaveBeenCalled();
      expect(workspace.fs.delete).not.toHaveBeenCalled();

      service.dispose();
    });

    it('should handle provider errors gracefully', async () => {
      const provider: SessionProvider = {
        name: 'failing',
        displayName: 'Failing Provider',
        findSessions: vi.fn().mockRejectedValue(new Error('fail')),
      };
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      await service.runArchiveCycle();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error finding sessions for Failing Provider')
      );

      service.dispose();
    });

    it('should return early when no config is set', async () => {
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );

      await service.runArchiveCycle();

      expect(provider.findSessions).not.toHaveBeenCalled();

      service.dispose();
    });

    it('should log error when copy fails during archive', async () => {
      const session = createMockSession();
      const provider = createMockProvider([session]);
      workspace.fs.copy = vi.fn().mockRejectedValue(new Error('disk full'));

      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to archive Test Session')
      );

      service.dispose();
    });

    it('should skip sessions created before ignoreSessionsBefore cutoff', async () => {
      const session = createMockSession({ ctime: Date.UTC(2024, 11, 31) });
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start({ ...DEFAULT_CONFIG, ignoreSessionsBefore: '20250101' });

      await service.runArchiveCycle();

      expect(workspace.fs.copy).not.toHaveBeenCalled();

      service.dispose();
    });

    it('should archive sessions created on or after ignoreSessionsBefore cutoff', async () => {
      const session = createMockSession({ ctime: Date.UTC(2025, 0, 1) });
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start({ ...DEFAULT_CONFIG, ignoreSessionsBefore: '20250101' });

      await service.runArchiveCycle();

      expect(workspace.fs.copy).toHaveBeenCalled();

      service.dispose();
    });

    it('should archive all sessions when ignoreSessionsBefore is undefined', async () => {
      const session = createMockSession({ ctime: 1000 });
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      await service.runArchiveCycle();

      expect(workspace.fs.copy).toHaveBeenCalled();

      service.dispose();
    });

    it('should skip writing and log info for a parsed copilot-chat session with zero non-empty turns', async () => {
      const session = createMockSession({
        providerName: 'copilot-chat',
        archiveName: 'copilot-chat-empty',
        displayName: 'Copilot Empty Session',
        extension: '.json',
        mtime: 1000,
      });
      const provider = createMockProvider([session]);
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode(JSON.stringify({ kind: 0, v: { requests: [] } }))
        );
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      await service.runArchiveCycle();

      expect(workspace.fs.writeFile).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipped empty session')
      );

      // Second cycle: session is not re-parsed (lastArchivedMap prevents reprocessing)
      vi.mocked(workspace.fs.readFile).mockClear();
      await service.runArchiveCycle();
      expect(workspace.fs.readFile).not.toHaveBeenCalled();

      service.dispose();
    });

    it('should reprocess a session whose archive was hydrated from disk with mtime 0, then skip it on the second cycle', async () => {
      // Source session fixture: ctime is the file's CREATION time; mtime is the file's MODIFICATION time.
      // Both belong to March 2026 — same year/month as the hydrated archive — so the new write
      // produced by archiveSession lands in the same '2026/03/' subdirectory as the hydrated file.
      const SESSION_CTIME = Date.UTC(2026, 2, 9, 5, 13, 0); // 2026-03-09T05:13:00Z → timestamp 202603090513
      const SESSION_MTIME = Date.UTC(2026, 2, 9, 6, 0, 0); // 2026-03-09T06:00:00Z (newer than hydrated mtime=0)
      const HYDRATED_ARCHIVE_RELATIVE =
        '2026/03/202603090513-copilot-chat-test-session.md';

      // Hydrated archive lives at /workspace/docs/archive/agent-sessions/2026/03/...md
      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          const p = uri.fsPath;
          if (p.endsWith('/2026/03'))
            return Promise.resolve([
              ['202603090513-copilot-chat-test-session.md', 1 /* File */],
            ]);
          if (p.endsWith('/2026')) return Promise.resolve([['03', 2 /* Directory */]]);
          if (p.endsWith('/agent-sessions'))
            return Promise.resolve([['2026', 2 /* Directory */]]);
          return Promise.resolve([]);
        });

      const session = createMockSession({
        archiveName: 'copilot-chat-test-session',
        providerName: 'test-provider',
        displayName: 'Copilot Chat Test Session',
        ctime: SESSION_CTIME,
        mtime: SESSION_MTIME,
        extension: '.md',
      });
      const provider = createMockProvider([session]);
      workspace.fs.copy = vi.fn().mockResolvedValue(undefined);

      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      // First cycle: hydration stat fails (mock returns undefined) → mtime: 0; source mtime is
      // SESSION_MTIME → re-processes. Because ctime is unchanged, the new archive filename equals
      // the hydrated filename → write-first-then-delete only fires when the filename differs, so
      // no delete is issued; the file is overwritten in place by copyRawArchive.
      await service.runArchiveCycle();

      // No delete — the archive filename is unchanged (same ctime-based prefix).
      expect(workspace.fs.delete).not.toHaveBeenCalled();

      // New archive written to the same year/month via copyRawArchive (no parser for 'test-provider').
      const copyCalls = vi.mocked(workspace.fs.copy).mock.calls;
      const copyDests = copyCalls.map((c) => (c[1] as { fsPath: string }).fsPath);
      expect(copyDests.some((p) => p.endsWith(HYDRATED_ARCHIVE_RELATIVE))).toBe(true);

      // Second cycle: mtime matches → skips, no delete and no copy.
      vi.mocked(workspace.fs.delete).mockClear();
      vi.mocked(workspace.fs.copy).mockClear();
      await service.runArchiveCycle();
      expect(workspace.fs.delete).not.toHaveBeenCalled();
      expect(workspace.fs.copy).not.toHaveBeenCalled();

      service.dispose();
    });

    it('should write the archive file for a parsed copilot-chat session with at least one non-empty turn', async () => {
      const session = createMockSession({
        providerName: 'copilot-chat',
        archiveName: 'copilot-chat-session',
        displayName: 'Copilot Session',
        extension: '.json',
        mtime: 1000,
      });
      const provider = createMockProvider([session]);
      workspace.fs.readFile = vi.fn().mockResolvedValue(
        new TextEncoder().encode(
          JSON.stringify({
            requests: [
              {
                message: { text: 'Hello' },
                response: [{ kind: 'markdownContent', value: 'Hi.' }],
              },
            ],
          })
        )
      );
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      await service.runArchiveCycle();

      expect(workspace.fs.writeFile).toHaveBeenCalled();

      service.dispose();
    });

    it('should ensure each YYYY/MM directory only once across multiple sessions in the same month', async () => {
      // Both sessions resolve to 2021/01 (ctime 2021-01-01T00:00:00Z → 202101010000).
      const sessionA = createMockSession({
        archiveName: 'session-a',
        displayName: 'Session A',
        ctime: 1_609_459_200_000,
        mtime: 1000,
      });
      const sessionB = createMockSession({
        archiveName: 'session-b',
        displayName: 'Session B',
        ctime: 1_609_459_200_000,
        mtime: 2000,
      });
      const provider = createMockProvider([sessionA, sessionB]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      // Bypass start() to avoid the fire-and-forget cycle that would race the
      // awaited cycle through ensureDirectory and double-count createDirectory calls.
      // The test exercises the per-cycle cache behavior on a single sequential cycle.
      (
        service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
      )._currentConfig = DEFAULT_CONFIG;
      (service as unknown as { _needsDedup: boolean })._needsDedup = false;

      await service.runArchiveCycle();

      const monthDirCalls = vi
        .mocked(workspace.fs.createDirectory)
        .mock.calls.filter(([u]) =>
          (u as { fsPath: string }).fsPath.endsWith('/2021/01')
        );
      expect(monthDirCalls.length).toBe(1);

      service.dispose();
    });
  });

  describe('reconfigure', () => {
    beforeEach(() => {
      mockCheckAndPromptGitignore.mockClear();
      mockCheckAndPromptGitignore.mockResolvedValue(undefined);
    });

    it('should start when transitioning from no config to enabled', async () => {
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );

      await service.reconfigure(undefined, DEFAULT_CONFIG, vi.fn());

      expect(service.currentConfig).toEqual(DEFAULT_CONFIG);

      service.dispose();
    });

    it('should stop when new config disables archiving', async () => {
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      await service.reconfigure(
        DEFAULT_CONFIG,
        { ...DEFAULT_CONFIG, enabled: false },
        vi.fn()
      );

      expect(logger.info).toHaveBeenCalledWith('Agent sessions archiving stopped');

      service.dispose();
    });

    it('should move archive when path changes', async () => {
      // moveArchive walks two levels (YYYY/MM/file). Use mockImplementation keyed on
      // fsPath so the fire-and-forget cycle from start() and moveArchive's traversal
      // (which both read the same paths) get consistent results regardless of order.
      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          const p = uri.fsPath;
          if (p.endsWith('/docs/archive/agent-sessions/2026/05'))
            return Promise.resolve([['202605010000-file.md', 1 /* File */]]);
          if (p.endsWith('/docs/archive/agent-sessions/2026'))
            return Promise.resolve([['05', 2 /* Directory */]]);
          if (p.endsWith('/docs/archive/agent-sessions'))
            return Promise.resolve([['2026', 2 /* Directory */]]);
          return Promise.resolve([]);
        });
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      const newConfig = { ...DEFAULT_CONFIG, archivePath: 'new/archive/path' };
      await service.reconfigure(DEFAULT_CONFIG, newConfig, vi.fn());

      expect(workspace.fs.copy).toHaveBeenCalled();
      const copyDests = vi
        .mocked(workspace.fs.copy)
        .mock.calls.map((c) => (c[1] as { fsPath: string }).fsPath);
      expect(copyDests.some((p) => p.endsWith('2026/05/202605010000-file.md'))).toBe(
        true
      );
      expect(workspace.fs.delete).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Moved archive from')
      );

      service.dispose();
    });

    it('should skip move when old directory does not exist', async () => {
      workspace.fs.readDirectory = vi.fn().mockRejectedValue(new Error('not found'));
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      const newConfig = { ...DEFAULT_CONFIG, archivePath: 'new/path' };
      await service.reconfigure(DEFAULT_CONFIG, newConfig, vi.fn());

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Old archive directory not found')
      );

      service.dispose();
    });

    it('should not start when transitioning from no config with disabled', async () => {
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );

      await service.reconfigure(
        undefined,
        { ...DEFAULT_CONFIG, enabled: false },
        vi.fn()
      );

      expect(service.currentConfig).toBeUndefined();

      service.dispose();
    });

    it('should call checkAndPromptGitignore when archivePath changes', async () => {
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      await service.reconfigure(
        DEFAULT_CONFIG,
        { ...DEFAULT_CONFIG, archivePath: 'new/path' },
        vi.fn()
      );

      expect(mockCheckAndPromptGitignore).toHaveBeenCalledTimes(1);
      const [pathArg, rootArg] = mockCheckAndPromptGitignore.mock.calls[0]!;
      expect(pathArg).toBe('new/path');
      expect(rootArg).toBe(workspaceRootUri);

      service.dispose();
    });

    it('should not call checkAndPromptGitignore when archivePath is unchanged', async () => {
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      await service.reconfigure(DEFAULT_CONFIG, DEFAULT_CONFIG, vi.fn());

      expect(mockCheckAndPromptGitignore).not.toHaveBeenCalled();

      service.dispose();
    });

    it('should short-circuit on re-entrant reconfigure (recursion guard)', async () => {
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      const startSpy = vi.spyOn(service, 'start');
      const innerUpdateConfig = vi.fn().mockResolvedValue(undefined);

      const recursiveUpdateConfig = vi.fn().mockImplementation(async () => {
        await service.reconfigure(
          DEFAULT_CONFIG,
          {
            ...DEFAULT_CONFIG,
            archivePath: 'new/path',
            gitignoreDecisions: { 'new/path': 'ignored' },
          },
          innerUpdateConfig
        );
      });

      mockCheckAndPromptGitignore.mockImplementation(
        async (
          _path: string,
          _root: unknown,
          _config: AgentSessionsArchivingConfig,
          _logger: unknown,
          updateConfig: (patch: Partial<AgentSessionsArchivingConfig>) => Promise<void>
        ) => {
          await updateConfig({ gitignoreDecisions: { 'new/path': 'ignored' } });
        }
      );

      await service.reconfigure(
        DEFAULT_CONFIG,
        { ...DEFAULT_CONFIG, archivePath: 'new/path' },
        recursiveUpdateConfig
      );

      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Re-entrant reconfigure call detected')
      );

      startSpy.mockRestore();
      service.dispose();
    });

    it('should leave the source archive in place when any copy fails during moveArchive', async () => {
      // moveArchive walks two levels of oldUri. Use mockImplementation keyed on
      // fsPath so the fire-and-forget cycle from start() and moveArchive's traversal
      // both get consistent results regardless of interleaving.
      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          const p = uri.fsPath;
          if (p.endsWith('/docs/archive/agent-sessions/2026/05'))
            return Promise.resolve([
              ['file-a.md', 1 /* File */],
              ['file-b.md', 1 /* File */],
            ]);
          if (p.endsWith('/docs/archive/agent-sessions/2026'))
            return Promise.resolve([['05', 2 /* Directory */]]);
          if (p.endsWith('/docs/archive/agent-sessions'))
            return Promise.resolve([['2026', 2 /* Directory */]]);
          return Promise.resolve([]);
        });
      // First moveArchive copy fails; subsequent copies succeed. The bare archiving
      // copies (Cycle A/Cycle B archiveFromProviders) won't run because provider is empty.
      workspace.fs.copy = vi
        .fn()
        .mockRejectedValueOnce(new Error('disk full'))
        .mockResolvedValue(undefined);
      workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
      workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);

      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);

      await service.reconfigure(
        DEFAULT_CONFIG,
        { ...DEFAULT_CONFIG, archivePath: 'new/path' },
        vi.fn()
      );

      // The source-root delete (the moveArchive recursive cleanup) must NOT happen.
      const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
      const sourceRootDelete = deleteCalls.find(([u]) =>
        (u as { fsPath: string }).fsPath.endsWith('/docs/archive/agent-sessions')
      );
      expect(sourceRootDelete).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('left source archive in place')
      );

      service.dispose();
    });
  });

  describe('migrateFlatLayout (via deduplicateAndHydrate)', () => {
    it('should move a flat archive file into the YYYY/MM subdirectory', async () => {
      let migrated = false;
      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          const p = uri.fsPath;
          if (p.endsWith('/agent-sessions') && !migrated) {
            return Promise.resolve([['202605251830-foo.md', FileType.File]]);
          }
          return Promise.resolve([]);
        });
      workspace.fs.copy = vi.fn().mockImplementation(async () => {
        migrated = true;
      });
      workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
      workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);

      const provider = createMockProvider([]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      // Bypass start() to avoid the fire-and-forget cycle race.
      (
        service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
      )._currentConfig = DEFAULT_CONFIG;
      (service as unknown as { _needsDedup: boolean })._needsDedup = true;
      await service.runArchiveCycle();

      const copyDests = vi
        .mocked(workspace.fs.copy)
        .mock.calls.map((c) => (c[1] as { fsPath: string }).fsPath);
      expect(copyDests.some((p) => p.endsWith('2026/05/202605251830-foo.md'))).toBe(true);
      const deleteSrcs = vi
        .mocked(workspace.fs.delete)
        .mock.calls.map((c) => (c[0] as { fsPath: string }).fsPath);
      expect(deleteSrcs.some((p) => p.endsWith('202605251830-foo.md'))).toBe(true);

      service.dispose();
    });

    it('should be idempotent — does not move files already under YYYY/MM', async () => {
      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          const p = uri.fsPath;
          if (p.endsWith('/agent-sessions'))
            return Promise.resolve([['2026', FileType.Directory]]);
          return Promise.resolve([]);
        });
      workspace.fs.copy = vi.fn().mockResolvedValue(undefined);
      workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);

      const provider = createMockProvider([]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      (
        service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
      )._currentConfig = DEFAULT_CONFIG;
      (service as unknown as { _needsDedup: boolean })._needsDedup = true;
      await service.runArchiveCycle();

      expect(workspace.fs.copy).not.toHaveBeenCalled();

      service.dispose();
    });

    it('should handle a mixed tree: migrate flat files and leave YYYY/MM entries alone', async () => {
      let migrated = false;
      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          const p = uri.fsPath;
          if (p.endsWith('/agent-sessions')) {
            return Promise.resolve(
              migrated
                ? [['2026', FileType.Directory]]
                : [
                    ['202605251830-foo.md', FileType.File],
                    ['2026', FileType.Directory],
                  ]
            );
          }
          return Promise.resolve([]);
        });
      workspace.fs.copy = vi.fn().mockImplementation(async () => {
        migrated = true;
      });
      workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
      workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);

      const provider = createMockProvider([]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      (
        service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
      )._currentConfig = DEFAULT_CONFIG;
      (service as unknown as { _needsDedup: boolean })._needsDedup = true;
      await service.runArchiveCycle();

      expect(workspace.fs.copy).toHaveBeenCalledTimes(1);
      const copyCall = vi.mocked(workspace.fs.copy).mock.calls[0]!;
      expect((copyCall[1] as { fsPath: string }).fsPath).toContain(
        '2026/05/202605251830-foo.md'
      );

      service.dispose();
    });

    it('should overwrite the destination if it already exists', async () => {
      let migrated = false;
      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          const p = uri.fsPath;
          if (p.endsWith('/agent-sessions') && !migrated)
            return Promise.resolve([['202605251830-foo.md', FileType.File]]);
          return Promise.resolve([]);
        });
      workspace.fs.copy = vi.fn().mockImplementation(async () => {
        migrated = true;
      });
      workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
      workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);

      const provider = createMockProvider([]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      (
        service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
      )._currentConfig = DEFAULT_CONFIG;
      (service as unknown as { _needsDedup: boolean })._needsDedup = true;
      await service.runArchiveCycle();

      const copyCall = vi.mocked(workspace.fs.copy).mock.calls[0]!;
      expect(copyCall[2]).toEqual({ overwrite: true });

      service.dispose();
    });

    it('should leave the source in place and continue when copy fails', async () => {
      // Post-migrate top-level still contains the failed-copy source file as a File entry.
      // The dedup year-loop in deduplicateAndHydrate only iterates entries that are
      // FileType.Directory matching /^\d{4}$/ — the stranded File is naturally ignored.
      // A future maintainer modifying the dedup body must preserve this property, or
      // the failed-copy file will be processed again.
      let succeededMigration = false;
      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          const p = uri.fsPath;
          if (p.endsWith('/agent-sessions')) {
            return Promise.resolve(
              succeededMigration
                ? [['202605251830-foo.md', FileType.File]]
                : [
                    ['202605251830-foo.md', FileType.File],
                    ['202606011000-bar.md', FileType.File],
                  ]
            );
          }
          return Promise.resolve([]);
        });
      workspace.fs.copy = vi
        .fn()
        .mockRejectedValueOnce(new Error('disk full'))
        .mockImplementation(async () => {
          succeededMigration = true;
        });
      workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
      workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);

      const provider = createMockProvider([]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      (
        service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
      )._currentConfig = DEFAULT_CONFIG;
      (service as unknown as { _needsDedup: boolean })._needsDedup = true;
      await service.runArchiveCycle();

      // delete called for the successful copy's source, not for the failed one
      expect(workspace.fs.delete).toHaveBeenCalledTimes(1);
      const warnCalls = vi
        .mocked(logger.warn)
        .mock.calls.filter(([msg]) =>
          String(msg).includes('Failed to migrate flat archive file')
        );
      expect(warnCalls.length).toBe(1);

      service.dispose();
    });
  });

  describe('dispose', () => {
    it('should stop interval on dispose', async () => {
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);
      service.dispose();

      expect(logger.info).toHaveBeenCalledWith('Agent sessions archiving stopped');
    });
  });

  describe('runArchiveCycle concurrency guard', () => {
    // Flush pending microtasks — enough passes for finally chains to settle.
    async function flushMicrotasks(): Promise<void> {
      for (let i = 0; i < 15; i++) {
        await Promise.resolve();
      }
    }

    it('concurrent runArchiveCycle calls coalesce into at most two sequential cycles', async () => {
      let resolveFirst: (() => void) | undefined;
      const firstCyclePromise = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      const provider = createMockProvider([createMockSession()]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      vi.spyOn(service as any, 'deduplicateAndHydrate').mockResolvedValue(undefined);
      const archiveSpy = vi
        .spyOn(service as any, 'archiveFromProviders')
        .mockImplementationOnce(async () => {
          await firstCyclePromise;
        })
        .mockResolvedValue(undefined);

      await service.start(DEFAULT_CONFIG);
      // Cycle A is now in-flight (archiveSpy called once, stuck on firstCyclePromise)
      void service.runArchiveCycle();
      void service.runArchiveCycle();

      resolveFirst!();
      await flushMicrotasks();

      // Cycle A (1) + at most one follow-up (1) = 2. NOT 3 (one per extra call).
      expect(archiveSpy.mock.calls.length).toBeLessThanOrEqual(2);
      service.dispose();
    });

    it('stop awaits the in-flight cycle before returning', async () => {
      let resolveInFlight: (() => void) | undefined;
      const inFlightPromise = new Promise<void>((resolve) => {
        resolveInFlight = resolve;
      });
      const provider = createMockProvider([]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      vi.spyOn(service as any, 'deduplicateAndHydrate').mockResolvedValue(undefined);
      const archiveSpy = vi
        .spyOn(service as any, 'archiveFromProviders')
        .mockImplementation(async () => {
          await inFlightPromise;
        });

      await service.start(DEFAULT_CONFIG);
      const stopPromise = service.stop();
      expect(stopPromise).toBeInstanceOf(Promise);

      resolveInFlight!();
      await stopPromise;

      const callCountAfterStop = archiveSpy.mock.calls.length;
      await flushMicrotasks();
      expect(archiveSpy.mock.calls.length).toBe(callCountAfterStop);

      service.dispose();
    });

    it('_needsDedup is cleared only once per in-flight cycle, not per coalesced call', async () => {
      let resolveFirst: (() => void) | undefined;
      const firstCyclePromise = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      const provider = createMockProvider([]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      const dedupSpy = vi
        .spyOn(service as any, 'deduplicateAndHydrate')
        .mockResolvedValue(undefined);

      vi.spyOn(service as any, 'archiveFromProviders')
        .mockImplementationOnce(async () => {
          await firstCyclePromise;
        })
        .mockResolvedValue(undefined);

      await service.start(DEFAULT_CONFIG);
      void service.runArchiveCycle();
      void service.runArchiveCycle();

      resolveFirst!();
      await flushMicrotasks();

      // deduplicateAndHydrate called at most twice (once per actual cycle, not per coalesced call)
      expect(dedupSpy.mock.calls.length).toBeLessThanOrEqual(2);
      service.dispose();
    });

    it('force=true from a coalesced call is preserved in the follow-up cycle', async () => {
      let resolveFirst: (() => void) | undefined;
      const firstCyclePromise = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      const provider = createMockProvider([]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      const forceValues: boolean[] = [];

      vi.spyOn(service as any, 'deduplicateAndHydrate').mockResolvedValue(undefined);
      vi.spyOn(service as any, 'archiveFromProviders')
        .mockImplementationOnce(async () => {
          await firstCyclePromise;
        })
        .mockImplementation(async (_archiveUri: unknown, force: boolean) => {
          forceValues.push(force);
        });

      await service.start(DEFAULT_CONFIG);
      void service.runArchiveCycle(true);

      resolveFirst!();
      await flushMicrotasks();

      expect(forceValues.some((f) => f === true)).toBe(true);
      service.dispose();
    });

    it('two concurrent start() calls with different configs result in service running the second config (stash-and-replay)', async () => {
      const configA = { ...DEFAULT_CONFIG, intervalMinutes: 2 };
      const configB = { ...DEFAULT_CONFIG, intervalMinutes: 3 };

      let resolveDeferred: (() => void) | undefined;
      const deferredPromise = new Promise<void>((resolve) => {
        resolveDeferred = resolve;
      });

      const provider = createMockProvider([]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      vi.spyOn(service as any, 'archiveFromProviders').mockImplementation(async () => {
        await deferredPromise;
      });
      vi.spyOn(service as any, 'deduplicateAndHydrate').mockResolvedValue(undefined);

      // start(configA) begins — _starting becomes true, archiveFromProviders is stuck
      const p1 = service.start(configA);
      // start(configB) while _starting is true — stashes configB and returns immediately
      void service.start(configB);

      resolveDeferred!();
      await p1;
      await flushMicrotasks();

      expect(service.currentConfig).toEqual(configB);
      service.dispose();
    });

    it('dispose() resets _pendingStartConfig', () => {
      const provider = createMockProvider([]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      (service as any)._pendingStartConfig = DEFAULT_CONFIG;

      service.dispose();

      expect((service as any)._pendingStartConfig).toBeUndefined();
    });
  });

  describe('archiveSession — write-first-then-delete', () => {
    it('writes the new archive file before deleting the old one when archiveName changes', async () => {
      const session = createMockSession({ mtime: 2000, ctime: 900 });
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      (
        service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
      )._currentConfig = DEFAULT_CONFIG;

      // Prime lastArchivedMap with an old archiveFileName
      const oldArchiveFileName = '2026/05/202605010000-test-session.json';
      (service as any).lastArchivedMap.set(session.archiveName, {
        mtime: 1000,
        archiveFileName: oldArchiveFileName,
      });

      // writeArchiveFile returns a new filename (timestamp will differ due to mtime change)
      const newArchiveFileName = '2026/06/202606010000-test-session.json';
      const writeArchiveFileSpy = vi
        .spyOn(service as any, 'writeArchiveFile')
        .mockResolvedValue({ fileName: newArchiveFileName, companionPartial: false });

      const callOrder: string[] = [];
      writeArchiveFileSpy.mockImplementation(async () => {
        callOrder.push('write');
        return { fileName: newArchiveFileName, companionPartial: false };
      });
      workspace.fs.delete = vi.fn().mockImplementation(async () => {
        callOrder.push('delete');
      });

      await service.runArchiveCycle(true);

      expect(callOrder[0]).toBe('write');
      expect(callOrder[1]).toBe('delete');
      expect(workspace.fs.delete).toHaveBeenCalledOnce();
      const deletedUri = vi.mocked(workspace.fs.delete).mock.calls[0]![0] as {
        fsPath: string;
      };
      expect(deletedUri.fsPath).toContain(oldArchiveFileName);

      service.dispose();
    });

    it('does not delete the old file when the archive filename is unchanged', async () => {
      const session = createMockSession({ mtime: 2000, ctime: 900 });
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      (
        service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
      )._currentConfig = DEFAULT_CONFIG;

      // Same archiveFileName in both map and writeArchiveFile return
      const sameArchiveFileName = '2026/06/202606010000-test-session.json';
      (service as any).lastArchivedMap.set(session.archiveName, {
        mtime: 1000,
        archiveFileName: sameArchiveFileName,
      });

      vi.spyOn(service as any, 'writeArchiveFile').mockResolvedValue({
        fileName: sameArchiveFileName,
        companionPartial: false,
      });
      workspace.fs.delete = vi.fn().mockResolvedValue(undefined);

      await service.runArchiveCycle(true);

      expect(workspace.fs.delete).not.toHaveBeenCalled();

      service.dispose();
    });
  });

  describe('deduplicateAndHydrate — real mtime hydration', () => {
    it('seeds lastArchivedMap with the stat mtime of each archive file, not mtime:0', async () => {
      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          const p = uri.fsPath;
          if (p.endsWith('/agent-sessions'))
            return Promise.resolve([['2026', FileType.Directory]]);
          if (p.endsWith('/2026')) return Promise.resolve([['06', FileType.Directory]]);
          if (p.endsWith('/2026/06'))
            return Promise.resolve([['202606010000-stat-session.json', FileType.File]]);
          return Promise.resolve([]);
        });
      workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 9999 });

      const provider = createMockProvider([]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      (
        service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
      )._currentConfig = DEFAULT_CONFIG;
      (service as unknown as { _needsDedup: boolean })._needsDedup = true;

      await service.runArchiveCycle();

      const entry = (service as any).lastArchivedMap.get('stat-session') as
        | { mtime: number }
        | undefined;
      expect(entry).toBeDefined();
      expect(entry!.mtime).toBe(9999);

      service.dispose();
    });

    it('falls back to mtime:0 when stat throws for an archive file', async () => {
      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          const p = uri.fsPath;
          if (p.endsWith('/agent-sessions'))
            return Promise.resolve([['2026', FileType.Directory]]);
          if (p.endsWith('/2026')) return Promise.resolve([['06', FileType.Directory]]);
          if (p.endsWith('/2026/06'))
            return Promise.resolve([['202606010000-nostat-session.json', FileType.File]]);
          return Promise.resolve([]);
        });
      workspace.fs.stat = vi.fn().mockRejectedValue(new Error('ENOENT'));

      const provider = createMockProvider([]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      (
        service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
      )._currentConfig = DEFAULT_CONFIG;
      (service as unknown as { _needsDedup: boolean })._needsDedup = true;

      await service.runArchiveCycle();

      const entry = (service as any).lastArchivedMap.get('nostat-session') as
        | { mtime: number }
        | undefined;
      expect(entry).toBeDefined();
      expect(entry!.mtime).toBe(0);

      service.dispose();
    });
  });

  describe('cycle observability', () => {
    it('runArchiveCycle logs archive root absolute path at INFO level at cycle start', async () => {
      const provider = createMockProvider([]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      await service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();

      const infoCalls = vi.mocked(logger.info).mock.calls.map((c) => String(c[0]));
      const cycleStartCall = infoCalls.find(
        (msg) =>
          msg.includes('Archive cycle starting') &&
          msg.includes('/workspace/docs/archive/agent-sessions')
      );
      expect(cycleStartCall).toBeDefined();

      service.dispose();
    });
  });

  describe('archiveSession — empty archiveFileName guard', () => {
    it('archiveSession with empty archiveFileName in existing entry does not call delete on archiveUri directly', async () => {
      const session = createMockSession({ mtime: 2000, ctime: 900 });
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      (
        service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
      )._currentConfig = DEFAULT_CONFIG;

      // Prime lastArchivedMap with empty archiveFileName (empty-session skip records '')
      (service as any).lastArchivedMap.set(session.archiveName, {
        mtime: 1000,
        archiveFileName: '',
      });

      const newArchiveFileName = '2026/06/202606010000-test-session.json';
      vi.spyOn(service as any, 'writeArchiveFile').mockResolvedValue({
        fileName: newArchiveFileName,
        companionPartial: false,
      });
      workspace.fs.delete = vi.fn().mockResolvedValue(undefined);

      await service.runArchiveCycle(true);

      expect(workspace.fs.delete).not.toHaveBeenCalled();

      service.dispose();
    });
  });
});
