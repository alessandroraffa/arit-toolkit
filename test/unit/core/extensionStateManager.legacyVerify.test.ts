import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, window } from '../mocks/vscode';
import { ExtensionStateManager } from '../../../src/core/extensionStateManager';

describe('verifyLegacyConfigMigration', () => {
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

  it('should do nothing when .tangyr.jsonc exists and .arit-toolkit.jsonc is absent', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(
        new TextEncoder().encode('{ "enabled": true, "versionCode": 1001019000 }')
      );
    // Only .tangyr.jsonc is present; .arit-toolkit.jsonc is absent
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith('.arit-toolkit.jsonc')) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({});
    });
    workspace.fs.rename = vi.fn().mockResolvedValue(undefined);
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);

    const manager = createManager();
    await manager.initialize('1.19.0');

    expect(workspace.fs.rename).not.toHaveBeenCalled();
    const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
    const legacyDeleted = deleteCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith('.arit-toolkit.jsonc')
    );
    expect(legacyDeleted).toBe(false);
    expect(window.showInformationMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('migrated')
    );
    expect(window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('should migrate parseable legacy config when .tangyr.jsonc is absent', async () => {
    // Call #1: normal-flow .tangyr.jsonc read → rejects (absent)
    // Call #2: normal-flow legacy .arit-toolkit.jsonc fallback read → rejects (also absent in normal flow)
    // Call #3: backstop reads .arit-toolkit.jsonc → resolves with valid config
    workspace.fs.readFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('not found'))
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce(
        new TextEncoder().encode('{ "enabled": true, "versionCode": 1001018003 }')
      );
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith('.tangyr.jsonc'))
        return Promise.reject(new Error('not found'));
      if (uri.fsPath.endsWith('.arit-toolkit.jsonc')) return Promise.resolve({});
      // backup-path probe for .arit-toolkit.jsonc.bak → reject (path is free, no timestamp suffix)
      return Promise.reject(new Error('not found'));
    });
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    workspace.fs.rename = vi.fn().mockResolvedValue(undefined);
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);

    const manager = createManager();
    await manager.initialize('1.19.0');

    expect(workspace.fs.writeFile).toHaveBeenCalled();
    const renameCall = vi.mocked(workspace.fs.rename).mock.calls[0];
    expect(renameCall).toBeDefined();
    expect((renameCall![0] as { fsPath: string }).fsPath).toMatch(
      /\.arit-toolkit\.jsonc$/
    );
    expect((renameCall![1] as { fsPath: string }).fsPath).toMatch(
      /\.arit-toolkit\.jsonc\.bak$/
    );
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('migrated')
    );
    expect(manager.isInitialized).toBe(true);
    expect(manager.isEnabled).toBe(true);
  });

  it('should rename malformed legacy config and show warning when .tangyr.jsonc is absent', async () => {
    // All readFile calls reject: normal-flow .tangyr.jsonc, normal-flow legacy fallback, backstop attempt
    workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('not found'));
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith('.tangyr.jsonc'))
        return Promise.reject(new Error('not found'));
      if (uri.fsPath.endsWith('.arit-toolkit.jsonc')) return Promise.resolve({});
      // backup-path probe for .arit-toolkit.jsonc.malformed.bak → reject (path is free)
      return Promise.reject(new Error('not found'));
    });
    workspace.fs.rename = vi.fn().mockResolvedValue(undefined);
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);

    const manager = createManager();
    await manager.initialize('1.19.0');

    const renameCall = vi.mocked(workspace.fs.rename).mock.calls[0];
    expect(renameCall).toBeDefined();
    expect((renameCall![0] as { fsPath: string }).fsPath).toMatch(
      /\.arit-toolkit\.jsonc$/
    );
    expect((renameCall![1] as { fsPath: string }).fsPath).toMatch(
      /\.arit-toolkit\.jsonc\.malformed\.bak$/
    );
    expect(workspace.fs.writeFile).not.toHaveBeenCalled();
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('could not parse')
    );
  });

  it('should do nothing when neither .tangyr.jsonc nor .arit-toolkit.jsonc exists', async () => {
    workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('not found'));
    workspace.fs.stat = vi.fn().mockRejectedValue(new Error('not found'));
    workspace.fs.rename = vi.fn();
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);

    const manager = createManager();
    await manager.initialize('1.19.0');

    expect(workspace.fs.rename).not.toHaveBeenCalled();
    expect(window.showInformationMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('migrated')
    );
    expect(window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('should do nothing in a multi-root workspace', async () => {
    workspace.workspaceFolders = [{ uri: { fsPath: '/w1' } }, { uri: { fsPath: '/w2' } }];
    workspace.fs.stat = vi.fn();
    workspace.fs.rename = vi.fn();
    workspace.fs.readFile = vi.fn();

    const manager = createManager();
    await manager.initialize('1.19.0');

    expect(workspace.fs.stat).not.toHaveBeenCalled();
    expect(workspace.fs.rename).not.toHaveBeenCalled();
  });

  it('should append UTC timestamp suffix when .arit-toolkit.jsonc.bak already exists', async () => {
    // Same readFile mock as Test 2: Call #1 rejects, Call #2 rejects, Call #3 resolves
    workspace.fs.readFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('not found'))
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce(
        new TextEncoder().encode('{ "enabled": true, "versionCode": 1001018003 }')
      );
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith('.tangyr.jsonc'))
        return Promise.reject(new Error('not found'));
      if (uri.fsPath.endsWith('.arit-toolkit.jsonc') && !uri.fsPath.includes('.bak'))
        return Promise.resolve({});
      // .arit-toolkit.jsonc.bak already exists → resolve (collision → forces timestamp suffix)
      if (uri.fsPath.endsWith('.arit-toolkit.jsonc.bak')) return Promise.resolve({});
      return Promise.reject(new Error('not found'));
    });
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    workspace.fs.rename = vi.fn().mockResolvedValue(undefined);
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);

    const manager = createManager();
    await manager.initialize('1.19.0');

    const renameCall = vi.mocked(workspace.fs.rename).mock.calls[0];
    expect(renameCall).toBeDefined();
    const destPath = (renameCall![1] as { fsPath: string }).fsPath;
    expect(destPath).toMatch(/\.arit-toolkit\.jsonc\.bak\.\d{12}$/);
    expect(destPath).not.toMatch(/\/workspace\/\.arit-toolkit\.jsonc\.bak$/);
  });

  it('should update internal state so subsequent reads see the new config', async () => {
    // Same as Test 2
    workspace.fs.readFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('not found'))
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce(
        new TextEncoder().encode('{ "enabled": true, "versionCode": 1001018003 }')
      );
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith('.tangyr.jsonc'))
        return Promise.reject(new Error('not found'));
      if (uri.fsPath.endsWith('.arit-toolkit.jsonc')) return Promise.resolve({});
      // .arit-toolkit.jsonc.bak probe → reject (path is free)
      return Promise.reject(new Error('not found'));
    });
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    workspace.fs.rename = vi.fn().mockResolvedValue(undefined);
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);

    const manager = createManager();
    const stateChanges: boolean[] = [];
    manager.onDidChangeState((enabled) => stateChanges.push(enabled));
    await manager.initialize('1.19.0');

    expect(manager.isInitialized).toBe(true);
    expect(manager.isEnabled).toBe(true);
    expect(stateChanges).toContain(true);
  });
});
