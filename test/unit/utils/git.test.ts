import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));
vi.mock('node:util', () => ({
  promisify:
    () =>
    (...args: unknown[]) =>
      new Promise((resolve, reject) => {
        mockExecFile(...args, (err: Error | null, stdout: string, stderr: string) => {
          if (err) {
            reject(err);
          } else {
            resolve({ stdout, stderr });
          }
        });
      }),
}));

// Must import after mocks are set up
const { isGitIgnored, gitStageAndCommit, hasGitChanges } =
  await import('../../../src/utils/git');

describe('isGitIgnored', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when file is ignored (exit code 0)', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (...args: unknown[]) => void
      ) => {
        cb(null, '', '');
      }
    );

    const result = await isGitIgnored('.arit-toolkit.jsonc', '/workspace');
    expect(result).toBe(true);
  });

  it('should return false when file is NOT ignored (exit code 1)', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (...args: unknown[]) => void
      ) => {
        const err = new Error('exit code 1');
        (err as any).code = 1;
        cb(err, '', '');
      }
    );

    const result = await isGitIgnored('.arit-toolkit.jsonc', '/workspace');
    expect(result).toBe(false);
  });

  it('should return true when git is not installed (ENOENT)', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (...args: unknown[]) => void
      ) => {
        const err = new Error('not found');
        (err as any).code = 'ENOENT';
        cb(err, '', '');
      }
    );

    const result = await isGitIgnored('.arit-toolkit.jsonc', '/workspace');
    expect(result).toBe(true);
  });

  it('should return true when not a git repo (exit code 128)', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (...args: unknown[]) => void
      ) => {
        const err = new Error('not a git repo');
        (err as any).code = 128;
        cb(err, '', '');
      }
    );

    const result = await isGitIgnored('.arit-toolkit.jsonc', '/workspace');
    expect(result).toBe(true);
  });
});

describe('gitStageAndCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call git add then git commit with correct arguments', async () => {
    const calls: string[][] = [];
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        _opts: unknown,
        cb: (...args: unknown[]) => void
      ) => {
        calls.push(args);
        cb(null, '', '');
      }
    );

    await gitStageAndCommit('.arit-toolkit.jsonc', 'chore: update config', '/workspace');

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(['add', '--', '.arit-toolkit.jsonc']);
    expect(calls[1]).toEqual([
      'commit',
      '-m',
      'chore: update config',
      '--',
      '.arit-toolkit.jsonc',
    ]);
  });

  it('should throw when git add fails', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (...args: unknown[]) => void
      ) => {
        cb(new Error('add failed'), '', '');
      }
    );

    await expect(
      gitStageAndCommit('.arit-toolkit.jsonc', 'chore: update', '/workspace')
    ).rejects.toThrow('add failed');
  });
});

describe('hasGitChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when file has changes (non-empty output)', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (...args: unknown[]) => void
      ) => {
        cb(null, ' M .arit-toolkit.jsonc\n', '');
      }
    );

    const result = await hasGitChanges('.arit-toolkit.jsonc', '/workspace');
    expect(result).toBe(true);
  });

  it('should return false when file has no changes (empty output)', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (...args: unknown[]) => void
      ) => {
        cb(null, '', '');
      }
    );

    const result = await hasGitChanges('.arit-toolkit.jsonc', '/workspace');
    expect(result).toBe(false);
  });

  it('should return false when git is not installed (ENOENT)', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (...args: unknown[]) => void
      ) => {
        const err = new Error('not found');
        (err as any).code = 'ENOENT';
        cb(err, '', '');
      }
    );

    const result = await hasGitChanges('.arit-toolkit.jsonc', '/workspace');
    expect(result).toBe(false);
  });

  it('should return false on other errors', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (...args: unknown[]) => void
      ) => {
        const err = new Error('unknown error');
        (err as any).code = 128;
        cb(err, '', '');
      }
    );

    const result = await hasGitChanges('.arit-toolkit.jsonc', '/workspace');
    expect(result).toBe(false);
  });
});
