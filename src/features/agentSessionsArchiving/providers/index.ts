import * as vscode from 'vscode';
import type { SessionProvider } from '../types';
import { AiderProvider } from './aiderProvider';
import { ClaudeCodeProvider } from './claudeCodeProvider';
import { ClineProvider } from './clineProvider';
import { RooCodeProvider } from './rooCodeProvider';
import { CopilotChatProvider } from './copilotChatProvider';
import { ContinueProvider } from './continueProvider';

export function getDefaultProviders(context: vscode.ExtensionContext): SessionProvider[] {
  const globalStorageBase = vscode.Uri.joinPath(context.globalStorageUri, '..');
  const workspaceStorageBase = context.storageUri
    ? vscode.Uri.joinPath(context.storageUri, '..')
    : globalStorageBase;

  return [
    new AiderProvider(),
    new ClaudeCodeProvider(),
    new ClineProvider(globalStorageBase),
    new RooCodeProvider(globalStorageBase),
    new CopilotChatProvider(workspaceStorageBase),
    new ContinueProvider(),
  ];
}
