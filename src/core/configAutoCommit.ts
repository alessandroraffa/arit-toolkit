import * as vscode from 'vscode';
import type { Logger } from './logger';
import { isGitIgnored, hasGitChanges, gitStageAndCommit } from '../utils/git';

const COMMIT_MESSAGE = 'chore: update arit-toolkit config';

export class ConfigAutoCommitService {
  private _gitIgnored: boolean | undefined;

  constructor(
    private readonly workspaceRootPath: string,
    private readonly configFileName: string,
    private readonly logger: Logger
  ) {}

  public async onConfigWritten(): Promise<void> {
    if (this._gitIgnored === undefined) {
      this._gitIgnored = await isGitIgnored(this.configFileName, this.workspaceRootPath);
      this.logger.debug(
        `Config file gitignore status: ${this._gitIgnored ? 'ignored' : 'tracked'}`
      );
    }

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

    if (action !== 'Commit') {
      return;
    }

    try {
      await gitStageAndCommit(
        this.configFileName,
        COMMIT_MESSAGE,
        this.workspaceRootPath
      );
      this.logger.info('Config change committed');
    } catch (err) {
      this.logger.warn(`Failed to commit config change: ${String(err)}`);
    }
  }
}
