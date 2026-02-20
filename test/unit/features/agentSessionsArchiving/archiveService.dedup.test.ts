import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workspace, FileType } from '../../mocks/vscode';
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

function createMockProvider() {
  return {
    name: 'test-provider',
    displayName: 'Test Provider',
    findSessions: vi.fn().mockResolvedValue([]),
  };
}

const DEFAULT_CONFIG: AgentSessionsArchivingConfig = {
  enabled: true,
  archivePath: 'docs/archive/agent-sessions',
  intervalMinutes: 5,
};

describe('AgentSessionArchiveService – deduplication', () => {
  let logger: ReturnType<typeof createMockLogger>;
  const workspaceRootUri = { fsPath: '/workspace' } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    logger = createMockLogger();
    workspace.fs.copy = vi.fn().mockResolvedValue(undefined);
    workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createService(): AgentSessionArchiveService {
    const provider = createMockProvider();
    return new AgentSessionArchiveService(workspaceRootUri, [provider], logger as any);
  }

  describe('duplicate removal', () => {
    it('should remove older duplicate and keep the newer file', async () => {
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([
        ['202501010000-claude-code-abc.md', FileType.File],
        ['202602150930-claude-code-abc.md', FileType.File],
      ]);

      const service = createService();
      service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();

      expect(workspace.fs.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          fsPath: expect.stringContaining('202501010000-claude-code-abc.md'),
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Removed duplicate archive: 202501010000-claude-code-abc.md'
        )
      );

      service.dispose();
    });

    it('should handle three or more duplicates keeping only the newest', async () => {
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([
        ['202501010000-cline-task1.md', FileType.File],
        ['202503150000-cline-task1.md', FileType.File],
        ['202502100000-cline-task1.md', FileType.File],
      ]);

      const service = createService();
      service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();

      const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
      const deletedPaths = deleteCalls.map((c) => (c[0] as { fsPath: string }).fsPath);

      expect(deletedPaths).toEqual(
        expect.arrayContaining([
          expect.stringContaining('202501010000-cline-task1.md'),
          expect.stringContaining('202502100000-cline-task1.md'),
        ])
      );
      expect(deletedPaths).not.toEqual(
        expect.arrayContaining([expect.stringContaining('202503150000-cline-task1.md')])
      );

      service.dispose();
    });

    it('should not remove files with unique archiveNames', async () => {
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([
        ['202501010000-claude-code-abc.md', FileType.File],
        ['202502010000-cline-task1.md', FileType.File],
      ]);

      const service = createService();
      service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();

      expect(workspace.fs.delete).not.toHaveBeenCalled();

      service.dispose();
    });

    it('should handle empty archive directory', async () => {
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);

      const service = createService();
      service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();

      expect(workspace.fs.delete).not.toHaveBeenCalled();

      service.dispose();
    });

    it('should handle missing archive directory gracefully', async () => {
      workspace.fs.readDirectory = vi.fn().mockRejectedValue(new Error('not found'));

      const service = createService();
      service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();

      expect(workspace.fs.delete).not.toHaveBeenCalled();

      service.dispose();
    });

    it('should skip non-file entries', async () => {
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([
        ['202501010000-claude-code-abc.md', FileType.File],
        ['202602150930-claude-code-abc.md', FileType.Directory],
      ]);

      const service = createService();
      service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();

      expect(workspace.fs.delete).not.toHaveBeenCalled();

      service.dispose();
    });

    it('should skip files not matching the archive name pattern', async () => {
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([
        ['README.md', FileType.File],
        ['no-timestamp-prefix.md', FileType.File],
        ['202501010000-claude-code-abc.md', FileType.File],
      ]);

      const service = createService();
      service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();

      expect(workspace.fs.delete).not.toHaveBeenCalled();

      service.dispose();
    });
  });

  describe('map hydration', () => {
    it('should hydrate lastArchivedMap so archiveSession deletes old file', async () => {
      // Archive directory has an existing file from a previous run
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValue([['202501010000-test-session.json', FileType.File]]);

      const service = createService();
      service.start(DEFAULT_CONFIG);

      // Run first cycle — dedup hydrates the map
      // Then archiveSession would use the hydrated entry
      // We verify by running a cycle with a session that matches
      const provider = (service as any).providers[0];
      provider.findSessions.mockResolvedValue([
        {
          uri: { fsPath: '/source/session.json' },
          providerName: 'test-provider',
          archiveName: 'test-session',
          displayName: 'Test Session',
          mtime: 5000,
          ctime: 1_609_459_200_000,
          extension: '.json',
        },
      ]);

      await service.runArchiveCycle();

      // The old file should be deleted (hydrated entry triggers replacement)
      const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
      const deletedPaths = deleteCalls.map((c) => (c[0] as { fsPath: string }).fsPath);
      expect(deletedPaths).toEqual(
        expect.arrayContaining([
          expect.stringContaining('202501010000-test-session.json'),
        ])
      );

      service.dispose();
    });
  });

  describe('dedup flag', () => {
    it('should run dedup only on first cycle after start', async () => {
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([
        ['202501010000-claude-code-abc.md', FileType.File],
        ['202602150930-claude-code-abc.md', FileType.File],
      ]);

      const service = createService();
      service.start(DEFAULT_CONFIG);

      // First cycle — dedup runs, removes duplicate
      await service.runArchiveCycle();
      expect(workspace.fs.delete).toHaveBeenCalled();

      vi.mocked(workspace.fs.delete).mockClear();
      workspace.fs.readDirectory = vi
        .fn()
        .mockResolvedValue([['202602150930-claude-code-abc.md', FileType.File]]);

      // Second cycle — dedup does not run
      await service.runArchiveCycle();
      expect(workspace.fs.delete).not.toHaveBeenCalled();

      service.dispose();
    });

    it('should reset dedup flag on each start call', async () => {
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([
        ['202501010000-claude-code-abc.md', FileType.File],
        ['202602150930-claude-code-abc.md', FileType.File],
      ]);

      const service = createService();
      service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();
      expect(workspace.fs.delete).toHaveBeenCalled();

      vi.mocked(workspace.fs.delete).mockClear();

      // Re-start triggers dedup again
      service.start(DEFAULT_CONFIG);
      await service.runArchiveCycle();
      expect(workspace.fs.delete).toHaveBeenCalled();

      service.dispose();
    });
  });
});
