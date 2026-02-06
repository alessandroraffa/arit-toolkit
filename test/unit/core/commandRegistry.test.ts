import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commands, mockDisposable } from '../mocks/vscode';
import { CommandRegistry } from '../../../src/core/commandRegistry';

describe('CommandRegistry', () => {
  let registry: CommandRegistry;
  let mockContext: { subscriptions: { push: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      subscriptions: { push: vi.fn() },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
});
