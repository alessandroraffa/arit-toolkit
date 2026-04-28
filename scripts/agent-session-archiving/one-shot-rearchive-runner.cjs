const assert = require('node:assert/strict');
const os = require('node:os');
const fsp = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

const WORKSPACE = readRequiredEnv('ARIT_ARCHIVE_WORKSPACE');
const WORKSPACE_STORAGE = readRequiredEnv('ARIT_ARCHIVE_WORKSPACE_STORAGE');
const INTERVAL_MINUTES = readPositiveNumber('ARIT_ARCHIVE_INTERVAL_MINUTES', 5);
const ARCHIVE_DIR = path.join(WORKSPACE, 'docs/archive/agent-sessions');
const CODEX_SOURCE_ROOT = path.join(os.homedir(), '.codex/sessions');
const COPILOT_SESSIONS_DIR = path.join(WORKSPACE_STORAGE, 'chatSessions');

const CODEX_TARGET_FRAGMENTS = [
  'codex-019cd433',
  'codex-019d1600',
  'codex-019d06f2',
  'codex-019c9048',
  'codex-019cf41f',
];

const EMPTY_RAW_COPILOT_FRAGMENTS = [
  'copilot-chat-4ebac531',
  'copilot-chat-e3380c93',
  'copilot-chat-ee0e73f7',
  'copilot-chat-e2f0429e',
  'copilot-chat-1bc4538f',
  'copilot-chat-418b3bfd',
  'copilot-chat-b5b93bb0',
  'copilot-chat-9901b84a',
  'copilot-chat-f62147e7',
  'copilot-chat-4a4d1d26',
];

const STUB_COPILOT_FRAGMENTS = [
  'copilot-chat-b7311380',
  'copilot-chat-6be6586b',
  'copilot-chat-bae38255',
  'copilot-chat-b6145e31',
];

function readRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function readPositiveNumber(name, fallback) {
  const raw = process.env[name] ?? String(fallback);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number, received: ${raw}`);
  }
  return parsed;
}

function log(message) {
  console.log('[WS-0011]', message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readArchiveEntries() {
  const names = await fsp.readdir(ARCHIVE_DIR);
  return names.sort();
}

async function latestArchiveMtime() {
  const names = await readArchiveEntries();
  let latest = 0;

  for (const name of names) {
    try {
      const stat = await fsp.stat(path.join(ARCHIVE_DIR, name));
      if (stat.mtimeMs > latest) {
        latest = stat.mtimeMs;
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        continue;
      }
      throw err;
    }
  }

  return latest;
}

async function waitForArchiveActivitySince(baseline, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await latestArchiveMtime();
    if (current > baseline) {
      log('Archive activity detected.');
      return current;
    }
    await sleep(5000);
  }
  throw new Error('Timed out waiting for first archive cycle activity.');
}

async function waitForArchiveStability(idleMs, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = await latestArchiveMtime();
  let stableSince = Date.now();

  while (Date.now() < deadline) {
    await sleep(5000);
    const current = await latestArchiveMtime();
    if (current === last) {
      if (Date.now() - stableSince >= idleMs) {
        log('Archive directory is stable.');
        return current;
      }
      continue;
    }

    last = current;
    stableSince = Date.now();
  }

  throw new Error('Timed out waiting for archive stability.');
}

async function findArchiveMatches(fragment, extension) {
  const names = await readArchiveEntries();
  return names
    .filter((name) => name.includes(fragment) && name.endsWith(extension))
    .map((name) => path.join(ARCHIVE_DIR, name));
}

async function findSingleArchiveByFragment(fragment, extension = '.md') {
  const matches = await findArchiveMatches(fragment, extension);
  assert.equal(
    matches.length,
    1,
    `Expected exactly one archive file containing ${fragment}, found ${matches.length}`
  );
  return matches[0];
}

async function countUserSections(filePath) {
  const content = await fsp.readFile(filePath, 'utf8');
  return (content.match(/\*\*User:\*\*/g) || []).length;
}

async function hasAnyTurnSection(filePath) {
  const content = await fsp.readFile(filePath, 'utf8');
  return /\*\*(User|Agent):\*\*/.test(content);
}

async function snapshotMtimes(filePaths) {
  const entries = await Promise.all(
    filePaths.map(async (filePath) => {
      const stat = await fsp.stat(filePath);
      return [filePath, stat.mtimeMs];
    })
  );

  return new Map(entries);
}

async function walkFiles(rootPath) {
  const entries = await fsp.readdir(rootPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      results.push(entryPath);
    }
  }

  return results;
}

async function findSingleCodexSourceByFragment(fragment) {
  const sourceFragment = fragment.replace(/^codex-/, '');
  const files = await walkFiles(CODEX_SOURCE_ROOT);
  const matches = files.filter(
    (filePath) => filePath.includes(sourceFragment) && filePath.endsWith('.jsonl')
  );
  assert.equal(
    matches.length,
    1,
    `Expected exactly one Codex source file containing ${sourceFragment}, found ${matches.length}`
  );
  return matches[0];
}

async function countCodexSourceUserTurns(filePath) {
  const content = await fsp.readFile(filePath, 'utf8');
  let count = 0;

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const event = JSON.parse(line);
    if (
      event.type === 'event_msg' &&
      event.payload &&
      event.payload.type === 'user_message'
    ) {
      count += 1;
    }
  }

  return count;
}

function pickPreferredPath(current, candidate) {
  if (!current) {
    return candidate;
  }

  if (candidate.mtimeMs > current.mtimeMs) {
    return candidate;
  }

  if (candidate.mtimeMs < current.mtimeMs) {
    return current;
  }

  if (candidate.extension === '.jsonl' && current.extension !== '.jsonl') {
    return candidate;
  }

  return current;
}

async function findCopilotSourceMatches(fragment) {
  const sourceFragment = fragment.replace(/^copilot-chat-/, '');
  const names = await fsp.readdir(COPILOT_SESSIONS_DIR);
  return names
    .filter(
      (name) =>
        name.includes(sourceFragment) &&
        (name.endsWith('.json') || name.endsWith('.jsonl'))
    )
    .map((name) => path.join(COPILOT_SESSIONS_DIR, name));
}

async function findPreferredCopilotSource(fragment) {
  const names = await findCopilotSourceMatches(fragment);
  const candidates = [];

  for (const filePath of names) {
    const stat = await fsp.stat(filePath);
    candidates.push({
      filePath,
      mtimeMs: stat.mtimeMs,
      extension: path.extname(filePath),
    });
  }

  let preferred;
  for (const candidate of candidates) {
    preferred = pickPreferredPath(preferred, candidate);
  }

  assert.ok(
    preferred,
    `Expected at least one Copilot source file containing ${fragment}.`
  );
  return preferred.filePath;
}

exports.run = async function run() {
  const folders = vscode.workspace.workspaceFolders;
  assert.ok(folders && folders.length > 0, 'Expected an opened workspace.');
  assert.equal(folders[0].uri.fsPath, WORKSPACE, 'Expected configured workspace.');

  const extension = vscode.extensions.getExtension('alessandroraffa.arit-toolkit');
  assert.ok(extension, 'ARIT Toolkit extension should be available.');

  const baseline = await latestArchiveMtime();
  log(`Baseline latest archive mtime: ${String(Math.trunc(baseline))}`);

  await extension.activate();
  log('Extension activated. Waiting for startup archive cycle.');

  await waitForArchiveActivitySince(baseline, 240000);
  await waitForArchiveStability(20000, 300000);

  const codexTargets = [];
  for (const fragment of CODEX_TARGET_FRAGMENTS) {
    const archivePath = await findSingleArchiveByFragment(fragment);
    const sourcePath = await findSingleCodexSourceByFragment(fragment);
    const expectedUserTurns = await countCodexSourceUserTurns(sourcePath);
    const actualUserTurns = await countUserSections(archivePath);

    assert.equal(
      actualUserTurns,
      expectedUserTurns,
      `${fragment} should have exactly ${expectedUserTurns} user turns`
    );

    codexTargets.push({ archivePath, sourcePath });
  }

  const copilotArchivePath = await findSingleArchiveByFragment('copilot-chat-7a54e9a3');
  assert.ok(
    (await countUserSections(copilotArchivePath)) >= 7,
    'copilot-chat-7a54e9a3 should have at least 7 user turns'
  );
  const copilotSourcePath = await findPreferredCopilotSource('7a54e9a3');

  log('Turn-count verification passed.');

  const orphanRawArchives = [];
  for (const fragment of EMPTY_RAW_COPILOT_FRAGMENTS) {
    const sourceMatches = await findCopilotSourceMatches(fragment);
    const matches = await findArchiveMatches(fragment, '.jsonl');
    if (sourceMatches.length === 0) {
      if (matches.length > 0) {
        orphanRawArchives.push(fragment);
      }
      continue;
    }

    assert.equal(
      matches.length,
      0,
      `${fragment} should be absent from archive as raw JSONL`
    );
  }

  if (orphanRawArchives.length > 0) {
    log(
      `Retained orphan raw archives with no current source session: ${orphanRawArchives.join(', ')}`
    );
  }

  const orphanStubArchives = [];
  for (const fragment of STUB_COPILOT_FRAGMENTS) {
    const sourceMatches = await findCopilotSourceMatches(fragment);
    const matches = await findArchiveMatches(fragment, '.md');
    if (sourceMatches.length === 0) {
      if (matches.length > 0) {
        orphanStubArchives.push(fragment);
      }
      continue;
    }

    assert.ok(matches.length <= 1, `Expected at most one archive file for ${fragment}`);
    if (matches.length === 0) {
      continue;
    }

    assert.ok(
      await hasAnyTurnSection(matches[0]),
      `${fragment} should contain at least one turn section if present`
    );
  }

  if (orphanStubArchives.length > 0) {
    log(
      `Retained orphan stub archives with no current source session: ${orphanStubArchives.join(', ')}`
    );
  }

  log('Empty-session verification passed.');

  const verificationTargets = [
    ...codexTargets,
    { archivePath: copilotArchivePath, sourcePath: copilotSourcePath },
  ];
  const archiveSnapshotBefore = await snapshotMtimes(
    verificationTargets.map((target) => target.archivePath)
  );
  const sourceSnapshotBefore = await snapshotMtimes(
    verificationTargets.map((target) => target.sourcePath)
  );

  log('Waiting for the next automatic cycle to confirm no loop.');
  await sleep(INTERVAL_MINUTES * 60000 + 45000);

  const archiveSnapshotAfter = await snapshotMtimes(
    verificationTargets.map((target) => target.archivePath)
  );
  const sourceSnapshotAfter = await snapshotMtimes(
    verificationTargets.map((target) => target.sourcePath)
  );

  for (const target of verificationTargets) {
    const sourceBefore = sourceSnapshotBefore.get(target.sourcePath);
    const sourceAfter = sourceSnapshotAfter.get(target.sourcePath);
    if (sourceBefore !== sourceAfter) {
      log(
        `Source changed during verification window; skipping no-loop assertion for ${path.basename(target.archivePath)}.`
      );
      continue;
    }

    assert.equal(
      archiveSnapshotAfter.get(target.archivePath),
      archiveSnapshotBefore.get(target.archivePath),
      `Expected no rewrite on second cycle for ${path.basename(target.archivePath)}`
    );
  }

  log('No-loop verification passed.');
};
