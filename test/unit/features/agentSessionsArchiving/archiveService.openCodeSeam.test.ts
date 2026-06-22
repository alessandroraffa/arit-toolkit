/**
 * Tests for the additive readContent/uri? ingestion seam in archiveService.
 *
 * Verifies:
 * - readAndParse uses readContent when present (no readFile called)
 * - readContent exception is isolated — session skipped, next session proceeds
 * - copyRawArchive is NOT called for content-backed sessions at no-parser path
 * - copyRawArchive is NOT called for content-backed sessions at unrecognized path
 * - copyRawArchive is NOT called for content-backed sessions at exception-catch path
 * - resolveCompanionData is NOT called for content-backed sessions
 * - File-backed sessions (no readContent) are fully unaffected
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workspace } from '../../mocks/vscode';

const { mockCheckAndPromptGitignore } = vi.hoisted(() => ({
  mockCheckAndPromptGitignore: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../src/features/agentSessionsArchiving/gitignorePrompt', () => ({
  checkAndPromptGitignore: mockCheckAndPromptGitignore,
}));

// Mock resolveCompanionData so we can assert it is never called for readContent sessions
const { mockResolveCompanionData } = vi.hoisted(() => ({
  mockResolveCompanionData: vi.fn().mockResolvedValue({ companionPartial: false }),
}));
vi.mock('../../../../src/features/agentSessionsArchiving/companionDataResolver', () => ({
  resolveCompanionData: mockResolveCompanionData,
}));

// Mock parser registry so we can control which provider has a parser
const { mockGetParserForProvider } = vi.hoisted(() => ({
  mockGetParserForProvider: vi.fn(),
}));
vi.mock('../../../../src/features/agentSessionsArchiving/markdown', () => ({
  getParserForProvider: mockGetParserForProvider,
  renderSessionToMarkdown: vi.fn().mockReturnValue('# Rendered'),
  getDefaultParsers: vi.fn().mockReturnValue([]),
}));

import { AgentSessionArchiveService } from '../../../../src/features/agentSessionsArchiving/archiveService';
import type {
  SessionProvider,
  SessionFile,
} from '../../../../src/features/agentSessionsArchiving/types';
import type { AgentSessionsArchivingConfig } from '../../../../src/types';

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

function createContentSession(overrides: Partial<SessionFile> = {}): SessionFile {
  return {
    providerName: 'open-code',
    archiveName: 'open-code-sess-1',
    displayName: 'OpenCode test session',
    mtime: 1000,
    ctime: 900,
    extension: '',
    readContent: vi.fn().mockResolvedValue(
      JSON.stringify({
        schemaVersion: 1,
        session: { id: 's1', directory: '/ws', title: null, agent: null, parentId: null },
        messages: [],
        subagents: [],
      })
    ),
    ...overrides,
  };
}

function createFileSession(overrides: Partial<SessionFile> = {}): SessionFile {
  return {
    uri: { fsPath: '/source/session.json' } as any,
    providerName: 'continue',
    archiveName: 'continue-sess-1',
    displayName: 'Continue test session',
    mtime: 1000,
    ctime: 900,
    extension: '.json',
    ...overrides,
  };
}

function createProvider(sessions: SessionFile[]): SessionProvider {
  return {
    name: 'mixed',
    displayName: 'Mixed',
    findSessions: vi.fn().mockResolvedValue(sessions),
  };
}

const WORKSPACE_URI = { fsPath: '/workspace' } as any;
const DEFAULT_CONFIG: AgentSessionsArchivingConfig = {
  enabled: true,
  archivePath: '.tangyr/agent-sessions',
  intervalMinutes: 5,
};

async function runOneCycle(
  service: AgentSessionArchiveService,
  config: AgentSessionsArchivingConfig = DEFAULT_CONFIG
): Promise<void> {
  await service.start(config);
  await service.runArchiveCycle();
}

describe('archiveService readContent/uri? ingestion seam', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    logger = createMockLogger();
    workspace.fs.copy = vi.fn().mockResolvedValue(undefined);
    workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
    workspace.fs.stat = vi.fn().mockRejectedValue(new Error('ENOENT'));
    workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
    workspace.fs.readFile = vi.fn().mockResolvedValue(new TextEncoder().encode('{}'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('readAndParse uses readContent when present', () => {
    it('calls readContent and passes its result to parser; never calls readFile', async () => {
      const contentStr = JSON.stringify({
        schemaVersion: 1,
        session: { id: 's1', directory: '/ws', title: null, agent: null, parentId: null },
        messages: [],
        subagents: [],
      });
      const readContent = vi.fn().mockResolvedValue(contentStr);
      const parseFn = vi.fn().mockReturnValue({
        status: 'parsed',
        session: {
          providerName: 'open-code',
          providerDisplayName: 'OpenCode',
          sessionId: 'open-code-sess-1',
          turns: [
            {
              role: 'user' as const,
              content: 'hello',
              toolCalls: [],
              filesRead: [],
              filesModified: [],
            },
          ],
          subagentSessions: [],
          compactionSummaries: [],
        },
      });
      mockGetParserForProvider.mockReturnValue({
        providerName: 'open-code',
        parse: parseFn,
      });

      const session = createContentSession({ readContent });
      const provider = createProvider([session]);
      const service = new AgentSessionArchiveService(
        WORKSPACE_URI,
        [provider],
        logger as any
      );
      await runOneCycle(service);

      expect(readContent).toHaveBeenCalledOnce();
      expect(parseFn).toHaveBeenCalledWith(contentStr, 'open-code-sess-1');
      expect(workspace.fs.readFile).not.toHaveBeenCalled();
    });
  });

  describe('readContent exception isolation', () => {
    it('skips session when readContent throws; next file-backed session still processes', async () => {
      const throwingContent = vi.fn().mockRejectedValue(new Error('content read failed'));

      const parseFn = vi.fn().mockReturnValue({
        status: 'parsed',
        session: {
          providerName: 'continue',
          providerDisplayName: 'Continue',
          sessionId: 'continue-sess-1',
          turns: [
            {
              role: 'user' as const,
              content: 'hi',
              toolCalls: [],
              filesRead: [],
              filesModified: [],
            },
          ],
          subagentSessions: [],
          compactionSummaries: [],
        },
      });
      // Register a parser for both providers. The open-code readContent will
      // throw before parse is called; the continue parser handles the file session.
      const openCodeParseFn = vi.fn(); // never reached due to throw
      mockGetParserForProvider.mockImplementation((name: string) => {
        if (name === 'open-code') {
          return { providerName: 'open-code', parse: openCodeParseFn };
        }
        if (name === 'continue') {
          return { providerName: 'continue', parse: parseFn };
        }
        return undefined;
      });

      const contentSession = createContentSession({ readContent: throwingContent });
      const fileSession = createFileSession();
      const provider = createProvider([contentSession, fileSession]);
      const service = new AgentSessionArchiveService(
        WORKSPACE_URI,
        [provider],
        logger as any
      );
      await runOneCycle(service);

      // The throwing readContent session is skipped — warn logged via the
      // unrecognized-format path (readAndParse returns status 'unrecognized'
      // with reason 'readContent threw'; writeArchiveFile logs the warn).
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unrecognized'));
      // The file-backed session still processes — writeFile called
      expect(workspace.fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('copyRawArchive skip guards for content-backed sessions', () => {
    it('does not call copyRawArchive at no-parser path; logger.warn called', async () => {
      mockGetParserForProvider.mockReturnValue(undefined);
      const session = createContentSession();
      const provider = createProvider([session]);
      const service = new AgentSessionArchiveService(
        WORKSPACE_URI,
        [provider],
        logger as any
      );
      await runOneCycle(service);

      expect(workspace.fs.copy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('open-code'));
    });

    it('does not call copyRawArchive at unrecognized result path; logger.warn called', async () => {
      mockGetParserForProvider.mockReturnValue({
        providerName: 'open-code',
        parse: vi.fn().mockReturnValue({ status: 'unrecognized', reason: 'bad json' }),
      });
      const session = createContentSession();
      const provider = createProvider([session]);
      const service = new AgentSessionArchiveService(
        WORKSPACE_URI,
        [provider],
        logger as any
      );
      await runOneCycle(service);

      expect(workspace.fs.copy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unrecognized'));
    });

    it('does not call copyRawArchive at exception-catch path; logger.warn called', async () => {
      mockGetParserForProvider.mockReturnValue({
        providerName: 'open-code',
        parse: vi.fn().mockImplementation(() => {
          throw new Error('parse blew up');
        }),
      });
      const session = createContentSession();
      const provider = createProvider([session]);
      const service = new AgentSessionArchiveService(
        WORKSPACE_URI,
        [provider],
        logger as any
      );
      await runOneCycle(service);

      expect(workspace.fs.copy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to convert')
      );
    });
  });

  describe('resolveCompanionData not called for content-backed sessions', () => {
    it('does not invoke resolveCompanionData when readContent is present', async () => {
      mockGetParserForProvider.mockReturnValue({
        providerName: 'open-code',
        parse: vi.fn().mockReturnValue({
          status: 'parsed',
          session: {
            providerName: 'open-code',
            providerDisplayName: 'OpenCode',
            sessionId: 'open-code-sess-1',
            turns: [
              {
                role: 'user' as const,
                content: 'hello',
                toolCalls: [],
                filesRead: [],
                filesModified: [],
              },
            ],
            subagentSessions: [],
            compactionSummaries: [],
          },
        }),
      });
      const session = createContentSession();
      const provider = createProvider([session]);
      const service = new AgentSessionArchiveService(
        WORKSPACE_URI,
        [provider],
        logger as any
      );
      await runOneCycle(service);

      expect(mockResolveCompanionData).not.toHaveBeenCalled();
    });
  });

  describe('file-backed sessions are unaffected', () => {
    it('file-backed session calls copyRawArchive (copy) at no-parser path', async () => {
      // No parser → copyRawArchive is called for file-backed sessions.
      // readFile is NOT called at the no-parser path (only at the parse path);
      // only workspace.fs.copy is called via copyRawArchive.
      mockGetParserForProvider.mockReturnValue(undefined);
      const session = createFileSession();
      const provider = createProvider([session]);
      const service = new AgentSessionArchiveService(
        WORKSPACE_URI,
        [provider],
        logger as any
      );
      await runOneCycle(service);

      expect(workspace.fs.copy).toHaveBeenCalled();
    });

    it('file-backed session calls resolveCompanionData when parser is present', async () => {
      mockGetParserForProvider.mockReturnValue({
        providerName: 'continue',
        parse: vi.fn().mockReturnValue({
          status: 'parsed',
          session: {
            providerName: 'continue',
            providerDisplayName: 'Continue',
            sessionId: 'continue-sess-1',
            turns: [
              {
                role: 'user' as const,
                content: 'hi',
                toolCalls: [],
                filesRead: [],
                filesModified: [],
              },
            ],
            subagentSessions: [],
            compactionSummaries: [],
          },
        }),
      });
      const session = createFileSession();
      const provider = createProvider([session]);
      const service = new AgentSessionArchiveService(
        WORKSPACE_URI,
        [provider],
        logger as any
      );
      await runOneCycle(service);

      expect(mockResolveCompanionData).toHaveBeenCalled();
    });
  });
});
