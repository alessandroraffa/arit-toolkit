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
  let mockMigrationService: {
    migrate: ReturnType<typeof vi.fn>;
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
    mockMigrationService = {
      migrate: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createManager(): ExtensionStateManager {
    return new ExtensionStateManager(mockLogger as any, mockMigrationService as any);
  }

  describe('workspace mode detection', () => {
    it('should detect no-workspace when workspaceFolders is undefined', () => {
      workspace.workspaceFolders = undefined;

      const manager = createManager();

      expect(manager.workspaceMode).toBe('no-workspace');
      expect(manager.isSingleRoot).toBe(false);
      expect(manager.isToggleable).toBe(false);
    });

    it('should detect no-workspace when workspaceFolders is empty', () => {
      workspace.workspaceFolders = [];

      const manager = createManager();

      expect(manager.workspaceMode).toBe('no-workspace');
    });

    it('should detect single-root when one workspace folder exists', () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

      const manager = createManager();

      expect(manager.workspaceMode).toBe('single-root');
      expect(manager.isSingleRoot).toBe(true);
      expect(manager.isToggleable).toBe(true);
      expect(manager.workspaceRootUri).toBeDefined();
    });

    it('should detect multi-root when multiple workspace folders exist', () => {
      workspace.workspaceFolders = [
        { uri: { fsPath: '/workspace1' } },
        { uri: { fsPath: '/workspace2' } },
      ];

      const manager = createManager();

      expect(manager.workspaceMode).toBe('multi-root');
      expect(manager.isSingleRoot).toBe(false);
      expect(manager.isToggleable).toBe(false);
    });
  });

  describe('default state', () => {
    it('should be disabled by default', () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

      const manager = createManager();

      expect(manager.isEnabled).toBe(false);
      expect(manager.isInitialized).toBe(false);
    });

    it('should be disabled in multi-root', () => {
      workspace.workspaceFolders = [
        { uri: { fsPath: '/w1' } },
        { uri: { fsPath: '/w2' } },
      ];

      const manager = createManager();

      expect(manager.isEnabled).toBe(false);
    });

    it('should be disabled in no-workspace', () => {
      workspace.workspaceFolders = undefined;

      const manager = createManager();

      expect(manager.isEnabled).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should skip initialization for non-single-root workspace', async () => {
      workspace.workspaceFolders = undefined;

      const manager = createManager();
      await manager.initialize('1.0.0');

      expect(workspace.fs.readFile).not.toHaveBeenCalled();
    });

    it('should read state from file when it exists', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      const configContent = '{ "enabled": true, "versionCode": 1001000000 }';
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode(configContent));

      const manager = createManager();
      await manager.initialize('1.0.0');

      expect(manager.isInitialized).toBe(true);
      expect(manager.isEnabled).toBe(true);
    });

    it('should fire onDidChangeState after reading existing config', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": true, "versionCode": 1001000000 }')
        );

      const manager = createManager();
      const stateChanges: boolean[] = [];
      manager.onDidChangeState((state) => {
        stateChanges.push(state);
      });
      await manager.initialize('1.0.0');

      expect(stateChanges).toEqual([true]);
    });

    it('should call migrationService.migrate after reading config', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": true, "versionCode": 1001000000 }')
        );

      const manager = createManager();
      await manager.initialize('1.0.0');

      expect(mockMigrationService.migrate).toHaveBeenCalledWith(
        { enabled: true, versionCode: 1001000000 },
        1001000000,
        '1.0.0'
      );
    });

    it('should write merged config when migration returns result', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": true, "versionCode": 1001000000 }')
        );
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      mockMigrationService.migrate.mockResolvedValue({
        enabled: true,
        version: '1.3.0',
        versionCode: 1001003000,
        featureA: { enabled: true },
      });

      const manager = createManager();
      await manager.initialize('1.3.0');

      expect(workspace.fs.writeFile).toHaveBeenCalled();
      const writeCall = vi.mocked(workspace.fs.writeFile).mock.calls[0];
      const writtenContent = new TextDecoder().decode(writeCall[1] as Uint8Array);
      expect(writtenContent).toContain('"featureA"');
      expect(writtenContent).toContain('"version": "1.3.0"');
    });

    it('should show onboarding notification when file does not exist', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('File not found'));
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);

      const manager = createManager();
      await manager.initialize('1.0.0');

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

      const manager = createManager();
      await manager.initialize('1.0.0');

      expect(manager.isInitialized).toBe(true);
      expect(manager.isEnabled).toBe(true);
      expect(workspace.fs.writeFile).toHaveBeenCalled();
    });

    it('should set up file watcher in single-root', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": false, "versionCode": 1001000000 }')
        );

      const manager = createManager();
      await manager.initialize('1.0.0');

      expect(workspace.createFileSystemWatcher).toHaveBeenCalled();
    });
  });

  describe('toggle', () => {
    it('should return false for non-single-root workspace', async () => {
      workspace.workspaceFolders = undefined;

      const manager = createManager();
      const result = await manager.toggle();

      expect(result).toBe(false);
    });

    it('should show onboarding when not initialized', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);

      const manager = createManager();
      const result = await manager.toggle();

      expect(result).toBe(false);
      expect(window.showInformationMessage).toHaveBeenCalled();
    });

    it('should initialize workspace when user accepts during toggle', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      window.showInformationMessage = vi.fn().mockResolvedValue('Initialize');

      const manager = createManager();
      const result = await manager.toggle();

      expect(result).toBe(true);
      expect(manager.isEnabled).toBe(true);
      expect(manager.isInitialized).toBe(true);
    });

    it('should flip from enabled to disabled when initialized', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": true, "versionCode": 1001000000 }')
        );
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

      const manager = createManager();
      await manager.initialize('1.0.0');
      expect(manager.isEnabled).toBe(true);

      const result = await manager.toggle();

      expect(result).toBe(false);
      expect(manager.isEnabled).toBe(false);
    });

    it('should flip from disabled to enabled when initialized', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": false, "versionCode": 1001000000 }')
        );
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

      const manager = createManager();
      await manager.initialize('1.0.0');
      expect(manager.isEnabled).toBe(false);

      const result = await manager.toggle();

      expect(result).toBe(true);
      expect(manager.isEnabled).toBe(true);
    });

    it('should fire onDidChangeState when toggling', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": true, "versionCode": 1001000000 }')
        );
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

      const manager = createManager();
      await manager.initialize('1.0.0');

      const stateChanges: boolean[] = [];
      manager.onDidChangeState((state) => {
        stateChanges.push(state);
      });
      await manager.toggle();

      expect(stateChanges).toEqual([false]);
    });

    it('should preserve full config when toggling', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode(
            '{ "enabled": true, "versionCode": 1001000000, "featureA": { "active": true } }'
          )
        );
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

      const manager = createManager();
      await manager.initialize('1.0.0');
      await manager.toggle();

      const writeCall = vi.mocked(workspace.fs.writeFile).mock.calls[0];
      const writtenContent = new TextDecoder().decode(writeCall[1] as Uint8Array);
      expect(writtenContent).toContain('"enabled": false');
      expect(writtenContent).toContain('"featureA"');
    });
  });

  describe('showOnboardingNotification', () => {
    it('should return true when user accepts', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      window.showInformationMessage = vi.fn().mockResolvedValue('Initialize');

      const manager = createManager();
      const result = await manager.showOnboardingNotification();

      expect(result).toBe(true);
      expect(manager.isEnabled).toBe(true);
    });

    it('should return false when user dismisses', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);

      const manager = createManager();
      const result = await manager.showOnboardingNotification();

      expect(result).toBe(false);
      expect(manager.isEnabled).toBe(false);
    });
  });

  describe('getConfigSection', () => {
    it('should return section value from full config', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode(
            '{ "enabled": true, "versionCode": 1001000000, "myFeature": { "active": true } }'
          )
        );

      const manager = createManager();
      await manager.initialize('1.0.0');

      const section = manager.getConfigSection('myFeature') as
        | { active: boolean }
        | undefined;
      expect(section).toEqual({ active: true });
    });

    it('should return undefined for missing section', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": true, "versionCode": 1001000000 }')
        );

      const manager = createManager();
      await manager.initialize('1.0.0');

      expect(manager.getConfigSection('nonexistent')).toBeUndefined();
    });

    it('should return undefined when config not loaded', () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

      const manager = createManager();

      expect(manager.getConfigSection('any')).toBeUndefined();
    });
  });

  describe('onConfigSectionChanged', () => {
    it('should notify listener when section changes via file watcher', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode(
            '{ "enabled": true, "versionCode": 1001000000, "myFeature": { "active": false } }'
          )
        );

      const manager = createManager();
      await manager.initialize('1.0.0');

      const changes: unknown[] = [];
      manager.onConfigSectionChanged('myFeature', (value) => {
        changes.push(value);
      });

      // Simulate external file change with updated section
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode(
            '{ "enabled": true, "versionCode": 1001000000, "myFeature": { "active": true } }'
          )
        );
      const reloadHandler = mockFileSystemWatcher.onDidChange.mock
        .calls[0][0] as () => Promise<void>;
      await reloadHandler();

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({ active: true });
    });

    it('should not notify when section value has not changed', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      const configContent =
        '{ "enabled": true, "versionCode": 1001000000, "myFeature": { "active": false } }';
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode(configContent));

      const manager = createManager();
      await manager.initialize('1.0.0');

      const changes: unknown[] = [];
      manager.onConfigSectionChanged('myFeature', (value) => {
        changes.push(value);
      });

      // Re-read same content
      const reloadHandler = mockFileSystemWatcher.onDidChange.mock
        .calls[0][0] as () => Promise<void>;
      await reloadHandler();

      expect(changes).toHaveLength(0);
    });

    it('should stop notifying after dispose', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode(
            '{ "enabled": true, "versionCode": 1001000000, "myFeature": { "v": 1 } }'
          )
        );

      const manager = createManager();
      await manager.initialize('1.0.0');

      const changes: unknown[] = [];
      const disposable = manager.onConfigSectionChanged('myFeature', (value) => {
        changes.push(value);
      });
      disposable.dispose();

      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode(
            '{ "enabled": true, "versionCode": 1001000000, "myFeature": { "v": 2 } }'
          )
        );
      const reloadHandler = mockFileSystemWatcher.onDidChange.mock
        .calls[0][0] as () => Promise<void>;
      await reloadHandler();

      expect(changes).toHaveLength(0);
    });
  });

  describe('updateConfigSection', () => {
    it('should update section and write to file', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode(
            '{ "enabled": true, "versionCode": 1001000000, "myFeature": { "active": false } }'
          )
        );
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

      const manager = createManager();
      await manager.initialize('1.0.0');

      await manager.updateConfigSection('myFeature', { active: true });

      expect(workspace.fs.writeFile).toHaveBeenCalled();
      const writeCall = vi.mocked(workspace.fs.writeFile).mock.calls[0];
      const writtenContent = new TextDecoder().decode(writeCall[1] as Uint8Array);
      expect(writtenContent).toContain('"active": true');
    });

    it('should notify section listeners on update', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode(
            '{ "enabled": true, "versionCode": 1001000000, "myFeature": { "v": 1 } }'
          )
        );
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

      const manager = createManager();
      await manager.initialize('1.0.0');

      const changes: unknown[] = [];
      manager.onConfigSectionChanged('myFeature', (value) => {
        changes.push(value);
      });

      await manager.updateConfigSection('myFeature', { v: 2 });

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({ v: 2 });
    });

    it('should do nothing when config not loaded', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

      const manager = createManager();

      await manager.updateConfigSection('myFeature', { v: 1 });

      expect(workspace.fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('file watcher', () => {
    it('should reload state when file changes externally', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": true, "versionCode": 1001000000 }')
        );

      const manager = createManager();
      await manager.initialize('1.0.0');

      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": false, "versionCode": 1001000000 }')
        );
      const reloadHandler = mockFileSystemWatcher.onDidChange.mock
        .calls[0][0] as () => Promise<void>;
      await reloadHandler();

      expect(manager.isEnabled).toBe(false);
    });

    it('should handle file deletion', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": true, "versionCode": 1001000000 }')
        );

      const manager = createManager();
      await manager.initialize('1.0.0');
      expect(manager.isInitialized).toBe(true);

      const onDidDeleteHandler = mockFileSystemWatcher.onDidDelete.mock
        .calls[0][0] as () => void;
      onDidDeleteHandler();

      expect(manager.isInitialized).toBe(false);
      expect(manager.isEnabled).toBe(false);
    });
  });

  describe('migration', () => {
    it('should not show notification when config is up to date', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": true, "versionCode": 1001000000 }')
        );
      mockMigrationService.migrate.mockResolvedValue(undefined);

      const manager = createManager();
      await manager.initialize('1.0.0');

      expect(workspace.fs.writeFile).not.toHaveBeenCalled();
    });

    it('should write migrated config when migration returns result', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode('{ "enabled": true }'));
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      mockMigrationService.migrate.mockResolvedValue({
        enabled: true,
        version: '1.2.3',
        versionCode: 1001002003,
      });

      const manager = createManager();
      await manager.initialize('1.2.3');

      expect(workspace.fs.writeFile).toHaveBeenCalled();
      const writeCall = vi.mocked(workspace.fs.writeFile).mock.calls[0];
      const writtenContent = new TextDecoder().decode(writeCall[1] as Uint8Array);
      expect(writtenContent).toContain('"version": "1.2.3"');
      expect(writtenContent).toContain('"versionCode": 1001002003');
    });

    it('should notify section listeners after migration', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": true, "versionCode": 1001000000 }')
        );
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      mockMigrationService.migrate.mockResolvedValue({
        enabled: true,
        version: '1.3.0',
        versionCode: 1001003000,
        newFeature: { active: true },
      });

      const manager = createManager();
      const changes: unknown[] = [];
      manager.onConfigSectionChanged('newFeature', (value) => {
        changes.push(value);
      });
      await manager.initialize('1.3.0');

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({ active: true });
    });

    it('should include version info when initializing workspace', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('File not found'));
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      window.showInformationMessage = vi.fn().mockResolvedValue('Initialize');

      const manager = createManager();
      await manager.initialize('2.5.0');

      const writeCall = vi.mocked(workspace.fs.writeFile).mock.calls[0];
      const writtenContent = new TextDecoder().decode(writeCall[1] as Uint8Array);
      expect(writtenContent).toContain('"version": "2.5.0"');
      expect(writtenContent).toContain('"versionCode": 1002005000');
    });
  });

  describe('dispose', () => {
    it('should clean up watcher', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": true, "versionCode": 1001000000 }')
        );

      const manager = createManager();
      await manager.initialize('1.0.0');
      manager.dispose();

      expect(mockFileSystemWatcher.dispose).toHaveBeenCalled();
    });
  });
});
