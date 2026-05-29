import * as vscode from 'vscode';
import { Logger } from '../../core/logger';
import { writeSkillBundle } from './bundle';
import { deleteTempDir } from './tempStore';
import type { SessionRegistry, EditSession, PendingFailure } from './session';

const SKILL_EDITS_SEGMENT = '/skill-edits/';

function basename(uri: vscode.Uri): string {
  return uri.path.split('/').at(-1) ?? uri.path;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function mkFailure(reason: PendingFailure['reason'], message: string): PendingFailure {
  return { reason, message, timestamp: Date.now() };
}

function isFileNotFound(err: unknown): boolean {
  return (err as { code?: string } | undefined)?.code === 'FileNotFound';
}

function findSessionByTempPath(
  registry: SessionRegistry,
  fsPath: string
): EditSession | undefined {
  for (const [, session] of registry.entries()) {
    if (session.tempUri.fsPath === fsPath) return session;
  }
  return undefined;
}

function tempBundlePath(bundleUri: vscode.Uri): vscode.Uri {
  const name = basename(bundleUri).replace(/\.skill$/, '');
  const nonce = `${String(process.pid)}-${Math.random().toString(36).slice(2)}`;
  return vscode.Uri.joinPath(bundleUri, '..', `${name}.skill.tmp-${nonce}`);
}

/**
 * Records a pending failure and reports whether the on-disk sentinel write
 * succeeded. On `markFailure` rejection the sentinel is not durable, so a
 * distinct error is surfaced and the caller must not show the normal recovery
 * prompt (returns false).
 */
async function recordFailure(
  registry: SessionRegistry,
  session: EditSession,
  failure: PendingFailure
): Promise<boolean> {
  try {
    await registry.markFailure(session.bundleUri.fsPath, failure);
    return true;
  } catch (err) {
    Logger.getInstance().error(`[saveHandler] markFailure failed: ${String(err)}`);
    void vscode.window.showErrorMessage(
      `Tangyr: failed to record bundle edit failure — recovery may not work. ` +
        `Path: ${session.tempUri.fsPath}`
    );
    return false;
  }
}

async function clearFailureSafe(
  registry: SessionRegistry,
  fsPath: string
): Promise<void> {
  try {
    await registry.clearFailure(fsPath);
  } catch (err) {
    Logger.getInstance().warn(`[saveHandler] clearFailure failed: ${String(err)}`);
  }
}

async function bundleExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (err) {
    if (isFileNotFound(err)) return false;
    throw err;
  }
}

async function safeDelete(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.delete(uri, { useTrash: false });
  } catch {
    // The temp file may have already been cleaned up; ignore.
  }
}

async function repackOnSave(
  registry: SessionRegistry,
  session: EditSession,
  document: vscode.TextDocument
): Promise<void> {
  const tempPath = tempBundlePath(session.bundleUri);
  const content = { skillMd: document.getText(), companions: session.companions };
  try {
    await writeSkillBundle(tempPath, content);
  } catch (err) {
    if (await recordFailure(registry, session, mkFailure('repack-io-error', msg(err)))) {
      void vscode.window.showErrorMessage(
        `Tangyr: repack failed — ${basename(session.bundleUri)}: ${msg(err)}`,
        'Retry'
      );
    }
    return;
  }
  try {
    await vscode.workspace.fs.rename(tempPath, session.bundleUri, { overwrite: true });
  } catch (renameErr) {
    await safeDelete(tempPath);
    if (
      await recordFailure(registry, session, mkFailure('rename-failed', msg(renameErr)))
    ) {
      void vscode.window.showErrorMessage(
        `Tangyr: bundle rename failed — ${basename(session.bundleUri)}: ${msg(renameErr)}`,
        'Retry'
      );
    }
    return;
  }
  await clearFailureSafe(registry, session.bundleUri.fsPath);
  void vscode.window.showInformationMessage(
    `Tangyr: bundle saved — ${basename(session.bundleUri)}`
  );
}

async function retrySave(
  registry: SessionRegistry,
  session: EditSession,
  document: vscode.TextDocument
): Promise<void> {
  const content = { skillMd: document.getText(), companions: session.companions };
  try {
    await writeSkillBundle(session.bundleUri, content);
    await clearFailureSafe(registry, session.bundleUri.fsPath);
    void vscode.window.showInformationMessage(
      `Tangyr: bundle saved — ${basename(session.bundleUri)}`
    );
  } catch (err) {
    if (await recordFailure(registry, session, mkFailure('repack-io-error', msg(err)))) {
      await promptMissing(registry, session, document);
    }
  }
}

async function saveAsNew(
  registry: SessionRegistry,
  session: EditSession,
  document: vscode.TextDocument
): Promise<void> {
  const chosenUri = await vscode.window.showSaveDialog({
    filters: { 'Skill Bundle': ['skill'] },
  });
  if (!chosenUri) return;
  const originalFsPath = session.bundleUri.fsPath;
  const content = { skillMd: document.getText(), companions: session.companions };
  try {
    await writeSkillBundle(chosenUri, content);
  } catch (err) {
    const retry = await vscode.window.showErrorMessage(
      `Tangyr: could not save to ${basename(chosenUri)} — ${msg(err)}. ` +
        `Original bundle's recovery state is unchanged.`,
      'Retry…'
    );
    if (retry === 'Retry…') await saveAsNew(registry, session, document);
    return;
  }
  session.bundleUri = chosenUri;
  await clearFailureSafe(registry, originalFsPath);
  void vscode.window.showInformationMessage(
    `Tangyr: bundle saved as new — ${basename(chosenUri)}`
  );
}

async function promptMissing(
  registry: SessionRegistry,
  session: EditSession,
  document: vscode.TextDocument
): Promise<void> {
  const action = await vscode.window.showErrorMessage(
    `Tangyr: bundle missing — ${basename(session.bundleUri)}`,
    'Retry',
    'Save as new bundle…'
  );
  if (action === 'Retry') await retrySave(registry, session, document);
  else if (action === 'Save as new bundle…') await saveAsNew(registry, session, document);
}

async function recoverMissingBundle(
  registry: SessionRegistry,
  session: EditSession,
  document: vscode.TextDocument
): Promise<void> {
  const failure = mkFailure(
    'bundle-missing',
    `Bundle not found: ${session.bundleUri.fsPath}`
  );
  if (await recordFailure(registry, session, failure)) {
    await promptMissing(registry, session, document);
  }
}

async function handleSave(
  registry: SessionRegistry,
  document: vscode.TextDocument
): Promise<void> {
  if (!document.uri.path.includes(SKILL_EDITS_SEGMENT)) return;
  const session = findSessionByTempPath(registry, document.uri.fsPath);
  if (!session) return;
  if (await bundleExists(session.bundleUri)) {
    await repackOnSave(registry, session, document);
  } else {
    await recoverMissingBundle(registry, session, document);
  }
}

async function handleClose(
  registry: SessionRegistry,
  document: vscode.TextDocument
): Promise<void> {
  if (!document.uri.path.includes(SKILL_EDITS_SEGMENT)) return;
  const session = findSessionByTempPath(registry, document.uri.fsPath);
  if (!session) return;
  if (session.pendingFailure === undefined) {
    const dir = session.tempUri.with({
      path: session.tempUri.path.split('/').slice(0, -1).join('/'),
    });
    try {
      await deleteTempDir(dir);
    } catch (err) {
      Logger.getInstance().warn(`[saveHandler] deleteTempDir failed: ${String(err)}`);
    }
    registry.delete(session.bundleUri.fsPath);
  } else {
    void vscode.window.showInformationMessage(
      `Tangyr: tab closed with unresolved failure — bundle: ${basename(session.bundleUri)}, ` +
        `reason: ${session.pendingFailure.reason}, preserved edits at: ${session.tempUri.fsPath}`
    );
  }
}

/**
 * Registers the `onDidSaveTextDocument` repack listener.
 *
 * v1 limitations: on Windows, rename-over-existing may fail if the bundle is
 * locked by another process; on non-POSIX network mounts (SMB, NFS without
 * atomic rename) the rename may not be atomic. Both cases surface through
 * `pendingFailure`; edits are preserved and the original bundle is not modified.
 */
export function registerSaveListener(registry: SessionRegistry): vscode.Disposable {
  return vscode.workspace.onDidSaveTextDocument(
    (document): Promise<void> => handleSave(registry, document)
  );
}

export function registerCloseListener(registry: SessionRegistry): vscode.Disposable {
  return vscode.workspace.onDidCloseTextDocument(
    (document): Promise<void> => handleClose(registry, document)
  );
}
