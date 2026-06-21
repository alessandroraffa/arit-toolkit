import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workspace } from '../../mocks/vscode';

const { mockCheckAndPromptGitignore, mockResolveCompanionData } = vi.hoisted(() => ({
  mockCheckAndPromptGitignore: vi.fn().mockResolvedValue(undefined),
  mockResolveCompanionData: vi.fn(),
}));

vi.mock('../../../../src/features/agentSessionsArchiving/gitignorePrompt', () => ({
  checkAndPromptGitignore: mockCheckAndPromptGitignore,
}));

vi.mock('../../../../src/features/agentSessionsArchiving/companionDataResolver', () => ({
  resolveCompanionData: mockResolveCompanionData,
}));

import { AgentSessionArchiveService } from '../../../../src/features/agentSessionsArchiving/archiveService';
import type {
  SessionProvider,
  SessionFile,
} from '../../../../src/features/agentSessionsArchiving/types';
import type { AgentSessionsArchivingConfig } from '../../../../src/types';
import { MAX_ARCHIVE_BYTES } from '../../../../src/features/agentSessionsArchiving/constants';

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

function createMockSession(overrides: Partial<SessionFile> = {}): SessionFile {
  return {
    uri: { fsPath: '/source/session.jsonl' } as any,
    providerName: 'claude-code',
    archiveName: 'claude-code-testsession',
    displayName: 'Claude Code testsession.jsonl',
    mtime: 5000,
    ctime: 1_609_459_200_000, // 2021-01-01T00:00:00Z → 202101010000
    extension: '.jsonl',
    ...overrides,
  };
}

function createMockProvider(sessions: SessionFile[]): SessionProvider {
  return {
    name: 'test-provider',
    displayName: 'Test Provider',
    findSessions: vi.fn().mockResolvedValue(sessions),
  };
}

const DEFAULT_CONFIG: AgentSessionsArchivingConfig = {
  enabled: true,
  archivePath: 'docs/archive/agent-sessions',
  intervalMinutes: 5,
};

const workspaceRootUri = { fsPath: '/workspace' } as any;

// A valid JSONL that produces a non-empty archive
const VALID_JSONL = [
  JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  }),
  JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there.' }] },
  }),
].join('\n');

describe('AgentSessionArchiveService — H-07: max-archive-bytes ceiling', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    logger = createMockLogger();
    workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);
    workspace.fs.delete = vi.fn().mockResolvedValue(undefined);
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
    workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 100, ctime: 90, size: 10 });
    mockResolveCompanionData.mockResolvedValue({
      subagentEntries: [],
      toolResultMap: new Map(),
      compactionEntries: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('H-07: archive exceeding MAX_ARCHIVE_BYTES is written truncated with elision banner', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(VALID_JSONL));

    let writtenContent = '';
    workspace.fs.writeFile = vi
      .fn()
      .mockImplementation((_uri: unknown, data: Uint8Array) => {
        writtenContent = new TextDecoder().decode(data);
        return Promise.resolve();
      });

    // Provide a very large tool-result so the rendered markdown exceeds MAX_ARCHIVE_BYTES
    const hugeContent = 'x'.repeat(MAX_ARCHIVE_BYTES + 1000);
    // The companion resolver is mocked; we simulate a huge rendered result by
    // providing content that renderSessionToMarkdown will embed verbatim via
    // a tool-result marker that the parser has already resolved.
    // To keep this unit test simple, we instead inject content inline via the
    // assistant turn text so the rendered markdown is large.
    const bigJsonl = [
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: hugeContent }],
        },
      }),
    ].join('\n');
    workspace.fs.readFile = vi.fn().mockResolvedValue(new TextEncoder().encode(bigJsonl));

    const session = createMockSession({ mtime: 5000, compositeMtime: '5000' });
    const service = new AgentSessionArchiveService(
      workspaceRootUri,
      [createMockProvider([session])],
      logger as any
    );
    (service as any)._currentConfig = DEFAULT_CONFIG;
    (service as any)._needsDedup = false;

    await service.runArchiveCycle();

    expect(workspace.fs.writeFile).toHaveBeenCalled();
    // Written content must not exceed MAX_ARCHIVE_BYTES plus the banner overhead
    expect(writtenContent.length).toBeLessThanOrEqual(MAX_ARCHIVE_BYTES + 500);
    // Elision banner must be present
    expect(writtenContent).toContain('Archive truncated');
    expect(writtenContent).toContain('bytes elided');
    // Warn logged
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('exceeded max size')
    );
  });

  it('H-07: archive within MAX_ARCHIVE_BYTES is written without truncation', async () => {
    workspace.fs.readFile = vi
      .fn()
      .mockResolvedValue(new TextEncoder().encode(VALID_JSONL));

    let writtenContent = '';
    workspace.fs.writeFile = vi
      .fn()
      .mockImplementation((_uri: unknown, data: Uint8Array) => {
        writtenContent = new TextDecoder().decode(data);
        return Promise.resolve();
      });

    const session = createMockSession({ mtime: 5000, compositeMtime: '5000' });
    const service = new AgentSessionArchiveService(
      workspaceRootUri,
      [createMockProvider([session])],
      logger as any
    );
    (service as any)._currentConfig = DEFAULT_CONFIG;
    (service as any)._needsDedup = false;

    await service.runArchiveCycle();

    expect(workspace.fs.writeFile).toHaveBeenCalled();
    expect(writtenContent).not.toContain('Archive truncated');
  });
});
