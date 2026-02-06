import * as vscode from 'vscode';
import type { WorkspaceConfig, WorkspaceMode } from '../types';
import type { Logger } from './logger';
import { parseJsonc, formatJsonc } from '../utils';

const CONFIG_FILENAME = '.arit-toolkit.jsonc';
const CONFIG_HEADER =
  'ARIT Toolkit workspace configuration\nManaged by the ARIT Toolkit extension';

export class ExtensionStateManager {
  private readonly _onDidChangeState = new vscode.EventEmitter<boolean>();
  public readonly onDidChangeState: vscode.Event<boolean> = this._onDidChangeState.event;

  private readonly _workspaceMode: WorkspaceMode;
  private readonly workspaceRoot: vscode.Uri | undefined;
  private watcher: vscode.FileSystemWatcher | undefined;
  private _isInitialized = false;
  private _isEnabled = false;

  constructor(private readonly logger: Logger) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this._workspaceMode = 'no-workspace';
    } else if (folders.length === 1) {
      this._workspaceMode = 'single-root';
      this.workspaceRoot = folders[0]?.uri;
    } else {
      this._workspaceMode = 'multi-root';
    }

    this.logger.debug(`Workspace mode: ${this._workspaceMode}`);
  }

  public get workspaceMode(): WorkspaceMode {
    return this._workspaceMode;
  }

  public get isSingleRoot(): boolean {
    return this._workspaceMode === 'single-root';
  }

  public get isEnabled(): boolean {
    return this._isEnabled;
  }

  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  public get isToggleable(): boolean {
    return this._workspaceMode === 'single-root';
  }

  public async initialize(): Promise<void> {
    if (!this.isSingleRoot || !this.workspaceRoot) {
      this.logger.debug('Skipping initialization for non-single-root workspace');
      return;
    }

    await this.readStateFromFile();
    this.setupFileWatcher();

    if (this._isInitialized) {
      this._onDidChangeState.fire(this._isEnabled);
    } else {
      await this.showOnboardingNotification();
    }
  }

  public async toggle(): Promise<boolean> {
    if (!this.isSingleRoot || !this.workspaceRoot) {
      return false;
    }

    if (!this._isInitialized) {
      const accepted = await this.showOnboardingNotification();
      return accepted;
    }

    const newState = !this._isEnabled;
    await this.writeStateToFile(newState);
    this._isEnabled = newState;
    this._onDidChangeState.fire(newState);
    this.logger.info(
      `ARIT Toolkit ${newState ? 'enabled' : 'disabled'} for this workspace`
    );
    return newState;
  }

  public async showOnboardingNotification(): Promise<boolean> {
    const action = await vscode.window.showInformationMessage(
      'ARIT Toolkit: Initialize this workspace for advanced features?',
      'Initialize'
    );

    if (action === 'Initialize') {
      await this.initializeWorkspace();
      return true;
    }

    return false;
  }

  public async initializeWorkspace(): Promise<void> {
    if (!this.workspaceRoot) {
      return;
    }

    await this.writeStateToFile(true);
    this._isInitialized = true;
    this._isEnabled = true;
    this._onDidChangeState.fire(true);
    this.logger.info('Workspace initialized for ARIT Toolkit');
  }

  public dispose(): void {
    this.watcher?.dispose();
    this._onDidChangeState.dispose();
  }

  private getConfigUri(): vscode.Uri | undefined {
    if (!this.workspaceRoot) {
      return undefined;
    }
    return vscode.Uri.joinPath(this.workspaceRoot, CONFIG_FILENAME);
  }

  private async readStateFromFile(): Promise<void> {
    const configUri = this.getConfigUri();
    if (!configUri) {
      return;
    }

    try {
      const content = await vscode.workspace.fs.readFile(configUri);
      const text = new TextDecoder().decode(content);
      const config = parseJsonc(text) as WorkspaceConfig;
      this._isInitialized = true;
      this._isEnabled = config.enabled;
      this.logger.debug(`Read workspace config: enabled=${String(this._isEnabled)}`);
    } catch {
      this._isInitialized = false;
      this._isEnabled = false;
      this.logger.debug('No workspace config file found');
    }
  }

  private async writeStateToFile(enabled: boolean): Promise<void> {
    const configUri = this.getConfigUri();
    if (!configUri) {
      return;
    }

    const config: WorkspaceConfig = { enabled };
    const content = formatJsonc(config, CONFIG_HEADER);
    await vscode.workspace.fs.writeFile(configUri, new TextEncoder().encode(content));
    this.logger.debug(`Wrote workspace config: enabled=${String(enabled)}`);
  }

  private setupFileWatcher(): void {
    if (!this.workspaceRoot) {
      return;
    }

    const pattern = new vscode.RelativePattern(this.workspaceRoot, CONFIG_FILENAME);
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.watcher.onDidChange(async () => {
      this.logger.debug('Workspace config file changed externally');
      await this.readStateFromFile();
      this._onDidChangeState.fire(this._isEnabled);
    });

    this.watcher.onDidCreate(async () => {
      this.logger.debug('Workspace config file created externally');
      await this.readStateFromFile();
      this._onDidChangeState.fire(this._isEnabled);
    });

    this.watcher.onDidDelete(() => {
      this.logger.debug('Workspace config file deleted externally');
      this._isInitialized = false;
      this._isEnabled = false;
      this._onDidChangeState.fire(false);
    });
  }
}
