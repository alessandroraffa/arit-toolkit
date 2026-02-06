import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { window, workspace } from '../../mocks/vscode';
import {
  createTimestampedFileCommand,
  prefixTimestampToFileCommand,
} from '../../../../src/features/timestampedFile/command';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    stat: vi.fn(),
  },
}));

import * as fs from 'fs';

describe('timestampedFile commands', () => {
  let mockConfig: {
    timestampFormat: string;
    timestampSeparator: string;
  };
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-05T14:30:22.000Z'));

    mockConfig = {
      timestampFormat: 'YYYYMMDDHHmm',
      timestampSeparator: '-',
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createTimestampedFileCommand', () => {
    it('should show error when no folder is selected and no workspace is open', async () => {
      workspace.workspaceFolders = undefined;

      const command = createTimestampedFileCommand(mockConfig as any, mockLogger as any);

      await command(undefined);

      expect(window.showErrorMessage).toHaveBeenCalledWith(
        'ARIT: No folder selected or workspace open'
      );
    });

    it('should use workspace folder when no uri is provided', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace/folder' } }];
      window.showInputBox = vi.fn().mockResolvedValue('202602051430-test.md');
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      window.showTextDocument = vi.fn().mockResolvedValue(undefined);

      const command = createTimestampedFileCommand(mockConfig as any, mockLogger as any);

      await command(undefined);

      expect(window.showInputBox).toHaveBeenCalledWith({
        prompt: 'Enter file name',
        value: '202602051430-',
        valueSelection: [13, 13],
      });
    });

    it('should use provided uri folder path', async () => {
      const uri = { fsPath: '/custom/folder' };
      window.showInputBox = vi.fn().mockResolvedValue('202602051430-test.md');
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      window.showTextDocument = vi.fn().mockResolvedValue(undefined);

      const command = createTimestampedFileCommand(mockConfig as any, mockLogger as any);

      await command(uri as any);

      expect(window.showInputBox).toHaveBeenCalled();
    });

    it('should cancel when user dismisses input box', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      window.showInputBox = vi.fn().mockResolvedValue(undefined);

      const command = createTimestampedFileCommand(mockConfig as any, mockLogger as any);

      await command(undefined);

      expect(mockLogger.debug).toHaveBeenCalledWith('File creation cancelled by user');
      expect(workspace.fs.writeFile).not.toHaveBeenCalled();
    });

    it('should create file and open it on success', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      window.showInputBox = vi.fn().mockResolvedValue('202602051430-test.md');
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      window.showTextDocument = vi.fn().mockResolvedValue(undefined);

      const command = createTimestampedFileCommand(mockConfig as any, mockLogger as any);

      await command(undefined);

      expect(workspace.fs.writeFile).toHaveBeenCalled();
      expect(window.showTextDocument).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Created timestamped file: 202602051430-test.md'
      );
    });

    it('should handle errors gracefully', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      window.showInputBox = vi.fn().mockResolvedValue('202602051430-test.md');
      workspace.fs.writeFile = vi.fn().mockRejectedValue(new Error('Write failed'));

      const command = createTimestampedFileCommand(mockConfig as any, mockLogger as any);

      await command(undefined);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create file',
        'Write failed'
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        'ARIT: Failed to create file. See output for details.'
      );
    });

    it('should handle non-Error exceptions', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      window.showInputBox = vi.fn().mockResolvedValue('202602051430-test.md');
      workspace.fs.writeFile = vi.fn().mockRejectedValue('string error');

      const command = createTimestampedFileCommand(mockConfig as any, mockLogger as any);

      await command(undefined);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create file',
        'string error'
      );
    });
  });

  describe('prefixTimestampToFileCommand', () => {
    it('should show error when no file is selected', async () => {
      const command = prefixTimestampToFileCommand(mockConfig as any, mockLogger as any);

      await command(undefined);

      expect(window.showErrorMessage).toHaveBeenCalledWith('ARIT: No file selected');
    });

    it('should get file creation date and show input box', async () => {
      const uri = { fsPath: '/path/to/file.txt' };
      const birthtime = new Date('2020-06-15T09:45:30.000Z');

      vi.mocked(fs.promises.stat).mockResolvedValue({
        birthtime,
      } as unknown as Awaited<ReturnType<typeof fs.promises.stat>>);
      window.showInputBox = vi.fn().mockResolvedValue('202006150945-file.txt');
      workspace.fs.rename = vi.fn().mockResolvedValue(undefined);

      const command = prefixTimestampToFileCommand(mockConfig as any, mockLogger as any);

      await command(uri as any);

      expect(fs.promises.stat).toHaveBeenCalledWith('/path/to/file.txt');
      expect(window.showInputBox).toHaveBeenCalledWith({
        prompt: 'Confirm new file name',
        value: '202006150945-file.txt',
        valueSelection: [0, 0],
      });
    });

    it('should cancel when user dismisses input box', async () => {
      const uri = { fsPath: '/path/to/file.txt' };

      vi.mocked(fs.promises.stat).mockResolvedValue({
        birthtime: new Date(),
      } as unknown as Awaited<ReturnType<typeof fs.promises.stat>>);
      window.showInputBox = vi.fn().mockResolvedValue(undefined);

      const command = prefixTimestampToFileCommand(mockConfig as any, mockLogger as any);

      await command(uri as any);

      expect(mockLogger.debug).toHaveBeenCalledWith('File rename cancelled by user');
      expect(workspace.fs.rename).not.toHaveBeenCalled();
    });

    it('should rename file on success', async () => {
      const uri = { fsPath: '/path/to/file.txt' };
      const birthtime = new Date('2020-06-15T09:45:30.000Z');

      vi.mocked(fs.promises.stat).mockResolvedValue({
        birthtime,
      } as unknown as Awaited<ReturnType<typeof fs.promises.stat>>);
      window.showInputBox = vi.fn().mockResolvedValue('202006150945-file.txt');
      workspace.fs.rename = vi.fn().mockResolvedValue(undefined);

      const command = prefixTimestampToFileCommand(mockConfig as any, mockLogger as any);

      await command(uri as any);

      expect(workspace.fs.rename).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Renamed file: file.txt -> 202006150945-file.txt'
      );
    });

    it('should handle errors gracefully', async () => {
      const uri = { fsPath: '/path/to/file.txt' };

      vi.mocked(fs.promises.stat).mockRejectedValue(new Error('Stat failed'));

      const command = prefixTimestampToFileCommand(mockConfig as any, mockLogger as any);

      await command(uri as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to rename file',
        'Stat failed'
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        'ARIT: Failed to rename file. See output for details.'
      );
    });

    it('should handle non-Error exceptions', async () => {
      const uri = { fsPath: '/path/to/file.txt' };

      vi.mocked(fs.promises.stat).mockRejectedValue('string error');

      const command = prefixTimestampToFileCommand(mockConfig as any, mockLogger as any);

      await command(uri as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to rename file',
        'string error'
      );
    });
  });
});
