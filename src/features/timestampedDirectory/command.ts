import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { ConfigManager } from '../../core/configManager';
import type { Logger } from '../../core/logger';
import { generateTimestamp } from '../../utils';

function resolveFolder(uri?: vscode.Uri): string {
  return uri?.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
}

function logAndShowError(logger: Logger, operation: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Failed to ${operation}`, message);
  void vscode.window.showErrorMessage(
    `ARIT: Failed to ${operation}. See output for details.`
  );
}

export function createTimestampedDirectoryCommand(
  config: ConfigManager,
  logger: Logger
): (uri?: vscode.Uri) => Promise<void> {
  return async (uri?: vscode.Uri): Promise<void> => {
    try {
      const folderPath = resolveFolder(uri);
      if (!folderPath) {
        void vscode.window.showErrorMessage('ARIT: No folder selected or workspace open');
        return;
      }

      const prefix = `${generateTimestamp(config.timestampFormat)}${config.timestampSeparator}`;
      const dirName = await vscode.window.showInputBox({
        prompt: 'Enter directory name',
        value: prefix,
        valueSelection: [prefix.length, prefix.length],
      });

      if (!dirName) {
        logger.debug('Directory creation cancelled by user');
        return;
      }

      const dirUri = vscode.Uri.file(path.join(folderPath, dirName));
      await vscode.workspace.fs.createDirectory(dirUri);
      logger.info(`Created timestamped directory: ${dirName}`);
    } catch (error) {
      logAndShowError(logger, 'create directory', error);
    }
  };
}

export function prefixTimestampToDirectoryCommand(
  config: ConfigManager,
  logger: Logger
): (uri?: vscode.Uri) => Promise<void> {
  return async (uri?: vscode.Uri): Promise<void> => {
    try {
      if (!uri) {
        void vscode.window.showErrorMessage('ARIT: No directory selected');
        return;
      }

      const timestamp = generateTimestamp(
        config.timestampFormat,
        (await fs.promises.stat(uri.fsPath)).birthtime
      );
      const originalName = path.basename(uri.fsPath);
      const newName = `${timestamp}${config.timestampSeparator}${originalName}`;

      const confirmedName = await vscode.window.showInputBox({
        prompt: 'Confirm new directory name',
        value: newName,
        valueSelection: [0, 0],
      });

      if (!confirmedName) {
        logger.debug('Directory rename cancelled by user');
        return;
      }

      const newUri = vscode.Uri.file(path.join(path.dirname(uri.fsPath), confirmedName));
      await vscode.workspace.fs.rename(uri, newUri);
      logger.info(`Renamed directory: ${originalName} -> ${confirmedName}`);
    } catch (error) {
      logAndShowError(logger, 'rename directory', error);
    }
  };
}
