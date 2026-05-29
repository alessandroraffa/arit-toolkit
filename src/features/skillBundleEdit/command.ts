import * as vscode from 'vscode';
import * as path from 'node:path';
import { Logger } from '../../core/logger';
import { readSkillBundle } from './bundle';
import type { SkillBundleContent } from './bundle';
import { resolveTempUri, writeTempFile } from './tempStore';
import type { SessionRegistry } from './session';
import { SKILL_MD_TEMPLATE } from './template';

async function resolveRawContent(
  content: SkillBundleContent
): Promise<string | undefined> {
  if (content.skillMd !== undefined) return content.skillMd;
  const choice = await vscode.window.showInformationMessage(
    'The bundle does not contain SKILL.md.',
    'Create from template'
  );
  return choice === 'Create from template' ? SKILL_MD_TEMPLATE : undefined;
}

async function openFreshSession(
  bundleUri: vscode.Uri,
  ctx: vscode.ExtensionContext,
  registry: SessionRegistry
): Promise<void> {
  const result = await readSkillBundle(bundleUri);
  const rawContent = await resolveRawContent(result);
  if (rawContent === undefined) return;
  const tempUri = resolveTempUri(bundleUri, ctx);
  await writeTempFile(tempUri, rawContent);
  const doc = await vscode.workspace.openTextDocument(tempUri);
  await vscode.window.showTextDocument(doc, { preview: false });
  registry.set({ bundleUri, tempUri, document: doc, companions: result.companions });
  void vscode.window.showInformationMessage(
    `Editing SKILL.md from ${path.basename(bundleUri.fsPath)}`
  );
}

export async function editSkillBundleCommand(
  bundleUri: vscode.Uri,
  ctx: vscode.ExtensionContext,
  registry: SessionRegistry
): Promise<void> {
  const existing = registry.get(bundleUri.fsPath);
  if (existing) {
    await vscode.window.showTextDocument(existing.document, { preview: false });
    return;
  }
  try {
    await openFreshSession(bundleUri, ctx, registry);
  } catch (err) {
    const base = path.basename(bundleUri.fsPath);
    Logger.getInstance().error(
      `[editSkillBundleCommand] Failed to open ${base}: ${String(err)}`
    );
    void vscode.window.showErrorMessage(`Tangyr: Cannot open ${base}: ${String(err)}`);
  }
}
