const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

const EXTENSION_ROOT = path.resolve(__dirname, '..', '..');
const RUNNER_PATH = path.join(__dirname, 'one-shot-rearchive-runner.cjs');

function readRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function resolveWorkspaceStoragePath() {
  const explicitPath = process.env.TANGYR_ARCHIVE_REAL_WORKSPACE_STORAGE;
  if (explicitPath) {
    return explicitPath;
  }

  const storageId = process.env.TANGYR_ARCHIVE_WORKSPACE_STORAGE_ID;
  if (!storageId) {
    throw new Error(
      'Set TANGYR_ARCHIVE_REAL_WORKSPACE_STORAGE or TANGYR_ARCHIVE_WORKSPACE_STORAGE_ID.'
    );
  }

  return path.join(
    os.homedir(),
    'Library/Application Support/Code/User/workspaceStorage',
    storageId
  );
}

function assertPathExists(label, targetPath) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} does not exist: ${targetPath}`);
  }
}

function readIntervalMinutes() {
  const raw = process.env.TANGYR_ARCHIVE_INTERVAL_MINUTES ?? '5';
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `TANGYR_ARCHIVE_INTERVAL_MINUTES must be a positive number, received: ${raw}`
    );
  }
  return parsed;
}

(async () => {
  const workspace = readRequiredEnv('TANGYR_ARCHIVE_WORKSPACE');
  const realWorkspaceStorage = resolveWorkspaceStoragePath();
  const intervalMinutes = readIntervalMinutes();
  const keepTemp = process.env.TANGYR_ARCHIVE_KEEP_TEMP === '1';

  assertPathExists('workspace', workspace);
  assertPathExists('workspace storage snapshot source', realWorkspaceStorage);
  assertPathExists('extension-host runner', RUNNER_PATH);

  const storageId = path.basename(realWorkspaceStorage);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tangyr-osr-'));
  const userDataDir = path.join(tempRoot, 'user-data');
  const extensionsDir = path.join(tempRoot, 'extensions');
  const targetWorkspaceStorage = path.join(
    userDataDir,
    'User/workspaceStorage',
    storageId
  );

  fs.mkdirSync(path.dirname(targetWorkspaceStorage), { recursive: true });
  fs.mkdirSync(extensionsDir, { recursive: true });
  fs.cpSync(realWorkspaceStorage, targetWorkspaceStorage, { recursive: true });

  console.log('[WS-0011] Workspace:', workspace);
  console.log('[WS-0011] Seeded workspace storage:', realWorkspaceStorage);
  console.log('[WS-0011] Temporary profile root:', tempRoot);

  try {
    const exitCode = await runTests({
      extensionDevelopmentPath: EXTENSION_ROOT,
      extensionTestsPath: RUNNER_PATH,
      extensionTestsEnv: {
        TANGYR_ARCHIVE_WORKSPACE: workspace,
        TANGYR_ARCHIVE_WORKSPACE_STORAGE: targetWorkspaceStorage,
        TANGYR_ARCHIVE_INTERVAL_MINUTES: String(intervalMinutes),
      },
      launchArgs: [
        workspace,
        '--new-window',
        '--disable-extensions',
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
      ],
    });

    if (exitCode !== 0) {
      throw new Error('VS Code test runner exited with code ' + String(exitCode));
    }

    console.log('[WS-0011] One-shot re-archive verification completed successfully.');
  } finally {
    if (keepTemp) {
      console.log('[WS-0011] Temporary profile retained at:', tempRoot);
    } else {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
