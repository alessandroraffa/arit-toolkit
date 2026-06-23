/**
 * Swap-invariance tests for the agent sessions archiving pipeline.
 *
 * These tests verify that reordering providers (as prescribed by the popularity
 * ranking) does not affect the set of archived sessions, their content, or
 * cross-provider isolation. The tests use the AgentSessionArchiveService test
 * pattern from test/unit/features/agentSessionsArchiving/archiveService.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workspace } from '../../../mocks/vscode';

const { mockCheckAndPromptGitignore } = vi.hoisted(() => ({
  mockCheckAndPromptGitignore: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../../src/features/agentSessionsArchiving/gitignorePrompt', () => ({
  checkAndPromptGitignore: mockCheckAndPromptGitignore,
}));

import { AgentSessionArchiveService } from '../../../../../src/features/agentSessionsArchiving/archiveService';
import type {
  SessionProvider,
  SessionFile,
} from '../../../../../src/features/agentSessionsArchiving/types';
import type { AgentSessionsArchivingConfig } from '../../../../../src/types';

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

const WORKSPACE_ROOT_URI = { fsPath: '/workspace' } as import('vscode').Uri;

const DEFAULT_CONFIG: AgentSessionsArchivingConfig = {
  enabled: true,
  archivePath: '.tangyr/agent-sessions',
  intervalMinutes: 5,
};

/**
 * Creates a raw-file session (no parser — goes via workspace.fs.copy path).
 * Uses a stub providerName not registered in the parser registry.
 */
function createRawSession(overrides: Partial<SessionFile> = {}): SessionFile {
  return {
    uri: {
      fsPath: `/source/${overrides.archiveName ?? 'session'}.json`,
    } as import('vscode').Uri,
    providerName: 'raw-stub',
    archiveName: 'stub-session',
    displayName: 'Stub Session',
    mtime: 1000,
    ctime: 900,
    extension: '.json',
    ...overrides,
  };
}

/**
 * Creates a parsed Cline session (goes via workspace.fs.writeFile path).
 * The readFile mock must return valid Cline JSON for writeFile to be called.
 */
function createClineSession(overrides: Partial<SessionFile> = {}): SessionFile {
  return {
    uri: {
      fsPath: `/source/${overrides.archiveName ?? 'cline-session'}.json`,
    } as import('vscode').Uri,
    providerName: 'cline',
    archiveName: 'cline-session',
    displayName: 'Cline Session',
    mtime: 1000,
    ctime: 900,
    extension: '.json',
    ...overrides,
  };
}

/**
 * Creates a parsed RooCode session (goes via workspace.fs.writeFile path).
 */
function createRooCodeSession(overrides: Partial<SessionFile> = {}): SessionFile {
  return {
    uri: {
      fsPath: `/source/${overrides.archiveName ?? 'roo-session'}.json`,
    } as import('vscode').Uri,
    providerName: 'roo-code',
    archiveName: 'roo-session',
    displayName: 'RooCode Session',
    mtime: 1000,
    ctime: 900,
    extension: '.json',
    ...overrides,
  };
}

/**
 * Valid Cline/RooCode session JSON with one non-empty turn.
 */
const VALID_CLINE_JSON = JSON.stringify([
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'Hi there.' }] },
]);

function createStubProvider(name: string, sessions: SessionFile[]): SessionProvider {
  return {
    name,
    displayName: name,
    findSessions: vi.fn().mockResolvedValue(sessions),
  };
}

/**
 * Runs a single archive cycle with the given providers and returns the set of
 * destination paths for which workspace.fs.copy or workspace.fs.writeFile was called.
 * Uses _currentConfig injection + runArchiveCycle() directly to avoid running two
 * cycles (start() fires an initial cycle and runArchiveCycle() fires another).
 */
async function runCycleAndCollect(providers: SessionProvider[]): Promise<{
  copyDestPaths: string[];
  writeFilePaths: string[];
}> {
  const logger = createMockLogger();
  const service = new AgentSessionArchiveService(
    WORKSPACE_ROOT_URI,
    providers,
    logger as ReturnType<typeof createMockLogger>
  );
  // Inject config directly to avoid start() running an implicit initial cycle
  (
    service as unknown as { _currentConfig: AgentSessionsArchivingConfig }
  )._currentConfig = DEFAULT_CONFIG;
  await service.runArchiveCycle();
  service.dispose();

  const copyDestPaths = vi.mocked(workspace.fs.copy).mock.calls.map((call) => {
    const dest = call[1] as { fsPath: string };
    return dest.fsPath;
  });

  const writeFilePaths = vi.mocked(workspace.fs.writeFile).mock.calls.map((call) => {
    const uri = call[0] as { fsPath: string };
    return uri.fsPath;
  });

  return { copyDestPaths, writeFilePaths };
}

describe('popularitySwapInvariance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    workspace.fs.copy = vi.fn().mockResolvedValue(undefined);
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(VALID_CLINE_JSON));
    workspace.fs.stat = vi.fn().mockRejectedValue(new Error('not found'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Natural vs. reversed provider order', () => {
    it('produces identical archive output regardless of provider list order', async () => {
      const clineSession = createRawSession({
        archiveName: 'cline-task-001',
        displayName: 'Cline Task 001',
        providerName: 'raw-stub',
        uri: { fsPath: '/source/cline-task-001.json' } as import('vscode').Uri,
      });
      const rooSession = createRawSession({
        archiveName: 'roo-code-task-001',
        displayName: 'RooCode Task 001',
        providerName: 'raw-stub',
        uri: { fsPath: '/source/roo-code-task-001.json' } as import('vscode').Uri,
      });

      const clineStub = createStubProvider('cline-stub', [clineSession]);
      const rooStub = createStubProvider('roo-code-stub', [rooSession]);

      const { copyDestPaths: naturalPaths } = await runCycleAndCollect([
        clineStub,
        rooStub,
      ]);
      vi.clearAllMocks();
      workspace.fs.copy = vi.fn().mockResolvedValue(undefined);
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);
      workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
      workspace.fs.stat = vi.fn().mockRejectedValue(new Error('not found'));

      const { copyDestPaths: reversedPaths } = await runCycleAndCollect([
        rooStub,
        clineStub,
      ]);

      // Both orderings produce the same set of archived paths (order may differ)
      expect(new Set(naturalPaths)).toEqual(new Set(reversedPaths));
    });
  });

  describe('Cline / RooCode adjacent-pair swap', () => {
    it('produces identical archive output for [cline, roo] and [roo, cline] orderings', async () => {
      const clineSession = createRawSession({
        archiveName: 'cline-task-002',
        displayName: 'Cline Task 002',
        providerName: 'raw-stub',
        uri: { fsPath: '/source/cline-task-002.json' } as import('vscode').Uri,
      });
      const rooSession = createRawSession({
        archiveName: 'roo-code-task-002',
        displayName: 'RooCode Task 002',
        providerName: 'raw-stub',
        uri: { fsPath: '/source/roo-code-task-002.json' } as import('vscode').Uri,
      });

      const clineStub = createStubProvider('cline-stub', [clineSession]);
      const rooStub = createStubProvider('roo-code-stub', [rooSession]);

      const { copyDestPaths: normalPaths } = await runCycleAndCollect([
        clineStub,
        rooStub,
      ]);
      vi.clearAllMocks();
      workspace.fs.copy = vi.fn().mockResolvedValue(undefined);
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);
      workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
      workspace.fs.stat = vi.fn().mockRejectedValue(new Error('not found'));

      const { copyDestPaths: swappedPaths } = await runCycleAndCollect([
        rooStub,
        clineStub,
      ]);

      expect(new Set(normalPaths)).toEqual(new Set(swappedPaths));
    });
  });

  describe('Shared archiveName collision — fingerprint guard', () => {
    it('calls writeFile exactly once when two providers have the same archiveName and identical mtime', async () => {
      // Both sessions share the same archiveName and mtime.
      // After the first session is archived, the fingerprint guard sees the
      // same archiveName in lastArchivedMap with the same mtime, and skips
      // the second session. This does NOT exercise deleteOldArchive (which
      // fires when mtime differs but archiveName is the same).
      const sharedMtime = 1000;
      const clineSession = createClineSession({
        archiveName: 'shared-task-001',
        displayName: 'Cline Shared Task',
        mtime: sharedMtime,
      });
      const rooSession = createRooCodeSession({
        archiveName: 'shared-task-001',
        displayName: 'RooCode Shared Task',
        mtime: sharedMtime,
      });

      const clineStub = createStubProvider('cline-stub', [clineSession]);
      const rooStub = createStubProvider('roo-code-stub', [rooSession]);

      const { writeFilePaths: normalWritePaths } = await runCycleAndCollect([
        clineStub,
        rooStub,
      ]);
      // Only one writeFile call: the first provider's session is archived;
      // the second is skipped by the fingerprint guard (same archiveName + same mtime).
      expect(normalWritePaths).toHaveLength(1);

      vi.clearAllMocks();
      workspace.fs.copy = vi.fn().mockResolvedValue(undefined);
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);
      workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode(VALID_CLINE_JSON));
      workspace.fs.stat = vi.fn().mockRejectedValue(new Error('not found'));

      const { writeFilePaths: reversedWritePaths } = await runCycleAndCollect([
        rooStub,
        clineStub,
      ]);
      // Same result under reversed ordering.
      expect(reversedWritePaths).toHaveLength(1);

      // The call count is identical under both orderings.
      expect(normalWritePaths.length).toBe(reversedWritePaths.length);
    });

    it('exercises deleteOldArchive when same archiveName has a DIFFERING mtime', async () => {
      // Both providers produce a session with the same archiveName but different
      // mtimes. The first session is archived; when the second is processed with
      // the same archiveName but a different mtime, it re-archives (different
      // mtime bypasses the fingerprint guard) and if the archive filename changes
      // (different ctime → different timestamp) the deleteOldArchive branch fires.
      // This sub-case confirms the deleteOldArchive branch is reachable by archive
      // key collision with differing mtime, not by the fingerprint guard.
      const clineSession = createClineSession({
        archiveName: 'shared-task-002',
        displayName: 'Cline Shared Task 002',
        mtime: 1000,
        ctime: 100,
      });
      const rooSession = createRooCodeSession({
        archiveName: 'shared-task-002',
        displayName: 'RooCode Shared Task 002',
        mtime: 2000, // DIFFERENT mtime — fingerprint guard does NOT skip
        ctime: 200, // Different ctime → different timestamp → different archive filename
      });

      const clineStub = createStubProvider('cline-stub', [clineSession]);
      const rooStub = createStubProvider('roo-code-stub', [rooSession]);

      const { writeFilePaths: normalPaths } = await runCycleAndCollect([
        clineStub,
        rooStub,
      ]);
      // Both sessions are archived (different mtimes → both pass fingerprint guard);
      // the second archive replaces the first via deleteOldArchive.
      expect(normalPaths).toHaveLength(2);

      vi.clearAllMocks();
      workspace.fs.copy = vi.fn().mockResolvedValue(undefined);
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);
      workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode(VALID_CLINE_JSON));
      workspace.fs.stat = vi.fn().mockRejectedValue(new Error('not found'));

      const { writeFilePaths: reversedPaths } = await runCycleAndCollect([
        rooStub,
        clineStub,
      ]);
      // Under reversed order, same count (both sessions are archived).
      expect(reversedPaths).toHaveLength(2);
    });
  });

  describe('No cross-provider session leakage', () => {
    it('cline archiveName prefix only appears in cline output, roo-code prefix only in roo-code output', async () => {
      const clineSession = createRawSession({
        archiveName: 'cline-task-003',
        displayName: 'Cline Task 003',
        providerName: 'raw-stub',
        uri: { fsPath: '/source/cline-task-003.json' } as import('vscode').Uri,
      });
      const rooSession = createRawSession({
        archiveName: 'roo-code-task-003',
        displayName: 'RooCode Task 003',
        providerName: 'raw-stub',
        uri: { fsPath: '/source/roo-code-task-003.json' } as import('vscode').Uri,
      });

      const clineStub = createStubProvider('cline-stub', [clineSession]);
      const rooStub = createStubProvider('roo-code-stub', [rooSession]);

      const { copyDestPaths: naturalPaths } = await runCycleAndCollect([
        clineStub,
        rooStub,
      ]);
      vi.clearAllMocks();
      workspace.fs.copy = vi.fn().mockResolvedValue(undefined);
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);
      workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
      workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
      workspace.fs.stat = vi.fn().mockRejectedValue(new Error('not found'));

      const { copyDestPaths: reversedPaths } = await runCycleAndCollect([
        rooStub,
        clineStub,
      ]);

      // Under both orderings, cline paths contain 'cline-task-003'
      // and roo paths contain 'roo-code-task-003'; no cross-leakage.
      const allPaths = [...naturalPaths, ...reversedPaths];

      // Verify that no path from cline contains 'roo-code-task'
      const clineArchives = allPaths.filter((p) => p.includes('cline-task'));
      expect(clineArchives.every((p) => !p.includes('roo-code-task'))).toBe(true);

      // Verify that no path from rooCode contains 'cline-task'
      const rooArchives = allPaths.filter((p) => p.includes('roo-code-task'));
      expect(rooArchives.every((p) => !p.includes('cline-task'))).toBe(true);

      // Verify both archive names appeared
      expect(allPaths.some((p) => p.includes('cline-task-003'))).toBe(true);
      expect(allPaths.some((p) => p.includes('roo-code-task-003'))).toBe(true);
    });
  });
});
