import * as vscode from 'vscode';
import type { WorkspaceMode } from '../types';
import type { Logger } from './logger';
import type { ConfigMigrationService } from './configMigration/migrationService';
import type { ConfigAutoCommitService } from './configAutoCommit';
import { parseJsonc, formatJsonc, computeVersionCode } from '../utils';

const CONFIG_FILENAME = '.arit-toolkit.jsonc';
const CONFIG_HEADER =
  'ARIT Toolkit workspace configuration\nManaged by the ARIT Toolkit extension';

type SectionListener = (value: unknown) => void;

export class ExtensionStateManager {
  private readonly _onDidChangeState = new vscode.EventEmitter<boolean>();
  public readonly onDidChangeState: vscode.Event<boolean> = this._onDidChangeState.event;

  private readonly _workspaceMode: WorkspaceMode;
  private readonly _workspaceRoot: vscode.Uri | undefined;
  private readonly _sectionListeners = new Map<string, Set<SectionListener>>();
  private watcher: vscode.FileSystemWatcher | undefined;
  private _isInitialized = false;
  private _isEnabled = false;
  private _extensionVersion: string | undefined;
  private _configVersionCode: number | undefined;
  private _fullConfig: Record<string, unknown> | undefined;
  private _autoCommitService: ConfigAutoCommitService | undefined;

  constructor(
    private readonly logger: Logger,
    private readonly migrationService: ConfigMigrationService
  ) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this._workspaceMode = 'no-workspace';
    } else if (folders.length === 1) {
      this._workspaceMode = 'single-root';
      this._workspaceRoot = folders[0]?.uri;
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

  public get workspaceRootUri(): vscode.Uri | undefined {
    return this._workspaceRoot;
  }

  public setAutoCommitService(service: ConfigAutoCommitService): void {
    this._autoCommitService = service;
  }

  public getConfigSection(key: string): unknown {
    return this._fullConfig?.[key];
  }

  public onConfigSectionChanged(
    key: string,
    listener: SectionListener
  ): vscode.Disposable {
    const listeners = this._sectionListeners.get(key) ?? new Set<SectionListener>();
    this._sectionListeners.set(key, listeners);
    listeners.add(listener);
    return {
      dispose: (): void => {
        listeners.delete(listener);
      },
    };
  }

  public async updateConfigSection(key: string, value: unknown): Promise<void> {
    if (!this._fullConfig) {
      return;
    }
    const oldConfig = { ...this._fullConfig };
    this._fullConfig[key] = value;
    await this.writeFullConfig(this._fullConfig);
    this.notifySectionListeners(oldConfig, this._fullConfig);
  }

  public async initialize(extensionVersion: string): Promise<void> {
    this._extensionVersion = extensionVersion;
    if (!this.isSingleRoot || !this._workspaceRoot) {
      this.logger.debug('Skipping initialization for non-single-root workspace');
      return;
    }
    await this.readStateFromFile();
    this.setupFileWatcher();
    if (this._isInitialized) {
      this._onDidChangeState.fire(this._isEnabled);
      if (this._isEnabled) {
        await this.runMigration();
      }
    } else {
      await this.showOnboardingNotification();
    }
  }

  public async toggle(): Promise<boolean> {
    if (!this.isSingleRoot || !this._workspaceRoot) {
      return false;
    }
    if (!this._isInitialized) {
      return await this.showOnboardingNotification();
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
    if (!this._workspaceRoot) {
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
    return this._workspaceRoot
      ? vscode.Uri.joinPath(this._workspaceRoot, CONFIG_FILENAME)
      : undefined;
  }

  private async readStateFromFile(): Promise<void> {
    const configUri = this.getConfigUri();
    if (!configUri) {
      return;
    }
    try {
      const raw = await vscode.workspace.fs.readFile(configUri);
      const config = parseJsonc(new TextDecoder().decode(raw)) as Record<string, unknown>;
      this.applyConfig(config);
      this.logger.debug(
        `Read workspace config: enabled=${String(this._isEnabled)}, versionCode=${String(this._configVersionCode)}`
      );
    } catch {
      this._isInitialized = false;
      this._isEnabled = false;
      this._fullConfig = undefined;
      this.logger.debug('No workspace config file found');
    }
  }

  private applyConfig(config: Record<string, unknown>): void {
    const oldConfig = this._fullConfig;
    this._fullConfig = config;
    this._isInitialized = true;
    this._isEnabled = Boolean(config.enabled);
    this._configVersionCode = config.versionCode as number | undefined;
    if (oldConfig) {
      this.notifySectionListeners(oldConfig, config);
    }
  }

  private async writeStateToFile(enabled: boolean): Promise<void> {
    const config: Record<string, unknown> = this._fullConfig
      ? { ...this._fullConfig }
      : {};
    config.enabled = enabled;
    if (this._extensionVersion) {
      config.version = this._extensionVersion;
      config.versionCode = computeVersionCode(this._extensionVersion);
    }
    await this.writeFullConfig(config);
    this._fullConfig = config;
    this._configVersionCode = config.versionCode as number | undefined;
  }

  private async writeFullConfig(config: Record<string, unknown>): Promise<void> {
    const configUri = this.getConfigUri();
    if (!configUri) {
      return;
    }
    const content = formatJsonc(config, CONFIG_HEADER);
    await vscode.workspace.fs.writeFile(configUri, new TextEncoder().encode(content));
    this.logger.debug('Wrote workspace config');
    void this._autoCommitService?.onConfigWritten();
  }

  private async runMigration(): Promise<void> {
    if (!this._extensionVersion || !this._fullConfig) {
      return;
    }
    const merged = await this.migrationService.migrate(
      this._fullConfig,
      this._configVersionCode,
      this._extensionVersion
    );
    if (!merged) {
      return;
    }
    const oldConfig = { ...this._fullConfig };
    await this.writeFullConfig(merged);
    this._fullConfig = merged;
    this._configVersionCode = merged.versionCode as number | undefined;
    this.notifySectionListeners(oldConfig, merged);
    this.logger.info(`Workspace config migrated to version ${this._extensionVersion}`);
  }

  private notifySectionListeners(
    oldConfig: Record<string, unknown>,
    newConfig: Record<string, unknown>
  ): void {
    for (const [key, listeners] of this._sectionListeners) {
      const oldVal = JSON.stringify(oldConfig[key]);
      const newVal = JSON.stringify(newConfig[key]);
      if (oldVal !== newVal) {
        for (const listener of listeners) {
          listener(newConfig[key]);
        }
      }
    }
  }

  private setupFileWatcher(): void {
    if (!this._workspaceRoot) {
      return;
    }
    const pattern = new vscode.RelativePattern(this._workspaceRoot, CONFIG_FILENAME);
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const reload = async (): Promise<void> => {
      await this.readStateFromFile();
      this._onDidChangeState.fire(this._isEnabled);
    };
    this.watcher.onDidChange(reload);
    this.watcher.onDidCreate(reload);
    this.watcher.onDidDelete(() => {
      this._isInitialized = false;
      this._isEnabled = false;
      this._fullConfig = undefined;
      this._onDidChangeState.fire(false);
    });
  }
}
