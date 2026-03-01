import * as vscode from 'vscode';
import type { SessionProvider } from '../types';
import { AiderProvider } from './aiderProvider';
import { ClaudeCodeProvider } from './claudeCodeProvider';
import { ClineProvider } from './clineProvider';
import { RooCodeProvider } from './rooCodeProvider';
import { CopilotChatProvider } from './copilotChatProvider';
import { ContinueProvider } from './continueProvider';
import { CodexProvider } from './codexProvider';

export function getDefaultProviders(context: vscode.ExtensionContext): SessionProvider[] {
  const globalStorageBase = vscode.Uri.joinPath(context.globalStorageUri, '..');
  const workspaceStorageDir = context.storageUri
    ? vscode.Uri.joinPath(context.storageUri, '..')
    : undefined;

  const providers: SessionProvider[] = [
    new AiderProvider(),
    new ClaudeCodeProvider(),
    new CodexProvider(),
    new ClineProvider(globalStorageBase),
    new RooCodeProvider(globalStorageBase),
    new ContinueProvider(),
  ];

  if (workspaceStorageDir) {
    providers.push(new CopilotChatProvider(workspaceStorageDir));
  }

  return providers;
}
