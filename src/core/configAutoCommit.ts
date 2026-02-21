import * as vscode from 'vscode';
import type { Logger } from './logger';
import { isGitIgnored, hasGitChanges, gitStageAndCommit } from './git';

const COMMIT_MESSAGE = 'chore: update arit-toolkit config';

export type CommitResult =
  | 'committed'
  | 'skipped'
  | 'no-changes'
  | 'git-ignored'
  | 'failed';

export class ConfigAutoCommitService {
  private _gitIgnored: boolean | undefined;
  private _suspended = false;

  constructor(
    private readonly workspaceRootPath: string,
    private readonly configFileName: string,
    private readonly logger: Logger
  ) {}

  public suspend(): void {
    this._suspended = true;
  }

  public resume(): void {
    this._suspended = false;
  }

  public async onConfigWritten(): Promise<void> {
    if (this._suspended) {
      return;
    }
    await this.ensureGitIgnoreStatus();
    if (this._gitIgnored) {
      return;
    }

    const changed = await hasGitChanges(this.configFileName, this.workspaceRootPath);
    if (!changed) {
      return;
    }

    const action = await vscode.window.showInformationMessage(
      'ARIT Toolkit: Commit config change?',
      'Commit',
      'Skip'
    );

    if (action === 'Commit') {
      await this.performCommit();
    }
  }

  public async commitIfNeeded(): Promise<CommitResult> {
    await this.ensureGitIgnoreStatus();
    if (this._gitIgnored) {
      return 'git-ignored';
    }

    const changed = await hasGitChanges(this.configFileName, this.workspaceRootPath);
    if (!changed) {
      return 'no-changes';
    }

    const action = await vscode.window.showInformationMessage(
      'ARIT Toolkit: Commit config change?',
      'Commit',
      'Skip'
    );

    if (action !== 'Commit') {
      return 'skipped';
    }

    return await this.performCommitWithResult();
  }

  private async ensureGitIgnoreStatus(): Promise<void> {
    if (this._gitIgnored === undefined) {
      this._gitIgnored = await isGitIgnored(this.configFileName, this.workspaceRootPath);
      this.logger.debug(
        `Config file gitignore status: ${this._gitIgnored ? 'ignored' : 'tracked'}`
      );
    }
  }

  private async performCommit(): Promise<void> {
    try {
      this.logger.debug('Committing config change (git hooks bypassed)');
      await gitStageAndCommit(this.configFileName, COMMIT_MESSAGE, {
        cwd: this.workspaceRootPath,
        skipHooks: true,
      });
      this.logger.info('Config change committed');
    } catch (err) {
      this.logger.warn(`Failed to commit config change: ${String(err)}`);
      void vscode.window.showErrorMessage(
        'ARIT Toolkit: Failed to commit config change. Check the output log for details.'
      );
    }
  }

  private async performCommitWithResult(): Promise<CommitResult> {
    try {
      this.logger.debug('Committing config change (git hooks bypassed)');
      await gitStageAndCommit(this.configFileName, COMMIT_MESSAGE, {
        cwd: this.workspaceRootPath,
        skipHooks: true,
      });
      this.logger.info('Config change committed');
      return 'committed';
    } catch (err) {
      this.logger.warn(`Failed to commit config change: ${String(err)}`);
      void vscode.window.showErrorMessage(
        'ARIT Toolkit: Failed to commit config change. Check the output log for details.'
      );
      return 'failed';
    }
  }
}
