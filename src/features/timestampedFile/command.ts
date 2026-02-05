import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { ConfigManager } from '../../core/configManager';
import type { Logger } from '../../core/logger';
import { generateTimestamp } from './utils';

export function createTimestampedFileCommand(
  config: ConfigManager,
  logger: Logger
): (uri?: vscode.Uri) => Promise<void> {
  return async (uri?: vscode.Uri): Promise<void> => {
    try {
      const timestamp = generateTimestamp(config.timestampFormat);
      const separator = config.timestampSeparator;

      const folderPath =
        uri?.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

      if (!folderPath) {
        void vscode.window.showErrorMessage('ARIT: No folder selected or workspace open');
        return;
      }

      const prefix = `${timestamp}${separator}`;
      const fileName = await vscode.window.showInputBox({
        prompt: 'Enter file name',
        value: prefix,
        valueSelection: [prefix.length, prefix.length],
      });

      if (!fileName) {
        logger.debug('File creation cancelled by user');
        return;
      }

      const filePath = path.join(folderPath, fileName);
      const fileUri = vscode.Uri.file(filePath);

      await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
      await vscode.window.showTextDocument(fileUri);

      logger.info(`Created timestamped file: ${fileName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create timestamped file', errorMessage);
      void vscode.window.showErrorMessage(
        'ARIT: Failed to create file. See output for details.'
      );
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

      const filePath = uri.fsPath;
      const stats = await fs.promises.stat(filePath);
      const creationDate = stats.birthtime;

      const timestamp = generateTimestamp(config.timestampFormat, creationDate);
      const separator = config.timestampSeparator;

      const dirPath = path.dirname(filePath);
      const originalName = path.basename(filePath);
      const newName = `${timestamp}${separator}${originalName}`;

      const confirmedName = await vscode.window.showInputBox({
        prompt: 'Confirm new file name',
        value: newName,
        valueSelection: [0, 0],
      });

      if (!confirmedName) {
        logger.debug('File rename cancelled by user');
        return;
      }

      const finalPath = path.join(dirPath, confirmedName);
      const newUri = vscode.Uri.file(finalPath);

      await vscode.workspace.fs.rename(uri, newUri);

      logger.info(`Renamed file: ${originalName} -> ${confirmedName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to prefix timestamp to file', errorMessage);
      void vscode.window.showErrorMessage(
        'ARIT: Failed to rename file. See output for details.'
      );
    }
  };
}
