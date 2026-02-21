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
const { isGitIgnored, gitStageAndCommit, gitUnstage, hasGitChanges } =
  await import('../../../src/core/git');

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

    await gitStageAndCommit('.arit-toolkit.jsonc', 'chore: update config', {
      cwd: '/workspace',
    });

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
      gitStageAndCommit('.arit-toolkit.jsonc', 'chore: update', { cwd: '/workspace' })
    ).rejects.toThrow('add failed');
  });

  it('should unstage file and rethrow when git commit fails', async () => {
    let callCount = 0;
    const calls: string[][] = [];
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        _opts: unknown,
        cb: (...args: unknown[]) => void
      ) => {
        calls.push(args);
        callCount++;
        if (callCount === 1) {
          // git add succeeds
          cb(null, '', '');
        } else if (callCount === 2) {
          // git commit fails
          cb(new Error('commit failed'), '', '');
        } else {
          // git reset (unstage) succeeds
          cb(null, '', '');
        }
      }
    );

    await expect(
      gitStageAndCommit('.arit-toolkit.jsonc', 'chore: update', { cwd: '/workspace' })
    ).rejects.toThrow('commit failed');

    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual(['add', '--', '.arit-toolkit.jsonc']);
    expect(calls[1]).toEqual([
      'commit',
      '-m',
      'chore: update',
      '--',
      '.arit-toolkit.jsonc',
    ]);
    expect(calls[2]).toEqual(['reset', 'HEAD', '--', '.arit-toolkit.jsonc']);
  });

  it('should pass HUSKY=0 env to git commit when skipHooks is true', async () => {
    const capturedOpts: unknown[] = [];
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        opts: unknown,
        cb: (...args: unknown[]) => void
      ) => {
        capturedOpts.push(opts);
        cb(null, '', '');
      }
    );

    await gitStageAndCommit('.arit-toolkit.jsonc', 'chore: update config', {
      cwd: '/workspace',
      skipHooks: true,
    });

    // git add opts (index 0) — no env override needed
    expect(capturedOpts[0]).toEqual({ cwd: '/workspace' });
    // git commit opts (index 1) — HUSKY=0 to bypass hooks
    const commitOpts = capturedOpts[1] as { cwd: string; env: Record<string, string> };
    expect(commitOpts.cwd).toBe('/workspace');
    expect(commitOpts.env).toBeDefined();
    expect(commitOpts.env.HUSKY).toBe('0');
  });

  it('should not set HUSKY env when skipHooks is omitted', async () => {
    const capturedOpts: unknown[] = [];
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        opts: unknown,
        cb: (...args: unknown[]) => void
      ) => {
        capturedOpts.push(opts);
        cb(null, '', '');
      }
    );

    await gitStageAndCommit('.arit-toolkit.jsonc', 'chore: update config', {
      cwd: '/workspace',
    });

    // Both git add and git commit should only have { cwd }
    expect(capturedOpts[0]).toEqual({ cwd: '/workspace' });
    expect(capturedOpts[1]).toEqual({ cwd: '/workspace' });
  });
});

describe('gitUnstage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call git reset HEAD with correct arguments', async () => {
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

    await gitUnstage('.arit-toolkit.jsonc', '/workspace');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['reset', 'HEAD', '--', '.arit-toolkit.jsonc']);
  });

  it('should throw when git reset fails', async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (...args: unknown[]) => void
      ) => {
        cb(new Error('reset failed'), '', '');
      }
    );

    await expect(gitUnstage('.arit-toolkit.jsonc', '/workspace')).rejects.toThrow(
      'reset failed'
    );
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
