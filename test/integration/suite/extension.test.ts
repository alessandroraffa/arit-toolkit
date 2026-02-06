import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    const ext = vscode.extensions.getExtension('alessandroraffa.arit-toolkit');
    assert.ok(ext, 'Extension should be installed');
  });

  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('alessandroraffa.arit-toolkit');
    assert.ok(ext, 'Extension should be installed');

    await ext.activate();
    assert.ok(ext.isActive, 'Extension should be active');
  });

  test('Command should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('arit.createTimestampedFile'),
      'Command arit.createTimestampedFile should be registered'
    );
  });

  test('Toggle command should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('arit.toggleEnabled'),
      'Command arit.toggleEnabled should be registered'
    );
  });

  test('Configuration should have default values', () => {
    const config = vscode.workspace.getConfiguration('arit');

    assert.strictEqual(
      config.get('timestampFormat'),
      'YYYYMMDDHHmm',
      'Default timestamp format should be YYYYMMDDHHmm'
    );

    assert.strictEqual(
      config.get('timestampSeparator'),
      '-',
      'Default separator should be -'
    );

    assert.strictEqual(
      config.get('logLevel'),
      'info',
      'Default log level should be info'
    );
  });
});
