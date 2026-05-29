import * as vscode from 'vscode';
import * as path from 'node:path';
import type { FeatureRegistrationContext } from '../index';
import { sweepOrphans } from './tempStore';
import type { PreservedFailureRecord } from './tempStore';
import { SessionRegistry } from './session';
import { editSkillBundleCommand } from './command';
import { registerSaveListener, registerCloseListener } from './saveHandler';

export const COMMAND_ID_EDIT_SKILL_BUNDLE = 'tangyr.editSkillBundle';
export const SKILL_EDITS_DIR_NAME = 'skill-edits';
export const SKILL_MD_BASENAME = 'SKILL.md';

function notifyPreserved(records: readonly PreservedFailureRecord[]): void {
  for (const record of records) {
    void vscode.window.showInformationMessage(
      `Tangyr: Unresolved edit failure for ${path.basename(record.bundleFsPath)} ` +
        `(${record.reason}). Content preserved at: ${record.preservedTempFilePath}`
    );
  }
}

export async function registerSkillBundleEditFeature(
  ctx: FeatureRegistrationContext
): Promise<vscode.Disposable> {
  const sessionRegistry = new SessionRegistry(ctx.context);
  const preserved = await sweepOrphans(ctx.context);
  notifyPreserved(preserved);
  ctx.registry.register(
    COMMAND_ID_EDIT_SKILL_BUNDLE,
    (uri?: vscode.Uri): Promise<void> => {
      if (!uri) {
        void vscode.window.showErrorMessage(
          'Tangyr: editSkillBundle requires a file URI.'
        );
        return Promise.resolve();
      }
      return editSkillBundleCommand(uri, ctx.context, sessionRegistry);
    }
  );
  const saveListener = registerSaveListener(sessionRegistry);
  const closeListener = registerCloseListener(sessionRegistry);
  ctx.context.subscriptions.push(saveListener, closeListener);
  return new vscode.Disposable(() => {
    saveListener.dispose();
    closeListener.dispose();
  });
}
