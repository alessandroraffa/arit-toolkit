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
import { POPULARITY_DATA } from './popularityData';

/**
 * Maps a stable provider `name` (the immutable identity each provider exposes)
 * to the canonical display name used in the popularity artifact's resolvedOrder.
 * Returns the input unchanged for any unrecognized name.
 *
 * Exported so consistency tests in Activity 4 can import it directly.
 * Note OR-004: exported here (not deferred to Activity 4) per WS-0023 note.
 */
export function providerNameToCanonical(name: string): string {
  const map: Record<string, string> = {
    aider: 'Aider',
    'claude-code': 'Claude Code',
    cline: 'Cline',
    continue: 'Continue',
    'copilot-chat': 'GitHub Copilot Chat',
    codex: 'OpenAI Codex',
    'open-code': 'OpenCode',
    'roo-code': 'RooCode',
  };
  return map[name] ?? name;
}

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

  // Sort by popularity order from the single versioned artifact.
  // Presentational only: does not affect which sessions any provider discovers,
  // matches, parses, or archives. Note BK-007: memoization deferred per WS-0023.
  providers.sort((a, b) => {
    const order = POPULARITY_DATA.resolvedOrder;
    const ia = order.indexOf(providerNameToCanonical(a.name));
    const ib = order.indexOf(providerNameToCanonical(b.name));
    const ra = ia === -1 ? order.length : ia;
    const rb = ib === -1 ? order.length : ib;
    if (ra !== rb) return ra - rb;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  return providers;
}
