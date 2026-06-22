import * as vscode from 'vscode';
import type { SessionProvider } from '../types';
import type { Logger } from '../../../core/logger';
import { AiderProvider } from './aiderProvider';
import { ClaudeCodeProvider } from './claudeCodeProvider';
import { ClineProvider } from './clineProvider';
import { RooCodeProvider } from './rooCodeProvider';
import { CopilotChatProvider } from './copilotChatProvider';
import { ContinueProvider } from './continueProvider';
import { CodexProvider } from './codexProvider';
import { OpenCodeProvider } from './openCodeProvider';

export function getDefaultProviders(
  context: vscode.ExtensionContext,
  logger: Logger
): SessionProvider[] {
  const globalStorageBase = vscode.Uri.joinPath(context.globalStorageUri, '..');
  const workspaceStorageDir = context.storageUri
    ? vscode.Uri.joinPath(context.storageUri, '..')
    : undefined;

  const providers: SessionProvider[] = [
    new AiderProvider(),
    new ClaudeCodeProvider(),
    new CodexProvider(),
    new OpenCodeProvider(logger),
    new ClineProvider(globalStorageBase),
    new RooCodeProvider(globalStorageBase),
    new ContinueProvider(),
  ];

  if (workspaceStorageDir) {
    providers.push(new CopilotChatProvider(workspaceStorageDir));
  }

  return providers;
}
