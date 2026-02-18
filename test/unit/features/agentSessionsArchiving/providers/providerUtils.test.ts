import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace } from '../../../mocks/vscode';
import {
  getFileTimes,
  belongsToWorkspace,
} from '../../../../../src/features/agentSessionsArchiving/providers/providerUtils';

describe('providerUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFileTimes', () => {
    it('should return mtime and ctime when stat succeeds', async () => {
      workspace.fs.stat = vi.fn().mockResolvedValue({ mtime: 42000, ctime: 40000 });

      const result = await getFileTimes({ fsPath: '/some/file' } as any);

      expect(result).toEqual({ mtime: 42000, ctime: 40000 });
    });

    it('should return undefined when stat fails', async () => {
      workspace.fs.stat = vi.fn().mockRejectedValue(new Error('not found'));

      const result = await getFileTimes({ fsPath: '/missing' } as any);

      expect(result).toBeUndefined();
    });
  });

  describe('belongsToWorkspace', () => {
    it('should return true when content contains workspace path', async () => {
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('some text /projects/my-app more text')
        );

      const result = await belongsToWorkspace(
        { fsPath: '/file' } as any,
        '/projects/my-app'
      );

      expect(result).toBe(true);
    });

    it('should return true when content contains normalized path with trailing sep', async () => {
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode('cwd: /projects/my-app/ end'));

      const result = await belongsToWorkspace(
        { fsPath: '/file' } as any,
        '/projects/my-app'
      );

      expect(result).toBe(true);
    });

    it('should return false when content does not contain workspace path', async () => {
      workspace.fs.readFile = vi
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode('some text /projects/other-app more text')
        );

      const result = await belongsToWorkspace(
        { fsPath: '/file' } as any,
        '/projects/my-app'
      );

      expect(result).toBe(false);
    });

    it('should return false when read fails', async () => {
      workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('read error'));

      const result = await belongsToWorkspace(
        { fsPath: '/file' } as any,
        '/projects/my-app'
      );

      expect(result).toBe(false);
    });
  });
});
