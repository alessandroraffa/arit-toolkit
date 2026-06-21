import * as vscode from 'vscode';
import type { WorkspaceMode, ServiceDescriptor } from '../types';
import type { Logger } from './logger';
import type { ConfigMigrationService } from './configMigration/migrationService';
import type { ConfigAutoCommitService } from './configAutoCommit';
import { parseJsonc, formatJsonc, computeVersionCode } from '../utils';
import { isGitTracked } from './git';

const CONFIG_FILENAME = '.tangyr.jsonc';
const LEGACY_CONFIG_FILENAME = '.arit-toolkit.jsonc';
const CONFIG_HEADER =
  'Tangyr Workbench workspace configuration\nManaged by the Tangyr Workbench extension';

type SectionListener = (value: unknown) => void;

export interface CheckupResult {
  configUpdated: boolean;
  commitResult:
    | 'committed'
    | 'skipped'
    | 'no-changes'
    | 'git-ignored'
    | 'failed'
    | 'not-applicable';
}

export class ExtensionStateManager {
  private readonly _onDidChangeState = new vscode.EventEmitter<boolean>();
  public readonly onDidChangeState: vscode.Event<boolean> = this._onDidChangeState.event;

  private readonly _workspaceMode: WorkspaceMode;
  private readonly _workspaceRoot: vscode.Uri | undefined;
  private readonly _services: ServiceDescriptor[] = [];
  private readonly _sectionListeners = new Map<string, Set<SectionListener>>();
  private watcher: vscode.FileSystemWatcher | undefined;
  private _isInitialized = false;
  private _isEnabled = false;
  private _extensionVersion: string | undefined;
  private _configVersionCode: number | undefined;
  private _fullConfig: Record<string, unknown> | undefined;
  private _autoCommitService: ConfigAutoCommitService | undefined;
  private _loadedLegacyConfigFile = false;
  private _lastWrittenConfigContent: string | undefined;
  private _migrationInFlight: Promise<boolean> | undefined;
  /**
   * BK-006: set to true after runMigration() is called for the first time during
   * initialize(), so that consolidateLegacyConfig Path A does not show a duplicate
   * migration prompt when the user declined the first one and .tangyr.jsonc was
   * not yet created. A single activation, a single prompt.
   */
  private _migrationAttemptedThisSession = false;

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
    return this.isSingleRoot;
  }
  public get workspaceRootUri(): vscode.Uri | undefined {
    return this._workspaceRoot;
  }

  public setAutoCommitService(service: ConfigAutoCommitService): void {
    this._autoCommitService = service;
  }

  public registerService(descriptor: ServiceDescriptor): void {
    this._services.push(descriptor);
  }

  public get registeredServices(): readonly ServiceDescriptor[] {
    return this._services;
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
      // SPEC-002 Constraint 1: automatic consolidation and path migration are
      // scoped to single-root workspaces only. Multi-root and no-workspace
      // activations are out of scope and are a safe no-op here.
      this.logger.info(
        `Skipping initialization for ${this._workspaceMode} workspace — legacy-config consolidation and archive-path migration require a single-root workspace`
      );
      return;
    }
    await this.readStateFromFile();
    this.setupFileWatcher();
    if (this._isInitialized) {
      this._onDidChangeState.fire(this._isEnabled);
      if (this._isEnabled) {
        await this.runMigration();
        this._migrationAttemptedThisSession = true;
      } else {
        await this.ensureCurrentConfigFile();
      }
    } else {
      const accepted = await this.showOnboardingNotification();
      if (accepted) {
        await this.runMigration();
        this._migrationAttemptedThisSession = true;
      }
    }
    await this.consolidateLegacyConfig();
  }

  public async checkup(): Promise<CheckupResult> {
    const skip: CheckupResult = { configUpdated: false, commitResult: 'not-applicable' };
    if (!this.isSingleRoot || !this._workspaceRoot || !this._extensionVersion) {
      return skip;
    }
    this._autoCommitService?.suspend();
    try {
      return await this.performCheckup();
    } finally {
      this._autoCommitService?.resume();
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
    if (newState) {
      await this.runMigration();
    }
    this.logger.info(
      `Tangyr Workbench ${newState ? 'enabled' : 'disabled'} for this workspace`
    );
    return newState;
  }

  public async showOnboardingNotification(): Promise<boolean> {
    const action = await vscode.window.showInformationMessage(
      'Tangyr Workbench: Initialize this workspace for advanced features?',
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
    await this.readStateFromFile();
    await this.writeStateToFile(true);
    this._isInitialized = true;
    this._isEnabled = true;
    this._onDidChangeState.fire(true);
    this.logger.info('Workspace initialized for Tangyr Workbench');
  }

  public dispose(): void {
    this.watcher?.dispose();
    this._onDidChangeState.dispose();
  }

  private getConfigUri(fileName = CONFIG_FILENAME): vscode.Uri | undefined {
    return this._workspaceRoot
      ? vscode.Uri.joinPath(this._workspaceRoot, fileName)
      : undefined;
  }

  private async readStateFromFile(): Promise<void> {
    if (!this._workspaceRoot) {
      return;
    }
    try {
      await this.readCurrentConfigFile();
    } catch (err) {
      await this.handleConfigReadFailure(err);
    }
  }

  private async readCurrentConfigFile(): Promise<void> {
    const config = await this.readConfigFile(CONFIG_FILENAME);
    this.applyConfig(config);
    this._loadedLegacyConfigFile = false;
    this.logger.debug(
      `Read workspace config: enabled=${String(this._isEnabled)}, versionCode=${String(this._configVersionCode)}`
    );
  }

  private async handleConfigReadFailure(err: unknown): Promise<void> {
    if (!this._fullConfig && (await this.tryReadLegacyConfigFile())) {
      return;
    }
    if (this._fullConfig) {
      this.logger.warn(
        `Failed to re-read workspace config, keeping existing state: ${String(err)}`
      );
      return;
    }
    this._isInitialized = false;
    this._isEnabled = false;
    this._fullConfig = undefined;
    this.logger.debug('No workspace config file found');
  }

  private async tryReadLegacyConfigFile(): Promise<boolean> {
    try {
      const config = await this.readConfigFile(LEGACY_CONFIG_FILENAME);
      this.applyConfig(config);
      this._loadedLegacyConfigFile = true;
      this.logger.info(
        `Loaded legacy workspace config ${LEGACY_CONFIG_FILENAME}; it will be copied to ${CONFIG_FILENAME}`
      );
      return true;
    } catch {
      return false;
    }
  }

  private async readConfigFile(fileName: string): Promise<Record<string, unknown>> {
    const configUri = this.getConfigUri(fileName);
    if (!configUri) {
      return {};
    }
    const raw = await vscode.workspace.fs.readFile(configUri);
    return parseJsonc(new TextDecoder().decode(raw)) as Record<string, unknown>;
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
    this._lastWrittenConfigContent = content;
    this.logger.debug('Wrote workspace config');
    void this._autoCommitService?.onConfigWritten();
  }

  private async performCheckup(): Promise<CheckupResult> {
    await this.readStateFromFile();
    let configUpdated = false;
    if (!this._isInitialized) {
      if (!(await this.showOnboardingNotification())) {
        return { configUpdated: false, commitResult: 'not-applicable' };
      }
      configUpdated = true;
    }
    this._onDidChangeState.fire(this._isEnabled);
    if (await this.runMigration()) {
      configUpdated = true;
    }
    const commitResult = this._autoCommitService
      ? await this._autoCommitService.commitIfNeeded()
      : ('not-applicable' as const);
    return { configUpdated, commitResult };
  }

  private async runMigration(): Promise<boolean> {
    if (this._migrationInFlight) {
      this.logger.debug(
        'runMigration: in-flight guard triggered — awaiting existing migration'
      );
      return await this._migrationInFlight;
    }
    this._migrationInFlight = this._runMigrationInternal().finally(() => {
      this._migrationInFlight = undefined;
    });
    return await this._migrationInFlight;
  }

  private async _runMigrationInternal(): Promise<boolean> {
    if (!this._extensionVersion || !this._fullConfig) {
      return false;
    }
    const merged = await this.migrationService.migrate(
      this._fullConfig,
      this._configVersionCode,
      this._extensionVersion
    );
    if (!merged) {
      return await this.ensureCurrentConfigFile();
    }
    const oldConfig = { ...this._fullConfig };
    await this.writeFullConfig(merged);
    this._loadedLegacyConfigFile = false;
    this._fullConfig = merged;
    this._configVersionCode = merged.versionCode as number | undefined;
    this.notifySectionListeners(oldConfig, merged);
    this.logger.info(`Workspace config migrated to version ${this._extensionVersion}`);
    return true;
  }

  private async ensureCurrentConfigFile(): Promise<boolean> {
    if (!this._loadedLegacyConfigFile || !this._fullConfig) {
      return false;
    }
    await this.writeFullConfig(this._fullConfig);
    this._loadedLegacyConfigFile = false;
    this.logger.info(
      `Workspace config copied from ${LEGACY_CONFIG_FILENAME} to ${CONFIG_FILENAME}`
    );
    return true;
  }

  private async findAvailableBackupPath(targetUri: vscode.Uri): Promise<vscode.Uri> {
    try {
      await vscode.workspace.fs.stat(targetUri);
    } catch {
      return targetUri;
    }
    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const suffix =
      String(now.getUTCFullYear()) +
      pad(now.getUTCMonth() + 1) +
      pad(now.getUTCDate()) +
      pad(now.getUTCHours()) +
      pad(now.getUTCMinutes());
    const originalFsPath = targetUri.fsPath;
    return vscode.Uri.file(`${originalFsPath}.${suffix}`);
  }

  /**
   * Consolidates any coexisting legacy .arit-toolkit.jsonc after the normal
   * config-read and migration flow has already produced or confirmed .tangyr.jsonc.
   *
   * Branching:
   * - Legacy absent → no-op (idempotent).
   * - Both files present → .tangyr.jsonc is authoritative; remove legacy (git-aware).
   * - Legacy only, parseable → migrate to .tangyr.jsonc (Path A), then remove legacy.
   * - Legacy only, malformed → rename to .malformed.bak, warn, do NOT write .tangyr.jsonc.
   *
   * Scope: single-root workspaces only.
   */
  private async consolidateLegacyConfig(): Promise<void> {
    if (!this._workspaceRoot) {
      return;
    }
    const workspaceRoot = this._workspaceRoot;
    const legacyUri = this.getConfigUri(LEGACY_CONFIG_FILENAME);
    if (!legacyUri) {
      return;
    }
    // Check whether legacy file exists; if not, this is a no-op.
    try {
      await vscode.workspace.fs.stat(legacyUri);
    } catch {
      this.logger.info(
        `consolidateLegacyConfig: ${LEGACY_CONFIG_FILENAME} absent — no action needed`
      );
      return;
    }
    // Check whether .tangyr.jsonc is present.
    const newConfigUri = this.getConfigUri();
    let newConfigPresent = false;
    if (newConfigUri) {
      try {
        await vscode.workspace.fs.stat(newConfigUri);
        newConfigPresent = true;
      } catch {
        // .tangyr.jsonc absent
      }
    }
    if (newConfigPresent) {
      // Both files present: .tangyr.jsonc is authoritative — remove legacy only.
      this.logger.info(
        `consolidateLegacyConfig: both files present — ${CONFIG_FILENAME} is authoritative, removing legacy`
      );
      const removeResult = await this.removeLegacyConfigFile(legacyUri, workspaceRoot);
      if (removeResult === 'deleted') {
        void vscode.window.showInformationMessage(
          `Tangyr: cleaned up legacy .arit-toolkit.jsonc (deleted).`
        );
      } else if (removeResult === 'renamed') {
        void vscode.window.showInformationMessage(
          `Tangyr: cleaned up legacy .arit-toolkit.jsonc (renamed to .arit-toolkit.jsonc.bak).`
        );
      } else {
        void vscode.window.showWarningMessage(
          `Tangyr: legacy .arit-toolkit.jsonc could not be removed — will retry next activation.`
        );
      }
      return;
    }
    // Legacy only: attempt to parse.
    let parsed: Record<string, unknown>;
    try {
      parsed = await this.readConfigFile(LEGACY_CONFIG_FILENAME);
    } catch {
      // Path B: malformed legacy — rename to .malformed.bak, warn, do NOT create .tangyr.jsonc.
      const malformedBackupUri = await this.findAvailableBackupPath(
        vscode.Uri.joinPath(workspaceRoot, `${LEGACY_CONFIG_FILENAME}.malformed.bak`)
      );
      try {
        await vscode.workspace.fs.rename(legacyUri, malformedBackupUri, {
          overwrite: false,
        });
        this.logger.warn(
          `consolidateLegacyConfig: renamed malformed ${LEGACY_CONFIG_FILENAME} to ${malformedBackupUri.fsPath}`
        );
      } catch (renameErr) {
        this.logger.warn(
          `consolidateLegacyConfig: could not rename malformed legacy file: ${String(renameErr)}`
        );
      }
      void vscode.window.showWarningMessage(
        `Tangyr: found legacy .arit-toolkit.jsonc but could not parse it. Renamed to .arit-toolkit.jsonc.malformed.bak for review. Please create a new .tangyr.jsonc via the onboarding prompt.`
      );
      return;
    }
    // Path A: parseable legacy — apply config, run migration to write .tangyr.jsonc, then remove legacy.
    // BK-006: when runMigration() was already called during initialize() and the user
    // declined (so .tangyr.jsonc was not written), skip a second migration prompt.
    // A single activation must not prompt the user twice.
    if (this._migrationAttemptedThisSession) {
      this.logger.info(
        `consolidateLegacyConfig: migration already attempted this session — skipping second runMigration() (user may have declined)`
      );
      return;
    }
    this.applyConfig(parsed);
    this._loadedLegacyConfigFile = true;
    this._onDidChangeState.fire(this._isEnabled);
    this.logger.info(`consolidateLegacyConfig: applied legacy config to in-memory state`);
    await this.runMigration();
    this._migrationAttemptedThisSession = true;
    this.logger.info(`consolidateLegacyConfig: ran migration after Path A apply`);
    const removeResult = await this.removeLegacyConfigFile(legacyUri, workspaceRoot);
    if (removeResult === 'deleted') {
      void vscode.window.showInformationMessage(
        `Tangyr: migrated workspace config from .arit-toolkit.jsonc to .tangyr.jsonc; legacy file deleted.`
      );
    } else if (removeResult === 'renamed') {
      void vscode.window.showInformationMessage(
        `Tangyr: migrated workspace config from .arit-toolkit.jsonc to .tangyr.jsonc; legacy file renamed to .arit-toolkit.jsonc.bak.`
      );
    } else {
      void vscode.window.showWarningMessage(
        `Tangyr: migrated workspace config from .arit-toolkit.jsonc to .tangyr.jsonc; legacy .arit-toolkit.jsonc could not be removed — will retry next activation.`
      );
    }
  }

  /**
   * Git-aware removal of the legacy config file.
   * - When tracked: deletes from the working tree (git history is the backup).
   * - When not tracked (or git unavailable): renames to .arit-toolkit.jsonc.bak
   *   with a timestamped suffix on collision via findAvailableBackupPath.
   * Returns 'deleted' when deleted, 'renamed' when renamed to .bak, or 'failed'
   * when the operation could not be completed. Failure is logged and does not throw.
   */
  private async removeLegacyConfigFile(
    legacyUri: vscode.Uri,
    workspaceRoot: vscode.Uri
  ): Promise<'deleted' | 'renamed' | 'failed'> {
    const tracked = await isGitTracked(legacyUri.fsPath, workspaceRoot.fsPath);
    if (tracked) {
      try {
        await vscode.workspace.fs.delete(legacyUri);
        this.logger.info(
          `consolidateLegacyConfig: deleted git-tracked ${LEGACY_CONFIG_FILENAME}`
        );
        return 'deleted';
      } catch (err) {
        this.logger.warn(
          `consolidateLegacyConfig: could not delete ${LEGACY_CONFIG_FILENAME}: ${String(err)}`
        );
        return 'failed';
      }
    }
    // Not tracked: rename to .bak
    const bakUri = await this.findAvailableBackupPath(
      vscode.Uri.joinPath(workspaceRoot, `${LEGACY_CONFIG_FILENAME}.bak`)
    );
    try {
      await vscode.workspace.fs.rename(legacyUri, bakUri, { overwrite: false });
      this.logger.info(
        `consolidateLegacyConfig: renamed ${LEGACY_CONFIG_FILENAME} to ${bakUri.fsPath}`
      );
      return 'renamed';
    } catch (renameErr) {
      this.logger.warn(
        `consolidateLegacyConfig: could not rename ${LEGACY_CONFIG_FILENAME}: ${String(renameErr)}`
      );
      return 'failed';
    }
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
      if (this._lastWrittenConfigContent !== undefined) {
        const configUri = this.getConfigUri();
        if (configUri) {
          try {
            const rawBytes = await vscode.workspace.fs.readFile(configUri);
            const fileContent = new TextDecoder().decode(rawBytes);
            if (fileContent === this._lastWrittenConfigContent) {
              this._lastWrittenConfigContent = undefined;
              this.logger.debug('Watcher reload suppressed — content matches self-write');
              return;
            }
          } catch {
            // Read error: fall through to normal reload processing
          }
        }
        this._lastWrittenConfigContent = undefined;
      }
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
