import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { window, workspace } from '../../mocks/vscode';
import {
  createTimestampedDirectoryCommand,
  prefixTimestampToDirectoryCommand,
} from '../../../../src/features/timestampedDirectory/command';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    stat: vi.fn(),
  },
}));

import * as fs from 'fs';

describe('timestampedDirectory commands', () => {
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

  describe('createTimestampedDirectoryCommand', () => {
    it('should show error when no folder is selected and no workspace is open', async () => {
      workspace.workspaceFolders = undefined;

      const command = createTimestampedDirectoryCommand(
        mockConfig as any,
        mockLogger as any
      );

      await command(undefined);

      expect(window.showErrorMessage).toHaveBeenCalledWith(
        'ARIT: No folder selected or workspace open'
      );
    });

    it('should use workspace folder when no uri is provided', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace/folder' } }];
      window.showInputBox = vi.fn().mockResolvedValue('202602051430-notes');
      workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);

      const command = createTimestampedDirectoryCommand(
        mockConfig as any,
        mockLogger as any
      );

      await command(undefined);

      expect(window.showInputBox).toHaveBeenCalledWith({
        prompt: 'Enter directory name',
        value: '202602051430-',
        valueSelection: [13, 13],
      });
    });

    it('should use provided uri folder path', async () => {
      const uri = { fsPath: '/custom/folder' };
      window.showInputBox = vi.fn().mockResolvedValue('202602051430-notes');
      workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);

      const command = createTimestampedDirectoryCommand(
        mockConfig as any,
        mockLogger as any
      );

      await command(uri as any);

      expect(window.showInputBox).toHaveBeenCalled();
    });

    it('should cancel when user dismisses input box', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      window.showInputBox = vi.fn().mockResolvedValue(undefined);

      const command = createTimestampedDirectoryCommand(
        mockConfig as any,
        mockLogger as any
      );

      await command(undefined);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Directory creation cancelled by user'
      );
      expect(workspace.fs.createDirectory).not.toHaveBeenCalled();
    });

    it('should create directory on success', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      window.showInputBox = vi.fn().mockResolvedValue('202602051430-notes');
      workspace.fs.createDirectory = vi.fn().mockResolvedValue(undefined);

      const command = createTimestampedDirectoryCommand(
        mockConfig as any,
        mockLogger as any
      );

      await command(undefined);

      expect(workspace.fs.createDirectory).toHaveBeenCalled();
      expect(window.showTextDocument).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Created timestamped directory: 202602051430-notes'
      );
    });

    it('should handle errors gracefully', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      window.showInputBox = vi.fn().mockResolvedValue('202602051430-notes');
      workspace.fs.createDirectory = vi
        .fn()
        .mockRejectedValue(new Error('Create failed'));

      const command = createTimestampedDirectoryCommand(
        mockConfig as any,
        mockLogger as any
      );

      await command(undefined);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create directory',
        'Create failed'
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        'ARIT: Failed to create directory. See output for details.'
      );
    });

    it('should handle non-Error exceptions', async () => {
      workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      window.showInputBox = vi.fn().mockResolvedValue('202602051430-notes');
      workspace.fs.createDirectory = vi.fn().mockRejectedValue('string error');

      const command = createTimestampedDirectoryCommand(
        mockConfig as any,
        mockLogger as any
      );

      await command(undefined);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create directory',
        'string error'
      );
    });
  });

  describe('prefixTimestampToDirectoryCommand', () => {
    it('should show error when no directory is selected', async () => {
      const command = prefixTimestampToDirectoryCommand(
        mockConfig as any,
        mockLogger as any
      );

      await command(undefined);

      expect(window.showErrorMessage).toHaveBeenCalledWith('ARIT: No directory selected');
    });

    it('should get directory creation date and show input box', async () => {
      const uri = { fsPath: '/path/to/my-folder' };
      const birthtime = new Date('2020-06-15T09:45:30.000Z');

      vi.mocked(fs.promises.stat).mockResolvedValue({
        birthtime,
      } as unknown as Awaited<ReturnType<typeof fs.promises.stat>>);
      window.showInputBox = vi.fn().mockResolvedValue('202006150945-my-folder');
      workspace.fs.rename = vi.fn().mockResolvedValue(undefined);

      const command = prefixTimestampToDirectoryCommand(
        mockConfig as any,
        mockLogger as any
      );

      await command(uri as any);

      expect(fs.promises.stat).toHaveBeenCalledWith('/path/to/my-folder');
      expect(window.showInputBox).toHaveBeenCalledWith({
        prompt: 'Confirm new directory name',
        value: '202006150945-my-folder',
        valueSelection: [0, 0],
      });
    });

    it('should cancel when user dismisses input box', async () => {
      const uri = { fsPath: '/path/to/my-folder' };

      vi.mocked(fs.promises.stat).mockResolvedValue({
        birthtime: new Date(),
      } as unknown as Awaited<ReturnType<typeof fs.promises.stat>>);
      window.showInputBox = vi.fn().mockResolvedValue(undefined);

      const command = prefixTimestampToDirectoryCommand(
        mockConfig as any,
        mockLogger as any
      );

      await command(uri as any);

      expect(mockLogger.debug).toHaveBeenCalledWith('Directory rename cancelled by user');
      expect(workspace.fs.rename).not.toHaveBeenCalled();
    });

    it('should rename directory on success', async () => {
      const uri = { fsPath: '/path/to/my-folder' };
      const birthtime = new Date('2020-06-15T09:45:30.000Z');

      vi.mocked(fs.promises.stat).mockResolvedValue({
        birthtime,
      } as unknown as Awaited<ReturnType<typeof fs.promises.stat>>);
      window.showInputBox = vi.fn().mockResolvedValue('202006150945-my-folder');
      workspace.fs.rename = vi.fn().mockResolvedValue(undefined);

      const command = prefixTimestampToDirectoryCommand(
        mockConfig as any,
        mockLogger as any
      );

      await command(uri as any);

      expect(workspace.fs.rename).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Renamed directory: my-folder -> 202006150945-my-folder'
      );
    });

    it('should handle errors gracefully', async () => {
      const uri = { fsPath: '/path/to/my-folder' };

      vi.mocked(fs.promises.stat).mockRejectedValue(new Error('Stat failed'));

      const command = prefixTimestampToDirectoryCommand(
        mockConfig as any,
        mockLogger as any
      );

      await command(uri as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to rename directory',
        'Stat failed'
      );
      expect(window.showErrorMessage).toHaveBeenCalledWith(
        'ARIT: Failed to rename directory. See output for details.'
      );
    });

    it('should handle non-Error exceptions', async () => {
      const uri = { fsPath: '/path/to/my-folder' };

      vi.mocked(fs.promises.stat).mockRejectedValue('string error');

      const command = prefixTimestampToDirectoryCommand(
        mockConfig as any,
        mockLogger as any
      );

      await command(uri as any);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to rename directory',
        'string error'
      );
    });
  });
});
