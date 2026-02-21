import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface StageAndCommitOptions {
  cwd: string;
  /** When true, sets HUSKY=0 to bypass git hooks on the commit. */
  skipHooks?: boolean;
}

/**
 * Returns true if the given file path is ignored by git.
 * Returns true (treated as ignored) when git is unavailable or the workspace
 * is not a git repository, so the caller never prompts inappropriately.
 */
export async function isGitIgnored(filePath: string, cwd: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['check-ignore', '--quiet', '--', filePath], { cwd });
    return true; // exit 0 → file is ignored
  } catch (err: unknown) {
    const code = (err as { code?: number | string }).code;
    if (code === 1) {
      return false; // exit 1 → file is NOT ignored
    }
    // git not installed (ENOENT), not a repo (exit 128), or other error → treat as ignored
    return true;
  }
}

/**
 * Returns true if the given file has uncommitted changes (staged, unstaged, or untracked).
 * Returns false when there are no changes or when git is unavailable.
 */
export async function hasGitChanges(filePath: string, cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain', '--', filePath],
      { cwd }
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Unstages a single file (reverses `git add`).
 * Throws if the git command fails.
 */
export async function gitUnstage(filePath: string, cwd: string): Promise<void> {
  await execFileAsync('git', ['reset', 'HEAD', '--', filePath], { cwd });
}

/**
 * Stages a single file and commits it with the given message.
 * If the commit fails, the file is unstaged before the error is rethrown.
 * Throws if the git commands fail.
 */
export async function gitStageAndCommit(
  filePath: string,
  message: string,
  options: StageAndCommitOptions
): Promise<void> {
  const { cwd, skipHooks } = options;
  await execFileAsync('git', ['add', '--', filePath], { cwd });
  const commitOpts = skipHooks ? { cwd, env: { ...process.env, HUSKY: '0' } } : { cwd };
  try {
    await execFileAsync('git', ['commit', '-m', message, '--', filePath], commitOpts);
  } catch (err) {
    await gitUnstage(filePath, cwd).catch(() => {
      /* best-effort unstage */
    });
    throw err;
  }
}
