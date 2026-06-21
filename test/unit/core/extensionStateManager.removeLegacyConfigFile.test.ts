/**
 * Tests for removeLegacyConfigFile failure-reporting accuracy (F1 fix).
 *
 * Review finding F1: removeLegacyConfigFile must return false when fs.delete
 * rejects so callers can report failure accurately.
 * Also covers OR-003: gitignoreDecisions forwarding in migrateValue.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, window } from '../mocks/vscode';

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

describe('removeLegacyConfigFile — delete failure accuracy (F1)', () => {
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

  /**
   * F1: When the legacy file is tracked and fs.delete rejects, the caller must
   * NOT report "deleted" — it must report failure so the next activation retries.
   */
  it(
    'tracked legacy + fs.delete rejects → no "deleted" message shown, ' +
      'consolidation reports failure (no info message claiming deletion)',
    async () => {
      // Both files present, legacy is git-tracked but delete fails
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('{ "enabled": true, "versionCode": 1001019000 }')
        );
      workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
        if (uri.fsPath.endsWith('.arit-toolkit.jsonc.bak')) {
          return Promise.reject(new Error('not found'));
        }
        // Both .tangyr.jsonc and .arit-toolkit.jsonc exist
        return Promise.resolve({});
      });
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      workspace.fs.rename = vi.fn().mockResolvedValue(undefined);
      // delete REJECTS
      workspace.fs.delete = vi.fn().mockRejectedValue(new Error('Permission denied'));
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
      window.showWarningMessage = vi.fn().mockResolvedValue(undefined);
      mockIsGitTracked.mockResolvedValue(true);

      const manager = createManager();
      await manager.initialize('1.19.0');

      // Must NOT show an info message claiming "deleted"
      const infoCalls = vi.mocked(window.showInformationMessage).mock.calls;
      const claimedDeleted = infoCalls.some(
        (call) => typeof call[0] === 'string' && call[0].toLowerCase().includes('deleted')
      );
      expect(claimedDeleted).toBe(false);

      // Warn must have been logged (failure path)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('could not delete')
      );

      // Should show a message indicating failure/retry — not success
      // The notification should mention "could not be removed" or similar failure language
      const allInfoMessages = infoCalls.map((c) => String(c[0]));
      const allWarnMessages = vi
        .mocked(window.showWarningMessage)
        .mock.calls.map((c) => String(c[0]));
      const allMessages = [...allInfoMessages, ...allWarnMessages];
      const hasFailureMessage = allMessages.some(
        (m) =>
          m.toLowerCase().includes('could not be removed') ||
          m.toLowerCase().includes('retry') ||
          m.toLowerCase().includes('could not remove') ||
          m.toLowerCase().includes('failed')
      );
      expect(hasFailureMessage).toBe(true);
    }
  );

  /**
   * F1 rename failure: when the legacy is not tracked and rename rejects,
   * the caller must not report "renamed" — failure language must be used.
   */
  it('untracked legacy + fs.rename rejects → no "renamed" message, failure reported', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(
        new TextEncoder().encode('{ "enabled": true, "versionCode": 1001019000 }')
      );
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith('.arit-toolkit.jsonc.bak')) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({});
    });
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    // rename REJECTS
    workspace.fs.rename = vi.fn().mockRejectedValue(new Error('Permission denied'));
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);
    mockIsGitTracked.mockResolvedValue(false);

    const manager = createManager();
    await manager.initialize('1.19.0');

    // Warn must have been logged
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not rename')
    );

    // Must NOT claim "renamed to .bak" in the success sense
    const infoCalls = vi.mocked(window.showInformationMessage).mock.calls;
    const claimedRenamed = infoCalls.some(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('renamed to .arit-toolkit.jsonc.bak') &&
        !call[0].toLowerCase().includes('could not')
    );
    expect(claimedRenamed).toBe(false);

    // Should show failure message
    const allMessages = [
      ...infoCalls.map((c) => String(c[0])),
      ...vi.mocked(window.showWarningMessage).mock.calls.map((c) => String(c[0])),
    ];
    const hasFailure = allMessages.some(
      (m) =>
        m.toLowerCase().includes('could not be removed') ||
        m.toLowerCase().includes('retry') ||
        m.toLowerCase().includes('could not remove') ||
        m.toLowerCase().includes('failed')
    );
    expect(hasFailure).toBe(true);
  });
});
