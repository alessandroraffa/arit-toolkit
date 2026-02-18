import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workspace } from '../../mocks/vscode';
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

      service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();

      expect(provider.findSessions).toHaveBeenCalledWith('/workspace');
      expect(workspace.fs.copy).toHaveBeenCalled();

      service.dispose();
    });

    it('should stop interval on stop()', () => {
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );

      service.start(DEFAULT_CONFIG);
      service.stop();

      expect(logger.info).toHaveBeenCalledWith('Agent sessions archiving stopped');

      service.dispose();
    });

    it('should expose current config', () => {
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );

      expect(service.currentConfig).toBeUndefined();
      service.start(DEFAULT_CONFIG);
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
      service.start(DEFAULT_CONFIG);

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
      service.start(DEFAULT_CONFIG);

      await service.runArchiveCycle();

      const copyCall = vi.mocked(workspace.fs.copy).mock.calls[0]!;
      const destPath = (copyCall[1] as { fsPath: string }).fsPath;
      expect(destPath).toContain('202101010000-test-session.json');
      expect(destPath).not.toContain('202102010000');

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
      service.start(DEFAULT_CONFIG);

      await service.runArchiveCycle();
      vi.mocked(workspace.fs.copy).mockClear();

      await service.runArchiveCycle();

      expect(workspace.fs.copy).not.toHaveBeenCalled();

      service.dispose();
    });

    it('should replace old archive when mtime changes', async () => {
      const session = createMockSession({ mtime: 1000 });
      const provider = createMockProvider([session]);
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();

      // Update mtime
      const updatedSession = createMockSession({ mtime: 2000 });
      vi.mocked(provider.findSessions).mockResolvedValue([updatedSession]);
      vi.mocked(workspace.fs.copy).mockClear();

      await service.runArchiveCycle();

      expect(workspace.fs.delete).toHaveBeenCalled();
      expect(workspace.fs.copy).toHaveBeenCalled();

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
      service.start(DEFAULT_CONFIG);

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
      service.start(DEFAULT_CONFIG);
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
      service.start({ ...DEFAULT_CONFIG, ignoreSessionsBefore: '20250101' });

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
      service.start({ ...DEFAULT_CONFIG, ignoreSessionsBefore: '20250101' });

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
      service.start(DEFAULT_CONFIG);

      await service.runArchiveCycle();

      expect(workspace.fs.copy).toHaveBeenCalled();

      service.dispose();
    });
  });

  describe('reconfigure', () => {
    it('should start when transitioning from no config to enabled', async () => {
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );

      await service.reconfigure(undefined, DEFAULT_CONFIG);

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
      service.start(DEFAULT_CONFIG);

      await service.reconfigure(DEFAULT_CONFIG, { ...DEFAULT_CONFIG, enabled: false });

      expect(logger.info).toHaveBeenCalledWith('Agent sessions archiving stopped');

      service.dispose();
    });

    it('should move archive when path changes', async () => {
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([['file1.json', 1]]);
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      service.start(DEFAULT_CONFIG);

      const newConfig = { ...DEFAULT_CONFIG, archivePath: 'new/archive/path' };
      await service.reconfigure(DEFAULT_CONFIG, newConfig);

      expect(workspace.fs.copy).toHaveBeenCalled();
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
      service.start(DEFAULT_CONFIG);

      const newConfig = { ...DEFAULT_CONFIG, archivePath: 'new/path' };
      await service.reconfigure(DEFAULT_CONFIG, newConfig);

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

      await service.reconfigure(undefined, { ...DEFAULT_CONFIG, enabled: false });

      expect(service.currentConfig).toBeUndefined();

      service.dispose();
    });
  });

  describe('dispose', () => {
    it('should stop interval on dispose', () => {
      const provider = createMockProvider();
      const service = new AgentSessionArchiveService(
        workspaceRootUri,
        [provider],
        logger as any
      );
      service.start(DEFAULT_CONFIG);
      service.dispose();

      expect(logger.info).toHaveBeenCalledWith('Agent sessions archiving stopped');
    });
  });
});
