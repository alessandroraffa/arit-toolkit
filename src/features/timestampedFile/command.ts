import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { ConfigManager } from '../../core/configManager';
import type { Logger } from '../../core/logger';
import { generateTimestamp } from './utils';

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

export function createTimestampedFileCommand(
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
      const fileName = await vscode.window.showInputBox({
        prompt: 'Enter file name',
        value: prefix,
        valueSelection: [prefix.length, prefix.length],
      });

      if (!fileName) {
        logger.debug('File creation cancelled by user');
        return;
      }

      const fileUri = vscode.Uri.file(path.join(folderPath, fileName));
      await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
      await vscode.window.showTextDocument(fileUri);
      logger.info(`Created timestamped file: ${fileName}`);
    } catch (error) {
      logAndShowError(logger, 'create file', error);
    }
  };
}

export function prefixTimestampToFileCommand(
  config: ConfigManager,
  logger: Logger
): (uri?: vscode.Uri) => Promise<void> {
  return async (uri?: vscode.Uri): Promise<void> => {
    try {
      if (!uri) {
        void vscode.window.showErrorMessage('ARIT: No file selected');
        return;
      }

      const timestamp = generateTimestamp(
        config.timestampFormat,
        (await fs.promises.stat(uri.fsPath)).birthtime
      );
      const originalName = path.basename(uri.fsPath);
      const newName = `${timestamp}${config.timestampSeparator}${originalName}`;

      const confirmedName = await vscode.window.showInputBox({
        prompt: 'Confirm new file name',
        value: newName,
        valueSelection: [0, 0],
      });

      if (!confirmedName) {
        logger.debug('File rename cancelled by user');
        return;
      }

      const newUri = vscode.Uri.file(path.join(path.dirname(uri.fsPath), confirmedName));
      await vscode.workspace.fs.rename(uri, newUri);
      logger.info(`Renamed file: ${originalName} -> ${confirmedName}`);
    } catch (error) {
      logAndShowError(logger, 'rename file', error);
    }
  };
}
