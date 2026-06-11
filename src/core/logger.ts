import * as vscode from 'vscode';
import type { LogLevel } from '../types';

const LOG_LEVELS: readonly LogLevel[] = ['off', 'error', 'warn', 'info', 'debug'];

export class Logger {
  private static instance: Logger | undefined;
  private readonly outputChannel: vscode.OutputChannel;
  private level: LogLevel = 'info';

  private constructor(opts?: { workspaceFolderName?: string }) {
    const folderSuffix = opts?.workspaceFolderName
      ? ' (' + opts.workspaceFolderName + ')'
      : '';
    this.outputChannel = vscode.window.createOutputChannel(
      'Tangyr Workbench' + folderSuffix
    );
  }

  /** Returns the singleton Logger instance. The opts parameter is honoured only on first call; subsequent calls with opts are no-ops (singleton semantics). */
  public static getInstance(opts?: { workspaceFolderName?: string }): Logger {
    Logger.instance ??= new Logger(opts);
    return Logger.instance;
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, args);
  }

  public info(message: string, ...args: unknown[]): void {
    this.log('info', message, args);
  }

  public warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, args);
  }

  public error(message: string, ...args: unknown[]): void {
    this.log('error', message, args);
  }

  public show(): void {
    this.outputChannel.show();
  }

  public dispose(): void {
    this.outputChannel.dispose();
    Logger.instance = undefined;
  }

  private log(level: LogLevel, message: string, args: unknown[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    const output =
      args.length > 0 ? `${formattedMessage} ${JSON.stringify(args)}` : formattedMessage;

    this.outputChannel.appendLine(output);
  }

  private shouldLog(level: LogLevel): boolean {
    const currentLevelIndex = LOG_LEVELS.indexOf(this.level);
    const messageLevelIndex = LOG_LEVELS.indexOf(level);
    return messageLevelIndex <= currentLevelIndex && currentLevelIndex > 0;
  }
}
