import * as vscode from 'vscode';
import type { LogLevel, TimestampFormat } from '../types';

export class ConfigManager {
  private static readonly SECTION = 'arit';

  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(ConfigManager.SECTION);
  }

  public get timestampFormat(): TimestampFormat {
    return this.config.get<TimestampFormat>('timestampFormat') ?? 'YYYYMMDDHHmm';
  }

  public get timestampSeparator(): string {
    return this.config.get<string>('timestampSeparator') ?? '-';
  }

  public get logLevel(): LogLevel {
    return this.config.get<LogLevel>('logLevel') ?? 'info';
  }

  public onConfigChange(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ConfigManager.SECTION)) {
        callback();
      }
    });
  }
}
