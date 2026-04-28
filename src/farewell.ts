import * as vscode from 'vscode';

// Marketplace ID of the successor extension.
const NEW_EXT_ID = 'alessandroraffa.tangyr';

// globalState key used to show the notice only once.
const FAREWELL_SHOWN_KEY = 'farewellNotice.shown';

/**
 * Shows a one-time notification pointing users to the successor extension.
 * Failure here must not prevent the deprecated extension from activating.
 */
export async function showFarewellNoticeOnce(
  context: vscode.ExtensionContext
): Promise<void> {
  if (context.globalState.get<boolean>(FAREWELL_SHOWN_KEY)) {
    return;
  }

  try {
    const choice = await vscode.window.showWarningMessage(
      `This extension has been renamed and will no longer receive updates. ` +
        `Please install the successor: ${NEW_EXT_ID}. ` +
        `Your settings will be migrated automatically on first run of the new extension.`,
      'Install new extension',
      'Later'
    );

    if (choice === 'Install new extension') {
      await vscode.commands.executeCommand(
        'workbench.extensions.search',
        `@id:${NEW_EXT_ID}`
      );
    }
  } finally {
    await context.globalState.update(FAREWELL_SHOWN_KEY, true);
  }
}
