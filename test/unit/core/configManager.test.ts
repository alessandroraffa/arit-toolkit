import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace, mockDisposable } from '../mocks/vscode';
import { ConfigManager } from '../../../src/core/configManager';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let mockGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet = vi.fn();
    workspace.getConfiguration = vi.fn(() => ({
      get: mockGet,
    }));
    configManager = new ConfigManager();
  });

  describe('timestampFormat', () => {
    it('should return configured timestamp format', () => {
      mockGet.mockReturnValue('YYYYMMDD');

      expect(configManager.timestampFormat).toBe('YYYYMMDD');
      expect(workspace.getConfiguration).toHaveBeenCalledWith('arit');
      expect(mockGet).toHaveBeenCalledWith('timestampFormat');
    });

    it('should return default format when not configured', () => {
      mockGet.mockReturnValue(undefined);

      expect(configManager.timestampFormat).toBe('YYYYMMDDHHmm');
    });
  });

  describe('timestampSeparator', () => {
    it('should return configured separator', () => {
      mockGet.mockReturnValue('_');

      expect(configManager.timestampSeparator).toBe('_');
      expect(mockGet).toHaveBeenCalledWith('timestampSeparator');
    });

    it('should return default separator when not configured', () => {
      mockGet.mockReturnValue(undefined);

      expect(configManager.timestampSeparator).toBe('-');
    });
  });

  describe('logLevel', () => {
    it('should return configured log level', () => {
      mockGet.mockReturnValue('debug');

      expect(configManager.logLevel).toBe('debug');
      expect(mockGet).toHaveBeenCalledWith('logLevel');
    });

    it('should return default log level when not configured', () => {
      mockGet.mockReturnValue(undefined);

      expect(configManager.logLevel).toBe('info');
    });
  });

  describe('onConfigChange', () => {
    it('should register configuration change listener', () => {
      const callback = vi.fn();
      const disposable = configManager.onConfigChange(callback);

      expect(workspace.onDidChangeConfiguration).toHaveBeenCalled();
      expect(disposable).toBe(mockDisposable);
    });

    it('should call callback when arit configuration changes', () => {
      const callback = vi.fn();
      let registeredHandler: (e: {
        affectsConfiguration: (s: string) => boolean;
      }) => void = () => {};

      workspace.onDidChangeConfiguration = vi.fn((handler) => {
        registeredHandler = handler;
        return mockDisposable;
      });

      configManager.onConfigChange(callback);

      // Simulate configuration change for 'arit' section
      registeredHandler({ affectsConfiguration: (section) => section === 'arit' });

      expect(callback).toHaveBeenCalled();
    });

    it('should not call callback when other configuration changes', () => {
      const callback = vi.fn();
      let registeredHandler: (e: {
        affectsConfiguration: (s: string) => boolean;
      }) => void = () => {};

      workspace.onDidChangeConfiguration = vi.fn((handler) => {
        registeredHandler = handler;
        return mockDisposable;
      });

      configManager.onConfigChange(callback);

      // Simulate configuration change for different section
      registeredHandler({ affectsConfiguration: (section) => section === 'other' });

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
