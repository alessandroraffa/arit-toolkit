import * as vscode from 'vscode';

const OLD_EXT_ID = 'alessandroraffa.arit-toolkit';
const NEW_EXT_ID = 'alessandroraffa.tangyr';
const OLD_CONFIG_NS = 'arit';
const NEW_CONFIG_NS = 'tangyr';
const MIGRATION_DONE_KEY = 'migrationFromOldExtension.done';

const CONFIG_KEY_MAP: Record<string, string> = {
  timestampFormat: 'timestampFormat',
  timestampSeparator: 'timestampSeparator',
  logLevel: 'logLevel',
};

interface ConfigEntry {
  oldKey: string;
  newKey: string;
  value: unknown;
  target: vscode.ConfigurationTarget;
}

interface MigrationInput {
  userSetEntries: ConfigEntry[];
  oldExtension: vscode.Extension<unknown> | undefined;
}

type MigrationChoice = 'Migrate now' | 'Later' | "Don't ask again" | undefined;

export async function runMigrationIfNeeded(
  context: vscode.ExtensionContext
): Promise<void> {
  if (context.globalState.get<boolean>(MIGRATION_DONE_KEY)) {
    return;
  }

  const migration = collectMigrationInput();
  if (shouldCompleteSilently(migration)) {
    await context.globalState.update(MIGRATION_DONE_KEY, true);
    return;
  }

  const choice = await promptForMigration(migration.oldExtension);
  if (shouldRetryLater(choice)) {
    return;
  }
  if (choice === "Don't ask again") {
    await context.globalState.update(MIGRATION_DONE_KEY, true);
    return;
  }

  await migrateConfigurations(migration.userSetEntries);
  await showMigrationComplete(migration.userSetEntries.length);

  await context.globalState.update(MIGRATION_DONE_KEY, true);
}

function collectMigrationInput(): MigrationInput {
  const oldConfig = vscode.workspace.getConfiguration(OLD_CONFIG_NS);
  return {
    userSetEntries: collectUserSetKeys(oldConfig),
    oldExtension: vscode.extensions.getExtension(OLD_EXT_ID),
  };
}

function shouldCompleteSilently(migration: MigrationInput): boolean {
  return migration.userSetEntries.length === 0 && !migration.oldExtension;
}

async function promptForMigration(
  oldExtension: vscode.Extension<unknown> | undefined
): Promise<MigrationChoice> {
  return await vscode.window.showInformationMessage(
    buildMigrationMessage(oldExtension),
    { modal: false },
    'Migrate now',
    'Later',
    "Don't ask again"
  );
}

function buildMigrationMessage(
  oldExtension: vscode.Extension<unknown> | undefined
): string {
  return oldExtension
    ? `Found "${OLD_EXT_ID}" installed alongside the new "${NEW_EXT_ID}". ` +
        `Migrate your existing settings to the new extension?`
    : `Found settings from the previous extension "${OLD_EXT_ID}". ` +
        `Migrate them to "${NEW_EXT_ID}"?`;
}

function shouldRetryLater(choice: MigrationChoice): boolean {
  return choice === 'Later' || choice === undefined;
}

async function showMigrationComplete(copiedCount: number): Promise<void> {
  const followUp = await vscode.window.showInformationMessage(
    `Migration completed. ${String(copiedCount)} setting(s) copied. ` +
      `You can safely uninstall "${OLD_EXT_ID}".`,
    'Open Settings',
    'OK'
  );
  if (followUp === 'Open Settings') {
    await vscode.commands.executeCommand(
      'workbench.action.openSettings',
      `@ext:${NEW_EXT_ID}`
    );
  }
}

function collectUserSetKeys(oldConfig: vscode.WorkspaceConfiguration): ConfigEntry[] {
  const result: ConfigEntry[] = [];

  for (const [oldKey, newKey] of Object.entries(CONFIG_KEY_MAP)) {
    const inspection = oldConfig.inspect(oldKey);
    if (!inspection) {
      continue;
    }

    if (inspection.workspaceFolderValue !== undefined) {
      result.push({
        oldKey,
        newKey,
        value: inspection.workspaceFolderValue,
        target: vscode.ConfigurationTarget.WorkspaceFolder,
      });
    }
    if (inspection.workspaceValue !== undefined) {
      result.push({
        oldKey,
        newKey,
        value: inspection.workspaceValue,
        target: vscode.ConfigurationTarget.Workspace,
      });
    }
    if (inspection.globalValue !== undefined) {
      result.push({
        oldKey,
        newKey,
        value: inspection.globalValue,
        target: vscode.ConfigurationTarget.Global,
      });
    }
  }

  return result;
}

async function migrateConfigurations(entries: readonly ConfigEntry[]): Promise<void> {
  const newConfig = vscode.workspace.getConfiguration(NEW_CONFIG_NS);
  for (const entry of entries) {
    try {
      await newConfig.update(entry.newKey, entry.value, entry.target);
    } catch (err) {
      console.error(
        `[migration] Failed to copy ${OLD_CONFIG_NS}.${entry.oldKey} -> ${NEW_CONFIG_NS}.${entry.newKey}:`,
        err
      );
    }
  }
}
