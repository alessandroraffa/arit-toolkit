import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, window } from '../mocks/vscode';
import { ExtensionStateManager } from '../../../src/core/extensionStateManager';

describe('ExtensionStateManager – checkup', () => {
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let mockMigrationService: {
    migrate: ReturnType<typeof vi.fn>;
  };
  let mockAutoCommitService: {
    suspend: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    commitIfNeeded: ReturnType<typeof vi.fn>;
    onConfigWritten: ReturnType<typeof vi.fn>;
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
    mockAutoCommitService = {
      suspend: vi.fn(),
      resume: vi.fn(),
      commitIfNeeded: vi.fn().mockResolvedValue('no-changes'),
      onConfigWritten: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createManager(): ExtensionStateManager {
    const manager = new ExtensionStateManager(
      mockLogger as any,
      mockMigrationService as any
    );
    manager.setAutoCommitService(mockAutoCommitService as any);
    return manager;
  }

  function encode(content: string): Uint8Array {
    return new TextEncoder().encode(content);
  }

  it('should return not-applicable for non-single-root workspace', async () => {
    workspace.workspaceFolders = undefined;

    const manager = new ExtensionStateManager(
      mockLogger as any,
      mockMigrationService as any
    );
    const result = await manager.checkup();

    expect(result).toEqual({
      configUpdated: false,
      commitResult: 'not-applicable',
    });
  });

  it('should return not-applicable when extensionVersion not set', async () => {
    const manager = createManager();
    const result = await manager.checkup();

    expect(result).toEqual({
      configUpdated: false,
      commitResult: 'not-applicable',
    });
  });

  it('should suspend and resume auto-commit service', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(encode('{ "enabled": true, "versionCode": 1001000000 }'));

    const manager = createManager();
    await manager.initialize('1.0.0');

    await manager.checkup();

    expect(mockAutoCommitService.suspend).toHaveBeenCalled();
    expect(mockAutoCommitService.resume).toHaveBeenCalled();
  });

  it('should resume auto-commit even when an error occurs', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(encode('{ "enabled": true, "versionCode": 1001000000 }'));

    const manager = createManager();
    await manager.initialize('1.0.0');

    mockMigrationService.migrate.mockRejectedValue(new Error('migration error'));

    await expect(manager.checkup()).rejects.toThrow('migration error');
    expect(mockAutoCommitService.resume).toHaveBeenCalled();
  });

  it('should return configUpdated=false when config is up to date', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(encode('{ "enabled": true, "versionCode": 1001000000 }'));

    const manager = createManager();
    await manager.initialize('1.0.0');

    const result = await manager.checkup();

    expect(result.configUpdated).toBe(false);
  });

  it('should return configUpdated=true when migration updates config', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(encode('{ "enabled": true, "versionCode": 1001000000 }'));
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);

    const manager = createManager();
    await manager.initialize('1.0.0');

    mockMigrationService.migrate.mockResolvedValue({
      enabled: true,
      versionCode: 1001001000,
      version: '1.1.0',
    });

    const result = await manager.checkup();

    expect(result.configUpdated).toBe(true);
  });

  it('should call commitIfNeeded after migration', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(encode('{ "enabled": true, "versionCode": 1001000000 }'));

    const manager = createManager();
    await manager.initialize('1.0.0');

    mockAutoCommitService.commitIfNeeded.mockResolvedValue('committed');
    const result = await manager.checkup();

    expect(mockAutoCommitService.commitIfNeeded).toHaveBeenCalled();
    expect(result.commitResult).toBe('committed');
  });

  it('should return not-applicable commitResult when no auto-commit service', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(encode('{ "enabled": true, "versionCode": 1001000000 }'));

    const manager = new ExtensionStateManager(
      mockLogger as any,
      mockMigrationService as any
    );
    await manager.initialize('1.0.0');

    const result = await manager.checkup();

    expect(result.commitResult).toBe('not-applicable');
  });

  it('should fire onDidChangeState during checkup', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(encode('{ "enabled": true, "versionCode": 1001000000 }'));

    const manager = createManager();
    await manager.initialize('1.0.0');

    const stateChanges: boolean[] = [];
    manager.onDidChangeState((state) => stateChanges.push(state));
    await manager.checkup();

    expect(stateChanges).toEqual([true]);
  });

  it('should show onboarding and return configUpdated=true when accepted', async () => {
    workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('File not found'));
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);

    const manager = createManager();
    await manager.initialize('1.0.0');

    window.showInformationMessage = vi.fn().mockResolvedValue('Initialize');

    const result = await manager.checkup();

    expect(result.configUpdated).toBe(true);
  });

  it('should return early when onboarding is declined', async () => {
    workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('File not found'));
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);

    const manager = createManager();
    await manager.initialize('1.0.0');

    const result = await manager.checkup();

    expect(result).toEqual({
      configUpdated: false,
      commitResult: 'not-applicable',
    });
    expect(mockMigrationService.migrate).not.toHaveBeenCalled();
  });

  it('should run migration even when extension is disabled', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(encode('{ "enabled": false, "versionCode": 1001000000 }'));

    const manager = createManager();
    await manager.initialize('1.0.0');
    mockMigrationService.migrate.mockClear();

    await manager.checkup();

    expect(mockMigrationService.migrate).toHaveBeenCalled();
  });
});
