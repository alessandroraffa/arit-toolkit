import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commands, mockStatusBarItem, mockDisposable, window } from '../../mocks/vscode';
import { registerTextStatsFeature } from '../../../../src/features/textStats/index';
import type { FeatureRegistrationContext } from '../../../../src/features/index';

// Mock js-tiktoken
vi.mock('js-tiktoken', () => {
  const mockEncode = vi.fn((text: string) => text.split(/\s+/).filter(Boolean));
  return {
    getEncoding: vi.fn(() => ({ encode: mockEncode })),
  };
});

// Mock @anthropic-ai/tokenizer
vi.mock('@anthropic-ai/tokenizer', () => ({
  countTokens: vi.fn((text: string) => text.split(/\s+/).filter(Boolean).length),
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

describe('registerTextStatsFeature', () => {
  let ctx: FeatureRegistrationContext;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    vi.mocked(window.createStatusBarItem).mockReturnValue({ ...mockStatusBarItem });
  });

  it('should skip when not single-root workspace', () => {
    (ctx.stateManager as unknown as Record<string, unknown>).isSingleRoot = false;
    registerTextStatsFeature(ctx);
    expect(ctx.migrationRegistry.register).not.toHaveBeenCalled();
  });

  it('should register migration entry', () => {
    registerTextStatsFeature(ctx);
    expect(ctx.migrationRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'textStats' })
    );
  });

  it('should register service with state manager', () => {
    registerTextStatsFeature(ctx);
    expect(ctx.stateManager.registerService).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'textStats',
        toggleCommandId: 'arit.textStats.toggle',
      })
    );
  });

  it('should register toggle and tokenizer commands', () => {
    registerTextStatsFeature(ctx);
    expect(commands.registerCommand).toHaveBeenCalledWith(
      'arit.textStats.toggle',
      expect.any(Function)
    );
    expect(commands.registerCommand).toHaveBeenCalledWith(
      'arit.textStats.changeTokenizer',
      expect.any(Function)
    );
  });

  it('should create status bar item', () => {
    registerTextStatsFeature(ctx);
    expect(window.createStatusBarItem).toHaveBeenCalled();
  });

  it('should subscribe to state changes', () => {
    registerTextStatsFeature(ctx);
    expect(ctx.stateManager.onDidChangeState).toHaveBeenCalled();
  });

  it('should subscribe to config section changes', () => {
    registerTextStatsFeature(ctx);
    expect(ctx.stateManager.onConfigSectionChanged).toHaveBeenCalledWith(
      'textStats',
      expect.any(Function)
    );
  });

  it('should push disposables to subscriptions', () => {
    registerTextStatsFeature(ctx);
    // status bar item + controller disposable + 2 commands + state listener + section listener + 3 editor listeners
    expect(ctx.context.subscriptions.length).toBeGreaterThanOrEqual(5);
  });
});
