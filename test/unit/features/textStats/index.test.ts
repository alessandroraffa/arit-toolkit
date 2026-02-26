import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commands, mockStatusBarItem, mockDisposable, window } from '../../mocks/vscode';
import { registerTextStatsFeature } from '../../../../src/features/textStats/index';
import type { FeatureRegistrationContext } from '../../../../src/features/index';

// Mock js-tiktoken
vi.mock('js-tiktoken', () => {
  const mockEncode = vi.fn((text: string) => text.split(/\s+/).filter(Boolean));
  return {
    Tiktoken: vi.fn(() => ({ encode: mockEncode })),
    getEncoding: vi.fn(() => ({ encode: mockEncode })),
  };
});

// Mock claude.json ranks
vi.mock('@anthropic-ai/tokenizer/dist/cjs/claude.json', () => ({
  default: { bpe_ranks: 'mock', special_tokens: {}, pat_str: '.' },
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

  describe('onDidChangeState listener', () => {
    it('should NOT activate when config section does not exist in state manager', () => {
      // Capture the onDidChangeState listener
      let stateListener: ((globalEnabled: boolean) => void) | undefined;
      vi.mocked(ctx.stateManager.onDidChangeState).mockImplementation(
        (listener: (enabled: boolean) => void) => {
          stateListener = listener;
          return mockDisposable;
        }
      );
      // getConfigSection returns undefined (section not yet added via migration)
      vi.mocked(ctx.stateManager.getConfigSection).mockReturnValue(undefined);

      const item = { ...mockStatusBarItem };
      vi.mocked(window.createStatusBarItem).mockReturnValue(item);

      registerTextStatsFeature(ctx);

      // Simulate: onDidChangeState fires with true BEFORE migration adds the section
      expect(stateListener).toBeDefined();
      stateListener!(true);

      // textStats should NOT show — user hasn't accepted the feature yet
      expect(item.show).not.toHaveBeenCalled();
    });

    it('should activate when config section exists and is enabled', () => {
      let stateListener: ((globalEnabled: boolean) => void) | undefined;
      vi.mocked(ctx.stateManager.onDidChangeState).mockImplementation(
        (listener: (enabled: boolean) => void) => {
          stateListener = listener;
          return mockDisposable;
        }
      );
      vi.mocked(ctx.stateManager.getConfigSection).mockReturnValue({
        enabled: true,
        delimiter: ' | ',
        unitSpace: true,
        wpm: 200,
        tokenizer: 'o200k',
        includeWhitespace: true,
        tokenSizeLimit: 500_000,
        visibleMetrics: ['chars'],
      });

      const item = { ...mockStatusBarItem };
      vi.mocked(window.createStatusBarItem).mockReturnValue(item);

      registerTextStatsFeature(ctx);
      stateListener!(true);

      // textStats SHOULD show — section exists and is enabled
      expect(item.show).toHaveBeenCalled();
    });

    it('should NOT activate when config section exists but is disabled', () => {
      let stateListener: ((globalEnabled: boolean) => void) | undefined;
      vi.mocked(ctx.stateManager.onDidChangeState).mockImplementation(
        (listener: (enabled: boolean) => void) => {
          stateListener = listener;
          return mockDisposable;
        }
      );
      vi.mocked(ctx.stateManager.getConfigSection).mockReturnValue({
        enabled: false,
        delimiter: ' | ',
        unitSpace: true,
        wpm: 200,
        tokenizer: 'o200k',
        includeWhitespace: true,
        tokenSizeLimit: 500_000,
        visibleMetrics: ['chars'],
      });

      const item = { ...mockStatusBarItem };
      vi.mocked(window.createStatusBarItem).mockReturnValue(item);

      registerTextStatsFeature(ctx);
      stateListener!(true);

      expect(item.show).not.toHaveBeenCalled();
    });
  });
});
