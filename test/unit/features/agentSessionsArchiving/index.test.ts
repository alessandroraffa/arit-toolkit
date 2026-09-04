import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Uri, mockDisposable, window } from '../../mocks/vscode';
import { registerAgentSessionsArchivingFeature } from '../../../../src/features/agentSessionsArchiving/index';
import type { FeatureRegistrationContext } from '../../../../src/features/index';

vi.mock('../../../../src/features/agentSessionsArchiving/providers', () => ({
  getDefaultProviders: vi.fn(() => []),
}));

const {
  mockService,
  mockArchiveServiceConstructor,
  mockWatcher,
  mockSessionFileWatcherConstructor,
} = vi.hoisted(() => {
  const service = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    reconfigure: vi.fn(),
    runArchiveCycle: vi.fn().mockResolvedValue(undefined),
    archiveSource: vi.fn().mockResolvedValue('2026/08/archive.md'),
    archiveOpenCodeStore: vi.fn().mockResolvedValue([]),
    currentConfig: undefined as unknown,
    dispose: vi.fn(),
  };

  const archiveServiceConstructor = vi.fn(function MockArchiveService() {
    return service;
  });

  const watcher = {
    start: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
  };

  const sessionFileWatcherConstructor = vi.fn(function MockSessionFileWatcher() {
    return watcher;
  });

  return {
    mockService: service,
    mockArchiveServiceConstructor: archiveServiceConstructor,
    mockWatcher: watcher,
    mockSessionFileWatcherConstructor: sessionFileWatcherConstructor,
  };
});

vi.mock('../../../../src/features/agentSessionsArchiving/archiveService', () => ({
  AgentSessionArchiveService: mockArchiveServiceConstructor,
}));

vi.mock('../../../../src/features/agentSessionsArchiving/sessionFileWatcher', () => ({
  SessionFileWatcher: mockSessionFileWatcherConstructor,
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
    mockService.currentConfig = undefined;
    mockService.runArchiveCycle.mockResolvedValue(undefined);
    mockService.archiveSource.mockResolvedValue('2026/08/archive.md');
    mockService.archiveOpenCodeStore.mockResolvedValue([]);
    mockWatcher.start.mockClear();
    mockWatcher.stop.mockClear();
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
      'tangyr.toggleAgentSessionsArchiving',
      expect.any(Function)
    );
  });

  it('should register archive now command', () => {
    registerAgentSessionsArchivingFeature(ctx);
    expect(ctx.registry.register).toHaveBeenCalledWith(
      'tangyr.archiveAgentSessionsNow',
      expect.any(Function)
    );
  });

  it('should register archive source command', () => {
    registerAgentSessionsArchivingFeature(ctx);
    expect(ctx.registry.register).toHaveBeenCalledWith(
      'tangyr.archiveAgentSessionSource',
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

  describe('archive now command', () => {
    it('should run archive cycle when service is running', async () => {
      mockService.currentConfig = { enabled: true };
      registerAgentSessionsArchivingFeature(ctx);

      const registerCalls = vi.mocked(ctx.registry.register).mock.calls;
      const archiveNowCall = registerCalls.find(
        (c) => c[0] === 'tangyr.archiveAgentSessionsNow'
      );
      const handler = archiveNowCall![1] as () => Promise<void>;
      await handler();

      expect(mockService.runArchiveCycle).toHaveBeenCalledWith(true);
    });

    it('should show information message after archive cycle completes', async () => {
      mockService.currentConfig = { enabled: true };
      registerAgentSessionsArchivingFeature(ctx);

      const registerCalls = vi.mocked(ctx.registry.register).mock.calls;
      const archiveNowCall = registerCalls.find(
        (c) => c[0] === 'tangyr.archiveAgentSessionsNow'
      );
      const handler = archiveNowCall![1] as () => Promise<void>;
      await handler();

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'Agent sessions archive completed.'
      );
    });

    it('should show warning when service is not running', async () => {
      mockService.currentConfig = undefined;
      registerAgentSessionsArchivingFeature(ctx);

      const registerCalls = vi.mocked(ctx.registry.register).mock.calls;
      const archiveNowCall = registerCalls.find(
        (c) => c[0] === 'tangyr.archiveAgentSessionsNow'
      );
      const handler = archiveNowCall![1] as () => Promise<void>;
      await handler();

      expect(mockService.runArchiveCycle).not.toHaveBeenCalled();
      expect(window.showWarningMessage).toHaveBeenCalled();
    });
  });

  describe('archive source command', () => {
    it('passes an explicit path and provider to the shared archive pipeline', async () => {
      vi.mocked(ctx.stateManager.getConfigSection).mockReturnValue({
        enabled: true,
        archivePath: '.tangyr/agent-sessions',
        intervalMinutes: 5,
      });
      registerAgentSessionsArchivingFeature(ctx);

      const registerCalls = vi.mocked(ctx.registry.register).mock.calls;
      const archiveSourceCall = registerCalls.find(
        (call) => call[0] === 'tangyr.archiveAgentSessionSource'
      );
      const handler = archiveSourceCall![1] as (
        source: string,
        provider: string
      ) => Promise<void>;
      await handler('/sessions/example.jsonl', 'claude-code');

      expect(mockService.archiveSource).toHaveBeenCalledWith(
        expect.objectContaining({ fsPath: '/sessions/example.jsonl' }),
        'claude-code',
        '.tangyr/agent-sessions'
      );
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'Agent session archived to .tangyr/agent-sessions/2026/08/archive.md'
      );
    });

    it('imports all workspace sessions from an explicit OpenCode database', async () => {
      vi.mocked(ctx.stateManager.getConfigSection).mockReturnValue({
        enabled: true,
        archivePath: '.tangyr/agent-sessions',
        intervalMinutes: 5,
      });
      mockService.archiveOpenCodeStore.mockResolvedValue([
        '2026/08/open-code-one.md',
        '2026/08/open-code-two.md',
      ]);
      registerAgentSessionsArchivingFeature(ctx);

      const archiveSourceCall = vi
        .mocked(ctx.registry.register)
        .mock.calls.find((call) => call[0] === 'tangyr.archiveAgentSessionSource');
      const handler = archiveSourceCall![1] as (
        source: string,
        provider: string
      ) => Promise<void>;
      await handler('/stores/opencode.db', 'open-code');

      expect(mockService.archiveOpenCodeStore).toHaveBeenCalledWith(
        expect.objectContaining({ fsPath: '/stores/opencode.db' }),
        '.tangyr/agent-sessions'
      );
      expect(mockService.archiveSource).not.toHaveBeenCalled();
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'Archived 2 OpenCode session(s) to .tangyr/agent-sessions'
      );
    });
  });

  it('should add watcher to subscriptions', () => {
    registerAgentSessionsArchivingFeature(ctx);
    expect(ctx.context.subscriptions).toContain(mockWatcher);
  });

  it('should register service with archive now action', () => {
    registerAgentSessionsArchivingFeature(ctx);
    expect(ctx.stateManager.registerService).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            commandId: 'tangyr.archiveAgentSessionsNow',
            label: 'Archive Now',
          }),
          expect.objectContaining({
            commandId: 'tangyr.archiveAgentSessionSource',
            label: 'Archive Source…',
          }),
        ]),
      })
    );
  });

  describe('onDidChangeState idempotency guard', () => {
    const fixedConfig = {
      enabled: true,
      archivePath: 'docs/archive/agent-sessions',
      intervalMinutes: 5,
    };

    it('onDidChangeState does not call service.start when service is already running with equal config', () => {
      vi.mocked(ctx.stateManager.getConfigSection).mockReturnValue(fixedConfig);
      mockService.currentConfig = fixedConfig;
      const startSpy = vi.spyOn(mockService, 'start');

      registerAgentSessionsArchivingFeature(ctx);

      const onDidChangeStateCalls = vi.mocked(ctx.stateManager.onDidChangeState).mock
        .calls;
      const stateCallback = onDidChangeStateCalls[0]?.[0] as
        | ((globalEnabled: boolean) => void)
        | undefined;
      expect(stateCallback).toBeDefined();

      startSpy.mockClear();
      stateCallback!(true);

      expect(startSpy).not.toHaveBeenCalled();
    });

    it('onDidChangeState calls service.start when service is running with a different config', () => {
      const differentConfig = { ...fixedConfig, intervalMinutes: 10 };
      vi.mocked(ctx.stateManager.getConfigSection).mockReturnValue(differentConfig);
      mockService.currentConfig = fixedConfig;
      const startSpy = vi.spyOn(mockService, 'start');

      registerAgentSessionsArchivingFeature(ctx);

      const onDidChangeStateCalls = vi.mocked(ctx.stateManager.onDidChangeState).mock
        .calls;
      const stateCallback = onDidChangeStateCalls[0]?.[0] as
        | ((globalEnabled: boolean) => void)
        | undefined;
      expect(stateCallback).toBeDefined();

      startSpy.mockClear();
      stateCallback!(true);

      expect(startSpy).toHaveBeenCalledOnce();
    });
  });
});
