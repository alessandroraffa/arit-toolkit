import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Uri, mockDisposable } from '../../mocks/vscode';
import { registerAgentSessionsArchivingFeature } from '../../../../src/features/agentSessionsArchiving/index';
import type { FeatureRegistrationContext } from '../../../../src/features/index';

vi.mock('../../../../src/features/agentSessionsArchiving/providers', () => ({
  getDefaultProviders: vi.fn(() => []),
}));

vi.mock('../../../../src/features/agentSessionsArchiving/archiveService', () => ({
  AgentSessionArchiveService: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    reconfigure: vi.fn(),
    currentConfig: undefined,
    dispose: vi.fn(),
  })),
}));

function createMockContext(): FeatureRegistrationContext {
  const subscriptions: unknown[] = [];
  return {
    registry: {
      register: vi.fn(),
      execute: vi.fn(),
    } as unknown as FeatureRegistrationContext['registry'],
    stateManager: {
      isSingleRoot: true,
      workspaceRootUri: Uri.file('/test-workspace'),
      getConfigSection: vi.fn(),
      registerService: vi.fn(),
      updateConfigSection: vi.fn(),
      onDidChangeState: vi.fn(() => mockDisposable),
      onConfigSectionChanged: vi.fn(() => mockDisposable),
    } as unknown as FeatureRegistrationContext['stateManager'],
    config: {} as unknown as FeatureRegistrationContext['config'],
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as FeatureRegistrationContext['logger'],
    context: {
      subscriptions,
    } as unknown as import('vscode').ExtensionContext,
    migrationRegistry: {
      register: vi.fn(),
    } as unknown as FeatureRegistrationContext['migrationRegistry'],
  };
}

describe('registerAgentSessionsArchivingFeature', () => {
  let ctx: FeatureRegistrationContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
  });

  it('should skip when not single-root workspace', () => {
    (ctx.stateManager as unknown as Record<string, unknown>).isSingleRoot = false;
    registerAgentSessionsArchivingFeature(ctx);
    expect(ctx.migrationRegistry.register).not.toHaveBeenCalled();
  });

  it('should skip when no workspace root', () => {
    (ctx.stateManager as unknown as Record<string, unknown>).workspaceRootUri = undefined;
    registerAgentSessionsArchivingFeature(ctx);
    expect(ctx.migrationRegistry.register).not.toHaveBeenCalled();
  });

  it('should register migration entry', () => {
    registerAgentSessionsArchivingFeature(ctx);
    expect(ctx.migrationRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'agentSessionsArchiving' })
    );
  });

  it('should register toggle command', () => {
    registerAgentSessionsArchivingFeature(ctx);
    expect(ctx.registry.register).toHaveBeenCalledWith(
      'arit.toggleAgentSessionsArchiving',
      expect.any(Function)
    );
  });

  it('should subscribe to state changes', () => {
    registerAgentSessionsArchivingFeature(ctx);
    expect(ctx.stateManager.onDidChangeState).toHaveBeenCalled();
  });

  it('should subscribe to config section changes', () => {
    registerAgentSessionsArchivingFeature(ctx);
    expect(ctx.stateManager.onConfigSectionChanged).toHaveBeenCalledWith(
      'agentSessionsArchiving',
      expect.any(Function)
    );
  });
});
