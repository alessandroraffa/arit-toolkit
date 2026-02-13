import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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
 * Stages a single file and commits it with the given message.
 * Throws if the git commands fail.
 */
export async function gitStageAndCommit(
  filePath: string,
  message: string,
  cwd: string
): Promise<void> {
  await execFileAsync('git', ['add', '--', filePath], { cwd });
  await execFileAsync('git', ['commit', '-m', message, '--', filePath], { cwd });
}
