import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, window } from '../mocks/vscode';

// Mock isGitTracked to drive tracked/untracked branches deterministically
const { mockIsGitTracked } = vi.hoisted(() => ({
  mockIsGitTracked: vi.fn(),
}));
vi.mock('../../../src/core/git', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/core/git')>();
  return {
    ...original,
    isGitTracked: mockIsGitTracked,
  };
});

import { ExtensionStateManager } from '../../../src/core/extensionStateManager';

describe('consolidateLegacyConfig', () => {
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

  // Helper: set up .tangyr.jsonc present and readable
  function setupBothFiles(legacyTracked: boolean): void {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(
        new TextEncoder().encode('{ "enabled": true, "versionCode": 1001019000 }')
      );
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      // .arit-toolkit.jsonc.bak availability probe (not found → path free)
      if (uri.fsPath.endsWith('.arit-toolkit.jsonc.bak')) {
        return Promise.reject(new Error('not found'));
      }
      // Both .tangyr.jsonc and .arit-toolkit.jsonc exist
      return Promise.resolve({});
    });
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    workspace.fs.rename = vi.fn().mockResolvedValue(undefined);
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);
    mockIsGitTracked.mockResolvedValue(legacyTracked);
  }

  // SPEC-002 AC-1: both files, legacy git-tracked → .tangyr.jsonc unchanged, legacy deleted
  it('both files present, legacy git-tracked → tangyr.jsonc values untouched, legacy deleted (no rename)', async () => {
    setupBothFiles(true);

    const manager = createManager();
    await manager.initialize('1.19.0');

    // fs.delete must have been called for the legacy file
    const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
    const legacyDeleted = deleteCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith('.arit-toolkit.jsonc')
    );
    expect(legacyDeleted).toBe(true);
    // fs.rename must NOT have been called (git-aware deletion only)
    expect(workspace.fs.rename).not.toHaveBeenCalled();
  });

  // SPEC-002 AC-2: both files, legacy not git-tracked → legacy renamed to .bak (no delete)
  it('both files present, legacy not git-tracked → legacy renamed to .arit-toolkit.jsonc.bak', async () => {
    setupBothFiles(false);

    const manager = createManager();
    await manager.initialize('1.19.0');

    const renameCalls = vi.mocked(workspace.fs.rename).mock.calls;
    expect(renameCalls.length).toBeGreaterThan(0);
    const renameCall = renameCalls[0];
    expect((renameCall![0] as { fsPath: string }).fsPath).toMatch(
      /\.arit-toolkit\.jsonc$/
    );
    expect((renameCall![1] as { fsPath: string }).fsPath).toMatch(
      /\.arit-toolkit\.jsonc\.bak$/
    );
    // fs.delete must NOT have been called for the legacy file
    const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
    const legacyDeleted = deleteCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith('.arit-toolkit.jsonc')
    );
    expect(legacyDeleted).toBe(false);
  });

  // SPEC-002 AC-2 (collision): both files, not tracked, .bak already exists → timestamp suffix
  it('both files present, legacy not tracked, .bak already exists → timestamp-suffixed .bak', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(
        new TextEncoder().encode('{ "enabled": true, "versionCode": 1001019000 }')
      );
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      // .bak already exists (collision)
      if (uri.fsPath.endsWith('.arit-toolkit.jsonc.bak')) return Promise.resolve({});
      // everything else (including .tangyr.jsonc and .arit-toolkit.jsonc) exists
      return Promise.resolve({});
    });
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    workspace.fs.rename = vi.fn().mockResolvedValue(undefined);
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);
    mockIsGitTracked.mockResolvedValue(false);

    const manager = createManager();
    await manager.initialize('1.19.0');

    const renameCalls = vi.mocked(workspace.fs.rename).mock.calls;
    expect(renameCalls.length).toBeGreaterThan(0);
    const destPath = (renameCalls[0]![1] as { fsPath: string }).fsPath;
    expect(destPath).toMatch(/\.arit-toolkit\.jsonc\.bak\.\d{12}$/);
  });

  // SPEC-002 AC-3: legacy only, parseable, git-tracked → .tangyr.jsonc written, legacy deleted
  it('legacy only, parseable, git-tracked → .tangyr.jsonc written, legacy deleted', async () => {
    // readFile: call 1 (.tangyr.jsonc read) → rejects; call 2 (legacy fallback) → rejects;
    // call 3 (consolidateLegacyConfig reads legacy) → resolves
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
      if (uri.fsPath.endsWith('.arit-toolkit.jsonc') && !uri.fsPath.endsWith('.bak'))
        return Promise.resolve({});
      return Promise.reject(new Error('not found'));
    });
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    workspace.fs.rename = vi.fn().mockResolvedValue(undefined);
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);
    mockIsGitTracked.mockResolvedValue(true);

    const manager = createManager();
    await manager.initialize('1.19.0');

    // .tangyr.jsonc must have been written (migration)
    expect(workspace.fs.writeFile).toHaveBeenCalled();
    // legacy deleted (tracked)
    const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
    const legacyDeleted = deleteCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith('.arit-toolkit.jsonc')
    );
    expect(legacyDeleted).toBe(true);
    // no rename for legacy
    const renameCalls = vi.mocked(workspace.fs.rename).mock.calls;
    const legacyRenamed = renameCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith('.arit-toolkit.jsonc')
    );
    expect(legacyRenamed).toBe(false);
  });

  // SPEC-002 AC-3 (untracked variant): legacy only, parseable, not tracked → .tangyr.jsonc written, legacy renamed
  it('legacy only, parseable, not git-tracked → .tangyr.jsonc written, legacy renamed to .bak', async () => {
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
      if (uri.fsPath.endsWith('.arit-toolkit.jsonc') && !uri.fsPath.endsWith('.bak'))
        return Promise.resolve({});
      return Promise.reject(new Error('not found'));
    });
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    workspace.fs.rename = vi.fn().mockResolvedValue(undefined);
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);
    mockIsGitTracked.mockResolvedValue(false);

    const manager = createManager();
    await manager.initialize('1.19.0');

    expect(workspace.fs.writeFile).toHaveBeenCalled();
    const renameCalls = vi.mocked(workspace.fs.rename).mock.calls;
    const legacyRenamed = renameCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith('.arit-toolkit.jsonc')
    );
    expect(legacyRenamed).toBe(true);
    // not deleted
    const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
    const legacyDeleted = deleteCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith('.arit-toolkit.jsonc')
    );
    expect(legacyDeleted).toBe(false);
  });

  // SPEC-002 AC-4: legacy only, malformed → .malformed.bak, warning shown, no .tangyr.jsonc
  it('legacy only, malformed → renamed to .malformed.bak, warning shown, no .tangyr.jsonc written', async () => {
    // All readFile calls fail (malformed / unreadable)
    workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('not found'));
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith('.tangyr.jsonc'))
        return Promise.reject(new Error('not found'));
      if (uri.fsPath.endsWith('.arit-toolkit.jsonc') && !uri.fsPath.endsWith('.bak'))
        return Promise.resolve({});
      return Promise.reject(new Error('not found'));
    });
    workspace.fs.rename = vi.fn().mockResolvedValue(undefined);
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    mockIsGitTracked.mockResolvedValue(false);

    const manager = createManager();
    await manager.initialize('1.19.0');

    const renameCalls = vi.mocked(workspace.fs.rename).mock.calls;
    expect(renameCalls.length).toBeGreaterThan(0);
    const destPath = (renameCalls[0]![1] as { fsPath: string }).fsPath;
    expect(destPath).toMatch(/\.arit-toolkit\.jsonc\.malformed\.bak$/);
    // .tangyr.jsonc must NOT have been written
    expect(workspace.fs.writeFile).not.toHaveBeenCalled();
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('could not parse')
    );
  });

  // No-op: neither file present
  it('neither file present → no-op (no stat-driven writes, no rename, no delete)', async () => {
    workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('not found'));
    workspace.fs.stat = vi.fn().mockRejectedValue(new Error('not found'));
    workspace.fs.rename = vi.fn().mockResolvedValue(undefined);
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);
    mockIsGitTracked.mockResolvedValue(false);

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

  // Multi-root: no-op
  it('multi-root workspace → no-op (upstream guard)', async () => {
    workspace.workspaceFolders = [{ uri: { fsPath: '/w1' } }, { uri: { fsPath: '/w2' } }];
    workspace.fs.stat = vi.fn();
    workspace.fs.rename = vi.fn();
    workspace.fs.delete = vi.fn();
    workspace.fs.readFile = vi.fn();

    const manager = createManager();
    await manager.initialize('1.19.0');

    expect(workspace.fs.stat).not.toHaveBeenCalled();
    expect(workspace.fs.rename).not.toHaveBeenCalled();
    expect(workspace.fs.delete).not.toHaveBeenCalled();
    expect(mockIsGitTracked).not.toHaveBeenCalled();
  });

  // Idempotency: legacy already absent → no-op
  it('idempotency: legacy already absent → no-op', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(
        new TextEncoder().encode('{ "enabled": true, "versionCode": 1001019000 }')
      );
    // .tangyr.jsonc present, .arit-toolkit.jsonc absent (stat rejects for legacy)
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
    mockIsGitTracked.mockResolvedValue(false);

    const manager = createManager();
    await manager.initialize('1.19.0');

    expect(workspace.fs.rename).not.toHaveBeenCalled();
    const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
    const legacyDeleted = deleteCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith('.arit-toolkit.jsonc')
    );
    expect(legacyDeleted).toBe(false);
  });
});
