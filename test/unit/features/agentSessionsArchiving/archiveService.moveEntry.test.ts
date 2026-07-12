/**
 * Tests for moveEntry unrecognized-entry handling (F2) and
 * reconcileArchiveLocation VS Code notifications (F3).
 *
 * F2: moveEntry must return false for unrecognized entries (non-File,
 *     non-year-named Directory) so the source tree is preserved on partial failure.
 * F3: reconcileArchiveLocation must surface a VS Code notification —
 *     showInformationMessage on full success, showWarningMessage on partial failure.
 *     No notification when there is nothing to move.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workspace, FileType, window } from '../../mocks/vscode';

const { mockCheckAndPromptGitignore } = vi.hoisted(() => ({
  mockCheckAndPromptGitignore: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../src/features/agentSessionsArchiving/gitignorePrompt', () => ({
  checkAndPromptGitignore: mockCheckAndPromptGitignore,
}));

import { AgentSessionArchiveService } from '../../../../src/features/agentSessionsArchiving/archiveService';
import type { AgentSessionsArchivingConfig } from '../../../../src/types';

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    show: vi.fn(),
  };
}

const NEW_DEFAULT_PATH = '.tangyr/agent-sessions';
const HISTORICAL_DEFAULT_PATH = 'docs/archive/agent-sessions';

const NEW_DEFAULT_CONFIG: AgentSessionsArchivingConfig = {
  enabled: true,
  archivePath: NEW_DEFAULT_PATH,
  intervalMinutes: 5,
};

describe('moveEntry — unrecognized entry handling (F2)', () => {
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
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    // BK-004: stat checks whether destination exists before copying.
    // Destination paths (new default) should not exist; source paths may.
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.includes(NEW_DEFAULT_PATH)) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({});
    });
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(
    'old archive dir contains non-year-named subdirectory → ' +
      'source tree NOT deleted after moveArchive',
    async () => {
      // Historical dir has a non-year-named subdirectory (unrecognized entry)
      // plus a valid year entry. moveEntry must return false for the non-year dir,
      // so allCopiesSucceeded=false, and finalizeMoveArchive leaves old tree intact.
      const historicalTopEntries: [string, number][] = [
        ['2026', FileType.Directory], // valid year
        ['drafts', FileType.Directory], // unrecognized: non-year name
      ];
      const monthEntries: [string, number][] = [['01', FileType.Directory]];
      const fileEntries: [string, number][] = [
        ['202601010000-session.md', FileType.File],
      ];

      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH))
            return Promise.resolve(historicalTopEntries);
          if (uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026`))
            return Promise.resolve(monthEntries);
          if (uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026/01`))
            return Promise.resolve(fileEntries);
          // new default dir — empty
          return Promise.resolve([]);
        });

      const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
      await service.start(NEW_DEFAULT_CONFIG);
      await service.runArchiveCycle();

      // fs.delete must NOT have been called on the old archive directory
      const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
      const oldDirDeleted = deleteCalls.some((call) =>
        (call[0] as { fsPath: string }).fsPath.endsWith(HISTORICAL_DEFAULT_PATH)
      );
      expect(oldDirDeleted).toBe(false);

      // A warning must have been logged about partial failure / source left in place
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(HISTORICAL_DEFAULT_PATH)
      );

      service.dispose();
    }
  );

  it(
    'old archive dir contains only a SymbolicLink entry → ' +
      'source tree NOT deleted after moveArchive',
    async () => {
      const historicalTopEntries: [string, number][] = [
        ['link-to-somewhere', FileType.SymbolicLink], // unrecognized: symlink
      ];

      workspace.fs.readDirectory = vi
        .fn()
        .mockImplementation((uri: { fsPath: string }) => {
          if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH))
            return Promise.resolve(historicalTopEntries);
          return Promise.resolve([]);
        });

      const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
      await service.start(NEW_DEFAULT_CONFIG);
      await service.runArchiveCycle();

      const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
      const oldDirDeleted = deleteCalls.some((call) =>
        (call[0] as { fsPath: string }).fsPath.endsWith(HISTORICAL_DEFAULT_PATH)
      );
      expect(oldDirDeleted).toBe(false);

      service.dispose();
    }
  );
});

describe('relocateFile — byte-identical, divergent, and read-failure destinations (C1)', () => {
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
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    workspace.fs.readFile = vi.fn().mockResolvedValue(new TextEncoder().encode(''));
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.includes(NEW_DEFAULT_PATH)) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({});
    });
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mockNestedFile(fileName: string): void {
    const historicalEntries: [string, number][] = [['2026', FileType.Directory]];
    const monthEntries: [string, number][] = [['06', FileType.Directory]];
    const fileEntries: [string, number][] = [[fileName, FileType.File]];

    workspace.fs.readDirectory = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH))
        return Promise.resolve(historicalEntries);
      if (uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026`))
        return Promise.resolve(monthEntries);
      if (uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026/06`))
        return Promise.resolve(fileEntries);
      return Promise.resolve([]);
    });
  }

  it('identical bytes at docs/archive/agent-sessions/2026/06/file.md and .tangyr/agent-sessions/2026/06/file.md → success, historical root deleted', async () => {
    mockNestedFile('file.md');
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(`${NEW_DEFAULT_PATH}/2026/06/file.md`)) {
        return Promise.resolve({});
      }
      if (uri.fsPath.includes(NEW_DEFAULT_PATH)) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({});
    });
    const content = new TextEncoder().encode('identical content');
    workspace.fs.readFile = vi.fn().mockResolvedValue(content);

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(NEW_DEFAULT_CONFIG);
    await service.runArchiveCycle();

    const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
    const historicalDeleted = deleteCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith(HISTORICAL_DEFAULT_PATH)
    );
    expect(historicalDeleted).toBe(true);

    const copyCalls = vi.mocked(workspace.fs.copy).mock.calls;
    const copiedIdenticalFile = copyCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith('2026/06/file.md')
    );
    expect(copiedIdenticalFile).toBe(false);

    service.dispose();
  });

  it('same 2026/06/file.md path with different bytes → destination not overwritten, historical root preserved, warning logs the relative path', async () => {
    mockNestedFile('file.md');
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(`${NEW_DEFAULT_PATH}/2026/06/file.md`)) {
        return Promise.resolve({});
      }
      if (uri.fsPath.includes(NEW_DEFAULT_PATH)) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({});
    });
    workspace.fs.readFile = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.includes(NEW_DEFAULT_PATH)) {
        return Promise.resolve(new TextEncoder().encode('destination content'));
      }
      return Promise.resolve(new TextEncoder().encode('source content'));
    });

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(NEW_DEFAULT_CONFIG);
    await service.runArchiveCycle();

    const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
    const historicalDeleted = deleteCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith(HISTORICAL_DEFAULT_PATH)
    );
    expect(historicalDeleted).toBe(false);

    const copyCalls = vi.mocked(workspace.fs.copy).mock.calls;
    const overwroteDestination = copyCalls.some((call) =>
      (call[1] as { fsPath: string }).fsPath.endsWith('2026/06/file.md')
    );
    expect(overwroteDestination).toBe(false);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('2026/06/file.md'));

    service.dispose();
  });

  it('top-level flat-layout legacy file with identical bytes → success, historical root deleted, no copy issued', async () => {
    const historicalEntries: [string, number][] = [['202511072052.md', FileType.File]];
    workspace.fs.readDirectory = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH))
        return Promise.resolve(historicalEntries);
      return Promise.resolve([]);
    });
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(`${NEW_DEFAULT_PATH}/202511072052.md`)) {
        return Promise.resolve({});
      }
      if (uri.fsPath.includes(NEW_DEFAULT_PATH)) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({});
    });
    const content = new TextEncoder().encode('identical legacy content');
    workspace.fs.readFile = vi.fn().mockResolvedValue(content);

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(NEW_DEFAULT_CONFIG);
    await service.runArchiveCycle();

    const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
    const historicalDeleted = deleteCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith(HISTORICAL_DEFAULT_PATH)
    );
    expect(historicalDeleted).toBe(true);

    const copyCalls = vi.mocked(workspace.fs.copy).mock.calls;
    const copiedIdenticalFile = copyCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith('202511072052.md')
    );
    expect(copiedIdenticalFile).toBe(false);

    service.dispose();
  });

  it('destination read throws during byte comparison → treated as failure, never success, historical root preserved', async () => {
    mockNestedFile('file.md');
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(`${NEW_DEFAULT_PATH}/2026/06/file.md`)) {
        return Promise.resolve({});
      }
      if (uri.fsPath.includes(NEW_DEFAULT_PATH)) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({});
    });
    workspace.fs.readFile = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.includes(NEW_DEFAULT_PATH)) {
        return Promise.reject(new Error('EACCES: permission denied'));
      }
      return Promise.resolve(new TextEncoder().encode('source content'));
    });

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(NEW_DEFAULT_CONFIG);
    await service.runArchiveCycle();

    const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
    const historicalDeleted = deleteCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith(HISTORICAL_DEFAULT_PATH)
    );
    expect(historicalDeleted).toBe(false);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('2026/06/file.md'));

    service.dispose();
  });
});

describe('shouldIgnoreArchiveEntry — .DS_Store handling (C2)', () => {
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
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    workspace.fs.readFile = vi.fn().mockResolvedValue(new TextEncoder().encode(''));
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.includes(NEW_DEFAULT_PATH)) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({});
    });
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('top-level .DS_Store in the historical archive root is ignored: success, never copied', async () => {
    const historicalEntries: [string, number][] = [['.DS_Store', FileType.File]];
    workspace.fs.readDirectory = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH))
        return Promise.resolve(historicalEntries);
      return Promise.resolve([]);
    });

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(NEW_DEFAULT_CONFIG);
    await service.runArchiveCycle();

    const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
    const historicalDeleted = deleteCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith(HISTORICAL_DEFAULT_PATH)
    );
    expect(historicalDeleted).toBe(true);

    const copyCalls = vi.mocked(workspace.fs.copy).mock.calls;
    const copiedDsStore = copyCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith('.DS_Store')
    );
    expect(copiedDsStore).toBe(false);

    service.dispose();
  });

  it('nested 2026/06/.DS_Store with divergent bytes does not fail the month, and is never copied', async () => {
    const historicalEntries: [string, number][] = [['2026', FileType.Directory]];
    const yearEntries: [string, number][] = [['06', FileType.Directory]];
    const fileEntries: [string, number][] = [
      ['.DS_Store', FileType.File],
      ['file.md', FileType.File],
    ];
    workspace.fs.readDirectory = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH))
        return Promise.resolve(historicalEntries);
      if (uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026`))
        return Promise.resolve(yearEntries);
      if (uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026/06`))
        return Promise.resolve(fileEntries);
      return Promise.resolve([]);
    });
    // file.md is absent at the destination (safe to copy directly). .DS_Store
    // "exists" at both sides with divergent bytes — the ignore predicate must
    // skip it before it ever reaches relocateFile's byte comparison.
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(`${NEW_DEFAULT_PATH}/2026/06/.DS_Store`)) {
        return Promise.resolve({});
      }
      if (uri.fsPath.includes(NEW_DEFAULT_PATH)) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({});
    });
    workspace.fs.readFile = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith('.DS_Store')) {
        return uri.fsPath.includes(NEW_DEFAULT_PATH)
          ? Promise.resolve(new TextEncoder().encode('new-finder-metadata'))
          : Promise.resolve(new TextEncoder().encode('old-finder-metadata'));
      }
      return Promise.resolve(new TextEncoder().encode(''));
    });

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(NEW_DEFAULT_CONFIG);
    await service.runArchiveCycle();

    const deleteCalls = vi.mocked(workspace.fs.delete).mock.calls;
    const historicalDeleted = deleteCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith(HISTORICAL_DEFAULT_PATH)
    );
    expect(historicalDeleted).toBe(true);

    const copyCalls = vi.mocked(workspace.fs.copy).mock.calls;
    const copiedDsStore = copyCalls.some((call) =>
      (call[0] as { fsPath: string }).fsPath.endsWith('.DS_Store')
    );
    expect(copiedDsStore).toBe(false);

    service.dispose();
  });
});

describe('reconcileArchiveLocation — VS Code notifications (F3)', () => {
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
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    // BK-004: stat checks whether destination exists before copying.
    // Destination paths (new default) should not exist; source paths may.
    workspace.fs.stat = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.includes(NEW_DEFAULT_PATH)) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve({});
    });
    window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
    window.showWarningMessage = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('full success → showInformationMessage with relocation confirmation', async () => {
    // Historical dir has a valid year + file → all copies succeed → old dir deleted
    const historicalEntries: [string, number][] = [['2026', FileType.Directory]];
    const monthEntries: [string, number][] = [['01', FileType.Directory]];
    const fileEntries: [string, number][] = [['202601010000-session.md', FileType.File]];

    workspace.fs.readDirectory = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH))
        return Promise.resolve(historicalEntries);
      if (uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026`))
        return Promise.resolve(monthEntries);
      if (uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026/01`))
        return Promise.resolve(fileEntries);
      return Promise.resolve([]);
    });

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(NEW_DEFAULT_CONFIG);
    await service.runArchiveCycle();

    // showInformationMessage must have been called with a relocation success message
    const infoCalls = vi.mocked(window.showInformationMessage).mock.calls;
    const relocSuccess = infoCalls.some(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].toLowerCase().includes(NEW_DEFAULT_PATH.toLowerCase())
    );
    expect(relocSuccess).toBe(true);

    // showWarningMessage must NOT have been called for the relocation
    const warnCalls = vi.mocked(window.showWarningMessage).mock.calls;
    const relocWarn = warnCalls.some(
      (call) => typeof call[0] === 'string' && call[0].toLowerCase().includes('remain')
    );
    expect(relocWarn).toBe(false);

    service.dispose();
  });

  it('partial failure → showWarningMessage about archives remaining at old location', async () => {
    // Historical dir has a year entry + an unrecognized dir → partial failure
    const historicalTopEntries: [string, number][] = [
      ['2026', FileType.Directory], // valid
      ['drafts', FileType.Directory], // unrecognized → copy fails
    ];
    const monthEntries: [string, number][] = [['01', FileType.Directory]];
    const fileEntries: [string, number][] = [['202601010000-session.md', FileType.File]];

    workspace.fs.readDirectory = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH))
        return Promise.resolve(historicalTopEntries);
      if (uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026`))
        return Promise.resolve(monthEntries);
      if (uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026/01`))
        return Promise.resolve(fileEntries);
      return Promise.resolve([]);
    });

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(NEW_DEFAULT_CONFIG);
    await service.runArchiveCycle();

    // showWarningMessage must have been called about partial failure
    const warnCalls = vi.mocked(window.showWarningMessage).mock.calls;
    const relocWarn = warnCalls.some(
      (call) =>
        typeof call[0] === 'string' &&
        (call[0].toLowerCase().includes('remain') ||
          call[0].toLowerCase().includes('reconcile manually') ||
          call[0].toLowerCase().includes(HISTORICAL_DEFAULT_PATH.toLowerCase()))
    );
    expect(relocWarn).toBe(true);

    service.dispose();
  });

  it('nothing to move (historical dir absent) → no relocation notification', async () => {
    workspace.fs.readDirectory = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH)) {
        return Promise.reject(new Error('not found'));
      }
      return Promise.resolve([]);
    });

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(NEW_DEFAULT_CONFIG);
    await service.runArchiveCycle();

    // No relocation-specific notifications
    const infoCalls = vi.mocked(window.showInformationMessage).mock.calls;
    const hasRelocationInfo = infoCalls.some(
      (call) => typeof call[0] === 'string' && call[0].toLowerCase().includes('relocated')
    );
    expect(hasRelocationInfo).toBe(false);

    const warnCalls = vi.mocked(window.showWarningMessage).mock.calls;
    const hasRelocationWarn = warnCalls.some(
      (call) => typeof call[0] === 'string' && call[0].toLowerCase().includes('remain')
    );
    expect(hasRelocationWarn).toBe(false);

    service.dispose();
  });

  it('custom archivePath → no relocation notification', async () => {
    const customConfig: AgentSessionsArchivingConfig = {
      enabled: true,
      archivePath: 'my/custom/archive',
      intervalMinutes: 5,
    };

    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(customConfig);
    await service.runArchiveCycle();

    const infoCalls = vi.mocked(window.showInformationMessage).mock.calls;
    const hasRelocation = infoCalls.some(
      (call) => typeof call[0] === 'string' && call[0].toLowerCase().includes('relocated')
    );
    expect(hasRelocation).toBe(false);

    service.dispose();
  });

  function mockPartialFailureFixture(): void {
    const historicalTopEntries: [string, number][] = [
      ['2026', FileType.Directory], // valid
      ['drafts', FileType.Directory], // unrecognized → copy fails
    ];
    const monthEntries: [string, number][] = [['01', FileType.Directory]];
    const fileEntries: [string, number][] = [['202601010000-session.md', FileType.File]];

    workspace.fs.readDirectory = vi.fn().mockImplementation((uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith(HISTORICAL_DEFAULT_PATH))
        return Promise.resolve(historicalTopEntries);
      if (uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026`))
        return Promise.resolve(monthEntries);
      if (uri.fsPath.endsWith(`${HISTORICAL_DEFAULT_PATH}/2026/01`))
        return Promise.resolve(fileEntries);
      return Promise.resolve([]);
    });
  }

  it('partial failure → showWarningMessage action buttons include "View Log"', async () => {
    mockPartialFailureFixture();

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(NEW_DEFAULT_CONFIG);
    await service.runArchiveCycle();

    const warnCalls = vi.mocked(window.showWarningMessage).mock.calls;
    const partialFailureCall = warnCalls.find(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].toLowerCase().includes(HISTORICAL_DEFAULT_PATH.toLowerCase())
    );
    expect(partialFailureCall).toBeDefined();
    expect(partialFailureCall?.slice(1)).toContain('View Log');

    service.dispose();
  });

  it('"View Log" action opens the output channel via logger.show()', async () => {
    window.showWarningMessage = vi.fn().mockResolvedValue('View Log');
    mockPartialFailureFixture();

    const service = new AgentSessionArchiveService(workspaceRootUri, [], logger as any);
    await service.start(NEW_DEFAULT_CONFIG);
    await service.runArchiveCycle();

    expect(logger.show).toHaveBeenCalled();

    service.dispose();
  });
});
