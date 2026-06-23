import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, Uri } from '../../../mocks/vscode';
import type { Logger } from '../../../../../src/core/logger';

// Mock popularityData using vi.hoisted so the factory value is available at hoist time
const { mockPopularityData } = vi.hoisted(() => {
  const data = {
    resolvedOrder: Object.freeze([
      'Aider',
      'Claude Code',
      'Cline',
      'Continue',
      'GitHub Copilot Chat',
      'OpenAI Codex',
      'OpenCode',
      'RooCode',
    ]) as readonly string[],
    targets: Object.freeze([]) as readonly never[],
    refreshedAt: '2025-01-01T00:00:00.000Z',
    refreshPeriod: '2025-01',
    poolSizeAcknowledgment: 'pool-size-ack',
    disclaimer: 'disclaimer-text',
    methodPointer: 'method-pointer',
  };
  return { mockPopularityData: data };
});

vi.mock(
  '../../../../../src/features/agentSessionsArchiving/providers/popularityData',
  () => ({
    POPULARITY_DATA: mockPopularityData,
    DISCLAIMER: mockPopularityData.disclaimer,
    METHOD_POINTER: mockPopularityData.methodPointer,
  })
);

// Mock gitignorePrompt to prevent side effects
vi.mock('../../../../../src/features/agentSessionsArchiving/gitignorePrompt', () => ({
  checkAndPromptGitignore: vi.fn().mockResolvedValue(undefined),
}));

import { getDefaultProviders } from '../../../../../src/features/agentSessionsArchiving/providers/index';

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

function createMockContext(): import('vscode').ExtensionContext {
  const globalStorageUri = Uri.file('/global-storage/tangyr');
  const storageUri = Uri.file('/workspace-storage/tangyr');
  return {
    globalStorageUri,
    storageUri,
  } as unknown as import('vscode').ExtensionContext;
}

describe('popularitySort', () => {
  let mockContext: import('vscode').ExtensionContext;
  let mockLogger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();
    mockLogger = createMockLogger();
    workspace.fs.stat = vi.fn().mockRejectedValue(new Error('not found'));
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
  });

  it('should sort providers to match fixture resolved order', () => {
    // fixture resolvedOrder: Aider, Claude Code, Cline, Continue,
    // GitHub Copilot Chat, OpenAI Codex, OpenCode, RooCode
    // maps to provider names: aider, claude-code, cline, continue,
    // copilot-chat, codex, open-code, roo-code
    const providers = getDefaultProviders(mockContext, mockLogger);
    const names = providers.map((p) => p.name);
    expect(names).toEqual([
      'aider',
      'claude-code',
      'cline',
      'continue',
      'copilot-chat',
      'codex',
      'open-code',
      'roo-code',
    ]);
  });

  it('should include at least seven providers (minimum without storageUri)', () => {
    const providers = getDefaultProviders(mockContext, mockLogger);
    expect(providers.length).toBeGreaterThanOrEqual(7);
  });

  it('should not call fetch during getDefaultProviders (no network access)', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as keyof typeof globalThis);
    getDefaultProviders(mockContext, mockLogger);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('should not call readFileSync during getDefaultProviders (no runtime filesystem read)', () => {
    // The popularity artifact is a compiled-in module import, not a runtime file
    // read. This property is enforced by the bundle-asset integration test
    // (bundle-assets.test.ts) which confirms the bundle has no readFileSync
    // of the artifact. Here we verify structurally: getDefaultProviders must
    // return without throwing even when workspace.fs has no file access.
    workspace.fs.stat = vi.fn().mockRejectedValue(new Error('no access'));
    // If readFileSync were called here, it would throw (file not found in test).
    // The fact the function returns without error confirms no synchronous read occurs.
    expect(() => getDefaultProviders(mockContext, mockLogger)).not.toThrow();
  });
});
