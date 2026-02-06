import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commands, mockDisposable, window } from '../mocks/vscode';
import { CommandRegistry } from '../../../src/core/commandRegistry';

describe('CommandRegistry', () => {
  let registry: CommandRegistry;
  let mockContext: { subscriptions: { push: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      subscriptions: { push: vi.fn() },
    };

    registry = new CommandRegistry(mockContext as any);
  });

  describe('register', () => {
    it('should register a command with vscode', () => {
      const handler = vi.fn();
      registry.register('test.command', handler);

      expect(commands.registerCommand).toHaveBeenCalledWith('test.command', handler);
    });

    it('should add disposable to context subscriptions', () => {
      const handler = vi.fn();
      registry.register('test.command', handler);

      expect(mockContext.subscriptions.push).toHaveBeenCalledWith(mockDisposable);
    });

    it('should register multiple commands', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registry.register('test.command1', handler1);
      registry.register('test.command2', handler2);

      expect(commands.registerCommand).toHaveBeenCalledTimes(2);
      expect(mockContext.subscriptions.push).toHaveBeenCalledTimes(2);
    });
  });

  describe('registerGuarded', () => {
    it('should register command with vscode', () => {
      const handler = vi.fn();
      registry.registerGuarded('test.guarded', handler);

      expect(commands.registerCommand).toHaveBeenCalledWith(
        'test.guarded',
        expect.any(Function)
      );
    });

    it('should execute handler when no stateManager is provided', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      // registry was created without stateManager in beforeEach
      registry.registerGuarded('test.guarded', handler);

      const registeredHandler = vi.mocked(commands.registerCommand).mock
        .calls[0][1] as () => Promise<void>;
      await registeredHandler();

      expect(handler).toHaveBeenCalled();
    });

    it('should execute handler when stateManager says enabled', async () => {
      const mockStateManager = { isEnabled: true };
      const registryWithState = new CommandRegistry(
        mockContext as any,

        mockStateManager as any
      );

      const handler = vi.fn().mockResolvedValue(undefined);
      registryWithState.registerGuarded('test.guarded', handler);

      const registeredHandler = vi.mocked(commands.registerCommand).mock
        .calls[0][1] as () => Promise<void>;
      await registeredHandler();

      expect(handler).toHaveBeenCalled();
      expect(window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('should show warning and not execute handler when stateManager says disabled', async () => {
      const mockStateManager = { isEnabled: false };
      const registryWithState = new CommandRegistry(
        mockContext as any,

        mockStateManager as any
      );

      const handler = vi.fn().mockResolvedValue(undefined);
      registryWithState.registerGuarded('test.guarded', handler);

      const registeredHandler = vi.mocked(commands.registerCommand).mock
        .calls[0][1] as () => Promise<void>;
      await registeredHandler();

      expect(handler).not.toHaveBeenCalled();
      expect(window.showWarningMessage).toHaveBeenCalledWith(
        'ARIT Toolkit is currently disabled for this workspace. ' +
          'Click the ARIT icon in the status bar to re-enable it.'
      );
    });

    it('should add disposable to context subscriptions', () => {
      const handler = vi.fn();
      registry.registerGuarded('test.guarded', handler);

      expect(mockContext.subscriptions.push).toHaveBeenCalledWith(mockDisposable);
    });
  });
});
