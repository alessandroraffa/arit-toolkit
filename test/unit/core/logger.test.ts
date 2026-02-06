import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { window, mockOutputChannel } from '../mocks/vscode';
import { Logger } from '../../../src/core/logger';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-05T14:30:22.000Z'));
    logger = Logger.getInstance();
  });

  afterEach(() => {
    logger.dispose();
    vi.useRealTimers();
  });

  describe('getInstance', () => {
    it('should create output channel on first call', () => {
      expect(window.createOutputChannel).toHaveBeenCalledWith('ARIT Toolkit');
    });

    it('should return singleton instance', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('setLevel', () => {
    it('should change the log level', () => {
      logger.setLevel('debug');
      logger.debug('test message');

      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
    });

    it('should filter messages below current level', () => {
      logger.setLevel('error');
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');

      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();

      logger.error('error message');
      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
    });
  });

  describe('debug', () => {
    it('should log debug messages when level is debug', () => {
      logger.setLevel('debug');
      logger.debug('test debug message');

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        '[2026-02-05T14:30:22.000Z] [DEBUG] test debug message'
      );
    });

    it('should not log debug messages when level is info', () => {
      logger.setLevel('info');
      logger.debug('test debug message');

      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info messages when level is info or higher', () => {
      logger.setLevel('info');
      logger.info('test info message');

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        '[2026-02-05T14:30:22.000Z] [INFO] test info message'
      );
    });

    it('should not log info messages when level is warn', () => {
      logger.setLevel('warn');
      logger.info('test info message');

      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should log warn messages when level is warn or higher', () => {
      logger.setLevel('warn');
      logger.warn('test warn message');

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        '[2026-02-05T14:30:22.000Z] [WARN] test warn message'
      );
    });

    it('should not log warn messages when level is error', () => {
      logger.setLevel('error');
      logger.warn('test warn message');

      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should log error messages when level is error or higher', () => {
      logger.setLevel('error');
      logger.error('test error message');

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        '[2026-02-05T14:30:22.000Z] [ERROR] test error message'
      );
    });

    it('should not log when level is off', () => {
      logger.setLevel('off');
      logger.error('test error message');

      expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
    });
  });

  describe('logging with arguments', () => {
    it('should include additional arguments in output', () => {
      logger.setLevel('info');
      logger.info('test message', 'arg1', { key: 'value' });

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        '[2026-02-05T14:30:22.000Z] [INFO] test message ["arg1",{"key":"value"}]'
      );
    });
  });

  describe('show', () => {
    it('should show the output channel', () => {
      logger.show();

      expect(mockOutputChannel.show).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should dispose the output channel', () => {
      logger.dispose();

      expect(mockOutputChannel.dispose).toHaveBeenCalled();
    });

    it('should allow creating new instance after dispose', () => {
      logger.dispose();
      vi.clearAllMocks();

      const newLogger = Logger.getInstance();
      expect(window.createOutputChannel).toHaveBeenCalled();
      expect(newLogger).toBeDefined();

      newLogger.dispose();
    });
  });
});
