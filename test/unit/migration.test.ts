import type * as vscode from 'vscode';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  commands,
  ConfigurationTarget,
  extensions,
  window,
  workspace,
} from './mocks/vscode';
import { runMigrationIfNeeded } from '../../src/migration';

describe('runMigrationIfNeeded', () => {
  let globalState: {
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    globalState = {
      get: vi.fn().mockReturnValue(false),
      update: vi.fn().mockResolvedValue(undefined),
    };
    context = { globalState } as unknown as vscode.ExtensionContext;
    extensions.getExtension = vi.fn().mockReturnValue(undefined);
  });

  it('should mark migration done when no old settings or old extension exist', async () => {
    workspace.getConfiguration = vi.fn().mockReturnValue({
      inspect: vi.fn().mockReturnValue(undefined),
    });

    await runMigrationIfNeeded(context);

    expect(globalState.update).toHaveBeenCalledWith(
      'migrationFromOldExtension.done',
      true
    );
    expect(window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('should copy user-set settings to the tangyr namespace', async () => {
    const newConfig = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const oldConfig = {
      inspect: vi.fn((key: string) => {
        const values: Record<string, unknown> = {
          timestampFormat: { globalValue: 'YYYYMMDD' },
          timestampSeparator: { workspaceValue: '_' },
          logLevel: { workspaceFolderValue: 'debug' },
        };
        return values[key];
      }),
    };
    workspace.getConfiguration = vi.fn((section: string) =>
      section === 'arit' ? oldConfig : newConfig
    );
    window.showInformationMessage = vi
      .fn()
      .mockResolvedValueOnce('Migrate now')
      .mockResolvedValueOnce('Open Settings');

    await runMigrationIfNeeded(context);

    expect(workspace.getConfiguration).toHaveBeenCalledWith('arit');
    expect(workspace.getConfiguration).toHaveBeenCalledWith('tangyr');
    expect(newConfig.update).toHaveBeenCalledWith(
      'timestampFormat',
      'YYYYMMDD',
      ConfigurationTarget.Global
    );
    expect(newConfig.update).toHaveBeenCalledWith(
      'timestampSeparator',
      '_',
      ConfigurationTarget.Workspace
    );
    expect(newConfig.update).toHaveBeenCalledWith(
      'logLevel',
      'debug',
      ConfigurationTarget.WorkspaceFolder
    );
    expect(commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      '@ext:alessandroraffa.tangyr'
    );
    expect(globalState.update).toHaveBeenCalledWith(
      'migrationFromOldExtension.done',
      true
    );
  });
});
