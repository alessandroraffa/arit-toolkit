import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, window, mockFileSystemWatcher } from '../mocks/vscode';
import { ExtensionStateManager } from '../../../src/core/extensionStateManager';

describe('ExtensionStateManager', () => {
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    workspace.workspaceFolders = undefined;
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };
  });

  describe('workspace mode detection', () => {
    it('should detect no-workspace when workspaceFolders is undefined', () => {
      workspace.workspaceFolders = undefined;

      const manager = new ExtensionStateManager(mockLogger as any);

      expect(manager.workspaceMode).toBe('no-workspace');
      expect(manager.isSingleRoot).toBe(false);
      expect(manager.isToggleable).toBe(false);
    });

    it('should detect no-workspace when workspaceFolders is empty', () => {
      workspace.workspaceFolders = [];

      const manager = new ExtensionStateManager(mockLogger as any);

      expect(manager.workspaceMode).toBe('no-workspace');
    });

    it('should detect single-root when one workspace folder exists', () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

      const manager = new ExtensionStateManager(mockLogger as any);

      expect(manager.workspaceMode).toBe('single-root');
      expect(manager.isSingleRoot).toBe(true);
      expect(manager.isToggleable).toBe(true);
    });

    it('should detect multi-root when multiple workspace folders exist', () => {
      workspace.workspaceFolders = [
        { uri: { fsPath: '/workspace1' } },
        { uri: { fsPath: '/workspace2' } },
      ];

      const manager = new ExtensionStateManager(mockLogger as any);

      expect(manager.workspaceMode).toBe('multi-root');
      expect(manager.isSingleRoot).toBe(false);
      expect(manager.isToggleable).toBe(false);
    });
  });

  describe('default state', () => {
    it('should be disabled by default', () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

      const manager = new ExtensionStateManager(mockLogger as any);

      expect(manager.isEnabled).toBe(false);
      expect(manager.isInitialized).toBe(false);
    });

    it('should be disabled in multi-root', () => {
      workspace.workspaceFolders = [
        { uri: { fsPath: '/w1' } },
        { uri: { fsPath: '/w2' } },
      ];

      const manager = new ExtensionStateManager(mockLogger as any);

      expect(manager.isEnabled).toBe(false);
    });

    it('should be disabled in no-workspace', () => {
      workspace.workspaceFolders = undefined;

      const manager = new ExtensionStateManager(mockLogger as any);

      expect(manager.isEnabled).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should skip initialization for non-single-root workspace', async () => {
      workspace.workspaceFolders = undefined;

      const manager = new ExtensionStateManager(mockLogger as any);

      await manager.initialize();

      expect(workspace.fs.readFile).not.toHaveBeenCalled();
    });

    it('should read state from file when it exists', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      const configContent = '{ "enabled": true }';
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode(configContent));
      window.showInformationMessage = vi.fn();

      const manager = new ExtensionStateManager(mockLogger as any);

      await manager.initialize();

      expect(manager.isInitialized).toBe(true);
      expect(manager.isEnabled).toBe(true);
    });

    it('should fire onDidChangeState after reading existing config', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode('{ "enabled": true }'));

      const manager = new ExtensionStateManager(mockLogger as any);
      const stateChanges: boolean[] = [];
      manager.onDidChangeState((state) => {
        stateChanges.push(state);
      });

      await manager.initialize();

      expect(stateChanges).toEqual([true]);
    });

    it('should show onboarding notification when file does not exist', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('File not found'));
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);

      const manager = new ExtensionStateManager(mockLogger as any);

      await manager.initialize();

      expect(manager.isInitialized).toBe(false);
      expect(manager.isEnabled).toBe(false);
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'ARIT Toolkit: Initialize this workspace for advanced features?',
        'Initialize'
      );
    });

    it('should initialize workspace when user accepts onboarding', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('File not found'));
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      window.showInformationMessage = vi.fn().mockResolvedValue('Initialize');

      const manager = new ExtensionStateManager(mockLogger as any);

      await manager.initialize();

      expect(manager.isInitialized).toBe(true);
      expect(manager.isEnabled).toBe(true);
      expect(workspace.fs.writeFile).toHaveBeenCalled();
    });

    it('should set up file watcher in single-root', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode('{ "enabled": false }'));

      const manager = new ExtensionStateManager(mockLogger as any);

      await manager.initialize();

      expect(workspace.createFileSystemWatcher).toHaveBeenCalled();
    });
  });

  describe('toggle', () => {
    it('should return false for non-single-root workspace', async () => {
      workspace.workspaceFolders = undefined;

      const manager = new ExtensionStateManager(mockLogger as any);

      const result = await manager.toggle();

      expect(result).toBe(false);
    });

    it('should show onboarding when not initialized', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);

      const manager = new ExtensionStateManager(mockLogger as any);

      const result = await manager.toggle();

      expect(result).toBe(false);
      expect(window.showInformationMessage).toHaveBeenCalled();
    });

    it('should initialize workspace when user accepts during toggle', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      window.showInformationMessage = vi.fn().mockResolvedValue('Initialize');

      const manager = new ExtensionStateManager(mockLogger as any);

      const result = await manager.toggle();

      expect(result).toBe(true);
      expect(manager.isEnabled).toBe(true);
      expect(manager.isInitialized).toBe(true);
    });

    it('should flip from enabled to disabled when initialized', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode('{ "enabled": true }'));
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

      const manager = new ExtensionStateManager(mockLogger as any);
      await manager.initialize();

      expect(manager.isEnabled).toBe(true);

      const result = await manager.toggle();

      expect(result).toBe(false);
      expect(manager.isEnabled).toBe(false);
    });

    it('should flip from disabled to enabled when initialized', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode('{ "enabled": false }'));
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

      const manager = new ExtensionStateManager(mockLogger as any);
      await manager.initialize();

      expect(manager.isEnabled).toBe(false);

      const result = await manager.toggle();

      expect(result).toBe(true);
      expect(manager.isEnabled).toBe(true);
    });

    it('should fire onDidChangeState when toggling', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode('{ "enabled": true }'));
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

      const manager = new ExtensionStateManager(mockLogger as any);
      await manager.initialize();

      const stateChanges: boolean[] = [];
      manager.onDidChangeState((state) => {
        stateChanges.push(state);
      });

      await manager.toggle();

      expect(stateChanges).toEqual([false]);
    });

    it('should write to file when toggling', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode('{ "enabled": true }'));
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

      const manager = new ExtensionStateManager(mockLogger as any);
      await manager.initialize();

      await manager.toggle();

      expect(workspace.fs.writeFile).toHaveBeenCalled();
      const writeCall = vi.mocked(workspace.fs.writeFile).mock.calls[0];
      const writtenContent = new TextDecoder().decode(writeCall[1] as Uint8Array);
      expect(writtenContent).toContain('"enabled": false');
    });
  });

  describe('showOnboardingNotification', () => {
    it('should return true when user accepts', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      window.showInformationMessage = vi.fn().mockResolvedValue('Initialize');

      const manager = new ExtensionStateManager(mockLogger as any);

      const result = await manager.showOnboardingNotification();

      expect(result).toBe(true);
      expect(manager.isEnabled).toBe(true);
    });

    it('should return false when user dismisses', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);

      const manager = new ExtensionStateManager(mockLogger as any);

      const result = await manager.showOnboardingNotification();

      expect(result).toBe(false);
      expect(manager.isEnabled).toBe(false);
    });
  });

  describe('file watcher', () => {
    it('should reload state when file changes externally', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode('{ "enabled": true }'));

      const manager = new ExtensionStateManager(mockLogger as any);
      await manager.initialize();

      // Capture the onDidChange handler
      const onDidChangeHandler = mockFileSystemWatcher.onDidChange.mock
        .calls[0][0] as () => Promise<void>;

      // Simulate external change to disabled
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode('{ "enabled": false }'));
      await onDidChangeHandler();

      expect(manager.isEnabled).toBe(false);
    });

    it('should handle file deletion', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode('{ "enabled": true }'));

      const manager = new ExtensionStateManager(mockLogger as any);
      await manager.initialize();

      expect(manager.isInitialized).toBe(true);

      const onDidDeleteHandler = mockFileSystemWatcher.onDidDelete.mock
        .calls[0][0] as () => void;
      onDidDeleteHandler();

      expect(manager.isInitialized).toBe(false);
      expect(manager.isEnabled).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should clean up watcher', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode('{ "enabled": true }'));

      const manager = new ExtensionStateManager(mockLogger as any);
      await manager.initialize();

      manager.dispose();

      expect(mockFileSystemWatcher.dispose).toHaveBeenCalled();
    });
  });
});
