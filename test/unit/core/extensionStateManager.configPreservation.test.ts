import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, window, mockFileSystemWatcher } from '../mocks/vscode';
import { ExtensionStateManager } from '../../../src/core/extensionStateManager';

const FULL_CONFIG = JSON.stringify({
  enabled: true,
  versionCode: 1001000000,
  agentSessionsArchiving: {
    enabled: true,
    archivePath: 'docs/archive/agent-sessions',
    intervalMinutes: 5,
  },
});

describe('ExtensionStateManager – config preservation', () => {
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let mockMigrationService: {
    migrate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };
    mockMigrationService = {
      migrate: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createManager(): ExtensionStateManager {
    return new ExtensionStateManager(mockLogger as any, mockMigrationService as any);
  }

  function encode(content: string): Uint8Array {
    return new TextEncoder().encode(content);
  }

  function getWrittenContent(): string {
    const writeCall = vi.mocked(workspace.fs.writeFile).mock.calls[0];
    return new TextDecoder().decode(writeCall[1] as Uint8Array);
  }

  describe('readStateFromFile – transient failure handling', () => {
    it('should preserve fullConfig on transient read failure', async () => {
      workspace.fs.readFile = vi.fn().mockResolvedValue(encode(FULL_CONFIG));

      const manager = createManager();
      await manager.initialize('1.0.0');

      expect(manager.isInitialized).toBe(true);
      expect(manager.getConfigSection('agentSessionsArchiving')).toBeDefined();

      // Simulate transient I/O failure via file watcher reload
      workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('EBUSY'));
      const reloadHandler = mockFileSystemWatcher.onDidChange.mock
        .calls[0][0] as () => Promise<void>;
      await reloadHandler();

      expect(manager.isInitialized).toBe(true);
      expect(manager.isEnabled).toBe(true);
      expect(manager.getConfigSection('agentSessionsArchiving')).toEqual({
        enabled: true,
        archivePath: 'docs/archive/agent-sessions',
        intervalMinutes: 5,
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('keeping existing state')
      );
    });

    it('should still reset state on first read failure', async () => {
      workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('File not found'));
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);

      const manager = createManager();
      await manager.initialize('1.0.0');

      expect(manager.isInitialized).toBe(false);
      expect(manager.getConfigSection('agentSessionsArchiving')).toBeUndefined();
    });
  });

  describe('initializeWorkspace – re-reads file before writing', () => {
    it('should preserve existing sections when file exists on disk', async () => {
      // First read fails → user dismisses onboarding
      workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('File not found'));
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
      const manager = createManager();
      await manager.initialize('1.0.0');

      // Now the file "appears" on disk with sections
      workspace.fs.readFile = vi.fn().mockResolvedValue(encode(FULL_CONFIG));
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

      await manager.initializeWorkspace();

      expect(workspace.fs.writeFile).toHaveBeenCalled();
      const content = getWrittenContent();
      expect(content).toContain('"agentSessionsArchiving"');
      expect(content).toContain('"archivePath"');
      expect(content).toContain('"enabled": true');
    });

    it('should work normally when no file exists on disk', async () => {
      workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('File not found'));
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);

      const manager = createManager();
      await manager.initialize('1.0.0');
      await manager.initializeWorkspace();

      expect(workspace.fs.writeFile).toHaveBeenCalled();
      const content = getWrittenContent();
      expect(content).toContain('"enabled": true');
      expect(content).not.toContain('"agentSessionsArchiving"');
    });
  });

  describe('reinitialize – migration after onboarding', () => {
    it('should run migration after onboarding acceptance', async () => {
      workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('File not found'));
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);

      const manager = createManager();
      await manager.initialize('1.0.0');

      // Reinitialize: file still missing, user accepts onboarding
      mockMigrationService.migrate.mockClear();
      window.showInformationMessage = vi.fn().mockResolvedValue('Initialize');

      await manager.reinitialize();

      expect(mockMigrationService.migrate).toHaveBeenCalled();
    });

    it('should not run migration when user dismisses onboarding', async () => {
      workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('File not found'));
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);

      const manager = createManager();
      await manager.initialize('1.0.0');

      mockMigrationService.migrate.mockClear();

      await manager.reinitialize();

      expect(mockMigrationService.migrate).not.toHaveBeenCalled();
    });
  });

  describe('toggle – preserves sections', () => {
    it('should preserve sections when file exists but isInitialized is false', async () => {
      // First read fails → not initialized, user dismisses
      workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('File not found'));
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
      const manager = createManager();
      await manager.initialize('1.0.0');
      expect(manager.isInitialized).toBe(false);

      // Now file exists on disk with sections
      workspace.fs.readFile = vi.fn().mockResolvedValue(encode(FULL_CONFIG));
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      window.showInformationMessage = vi.fn().mockResolvedValue('Initialize');

      await manager.toggle();

      expect(workspace.fs.writeFile).toHaveBeenCalled();
      const content = getWrittenContent();
      expect(content).toContain('"agentSessionsArchiving"');
      expect(content).toContain('"archivePath"');
    });
  });
});
