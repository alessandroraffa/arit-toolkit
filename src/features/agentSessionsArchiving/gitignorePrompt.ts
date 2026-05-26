import * as vscode from 'vscode';
import type { AgentSessionsArchivingConfig } from '../../types';
import type { Logger } from '../../core/logger';
import { isGitRepository, isGitIgnored } from '../../core/git';
import { validateArchivePath } from './archivePathValidation';

const GITIGNORE_COMMENT = '# Managed by Tangyr Workbench (agent sessions archive)';

export async function checkAndPromptGitignore(
  archivePath: string,
  workspaceRootUri: vscode.Uri,
  config: AgentSessionsArchivingConfig,
  logger: Logger,
  updateConfig: (patch: Partial<AgentSessionsArchivingConfig>) => Promise<void>
): Promise<void> {
  const validation = validateArchivePath(archivePath);
  if (!validation.valid) {
    logger.warn(
      `Skipped gitignore prompt — invalid archivePath "${archivePath}": ${validation.reason ?? 'unknown'}`
    );
    return;
  }

  const isRepo = await isGitRepository(workspaceRootUri.fsPath);
  if (!isRepo) {
    logger.debug('Skipped gitignore prompt — workspace is not a git repository');
    return;
  }

  const existing = config.gitignoreDecisions ?? {};
  if (existing[archivePath] !== undefined) {
    logger.debug(
      `Skipped gitignore prompt for ${archivePath} — decision already recorded: ${existing[archivePath]}`
    );
    return;
  }

  const alreadyIgnored = await isGitIgnored(archivePath, workspaceRootUri.fsPath);
  if (alreadyIgnored) {
    await updateConfig({
      gitignoreDecisions: { ...existing, [archivePath]: 'ignored' },
    });
    return;
  }

  const response = await vscode.window.showInformationMessage(
    `Tangyr Workbench: Add "${archivePath}" to .gitignore?`,
    'Add to .gitignore',
    'Skip'
  );
  if (response === 'Add to .gitignore') {
    try {
      await writeGitignoreEntry(archivePath, workspaceRootUri, logger);
      await updateConfig({
        gitignoreDecisions: { ...existing, [archivePath]: 'ignored' },
      });
    } catch (err) {
      logger.warn(`Failed to write .gitignore entry for ${archivePath}: ${String(err)}`);
    }
  } else if (response === 'Skip') {
    await updateConfig({
      gitignoreDecisions: { ...existing, [archivePath]: 'declined' },
    });
  } else {
    logger.debug(
      `Gitignore prompt dismissed for ${archivePath} — no decision recorded; will re-prompt next activation`
    );
  }
}

export async function writeGitignoreEntry(
  archivePath: string,
  workspaceRootUri: vscode.Uri,
  logger: Logger
): Promise<void> {
  const v = validateArchivePath(archivePath);
  if (!v.valid) {
    throw new Error(`Invalid archivePath: ${v.reason ?? 'unknown'}`);
  }

  const gitignoreUri = vscode.Uri.joinPath(workspaceRootUri, '.gitignore');
  let existing = '';
  try {
    const bytes = await vscode.workspace.fs.readFile(gitignoreUri);
    existing = new TextDecoder().decode(bytes);
  } catch {
    // file does not exist
  }

  const entryLine = `${archivePath}/`;
  if (existing.split('\n').some((line) => line.trim() === entryLine)) {
    logger.debug(`Entry "${entryLine}" already present in .gitignore`);
    return;
  }

  const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n');
  const toWrite = `${needsLeadingNewline ? '\n' : ''}${GITIGNORE_COMMENT}\n${entryLine}\n`;
  const newContent = existing + toWrite;
  await vscode.workspace.fs.writeFile(gitignoreUri, new TextEncoder().encode(newContent));
  logger.info(`Added "${entryLine}" to .gitignore`);
}
