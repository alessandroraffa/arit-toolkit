/**
 * Tests for OpenCodeProvider.
 *
 * Schema-discovery findings (increment-1):
 * - Compaction: time_compacting is session-level metadata only; no per-event
 *   compaction message/part found. compactionSummaries will always be [].
 * - Windows store path: TBV (%USERPROFILE%\.local\share\opencode).
 *   Degrades safely to absent-store no-op if wrong.
 * - Extension-host node:sqlite: available under Node 22.22 (sqliteAvailable = true).
 *   VS Code extension host on Node < 22 sets sqliteAvailable = false (Tier-1 degradation).
 * - Snapshot isolation: confirmed — concurrent writes are blocked ("database is locked")
 *   while a deferred read transaction is open. The deferred-read mitigation is effective.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { window } from '../../../mocks/vscode';
import {
  createFixtureDb,
  insertSession,
  insertMessage,
  insertPart,
} from './fixtures/openCodeFixture';

// We need to mock vscode and node:fs.promises (realpath) for some tests
vi.mock('vscode', async () => {
  const { workspace, window, Uri } = await import('../../../mocks/vscode');
  return { workspace, window, Uri, FileType: { File: 1, Directory: 2 } };
});

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `opencode-prov-test-${crypto.randomUUID()}.db`);
}

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('OpenCodeProvider', () => {
  let dbPath: string;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbPath = tmpDbPath();
    logger = createMockLogger();
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ok */
    }
    try {
      fs.unlinkSync(dbPath + '-wal');
    } catch {
      /* ok */
    }
    try {
      fs.unlinkSync(dbPath + '-shm');
    } catch {
      /* ok */
    }
    // Restore env
    delete process.env['OPENCODE_DB'];
    delete process.env['XDG_DATA_HOME'];
  });

  it('has correct name and displayName', async () => {
    const { OpenCodeProvider } =
      await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
    const provider = new OpenCodeProvider(logger as any);
    expect(provider.name).toBe('open-code');
    expect(provider.displayName).toBe('OpenCode');
  });

  describe('resolveStores()', () => {
    it('returns single path from OPENCODE_DB env var when set', async () => {
      process.env['OPENCODE_DB'] = '/custom/path/opencode.db';
      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(logger as any);
      const stores = await provider.resolveStores();
      expect(stores).toEqual(['/custom/path/opencode.db']);
    });

    it('enumerates opencode*.db files from default directory when OPENCODE_DB unset', async () => {
      const { workspace } = await import('vscode');
      vi.mocked(workspace.fs.readDirectory).mockResolvedValue([
        ['opencode.db', 1 as any],
        ['opencode-stable.db', 1 as any],
        ['not-opencode.txt', 1 as any],
        ['opencode-beta.db', 1 as any],
      ] as any);

      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(logger as any);
      const stores = await provider.resolveStores();
      expect(stores.length).toBe(3);
      expect(stores.some((s) => s.endsWith('opencode.db'))).toBe(true);
      expect(stores.some((s) => s.endsWith('opencode-stable.db'))).toBe(true);
      expect(stores.some((s) => s.endsWith('opencode-beta.db'))).toBe(true);
      expect(stores.some((s) => s.endsWith('not-opencode.txt'))).toBe(false);
    });

    it('returns [] when store directory does not exist', async () => {
      const { workspace } = await import('vscode');
      vi.mocked(workspace.fs.readDirectory).mockRejectedValue(new Error('ENOENT'));

      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(logger as any);
      const stores = await provider.resolveStores();
      expect(stores).toEqual([]);
    });
  });

  describe('findSessions()', () => {
    it('returns SessionFile for session matching workspace directory', async () => {
      const db = createFixtureDb(dbPath);
      const workspacePath = fs.realpathSync(os.tmpdir()); // use real temp dir
      const sessionId = 'test-sess-' + crypto.randomUUID().slice(0, 8);
      insertSession(db, {
        id: sessionId,
        directory: workspacePath,
        time_created: 1000,
        time_updated: 2000,
      });
      insertMessage(db, { session_id: sessionId, id: 'msg-1', time_created: 1500 });
      insertPart(db, { message_id: 'msg-1', session_id: sessionId, id: 'part-1' });
      db.close();

      process.env['OPENCODE_DB'] = dbPath;
      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(logger as any);
      const sessions = await provider.findSessions(workspacePath);

      expect(sessions.length).toBe(1);
      expect(sessions[0]!.providerName).toBe('open-code');
      expect(sessions[0]!.uri).toBeUndefined();
      expect(typeof sessions[0]!.readContent).toBe('function');
      expect(sessions[0]!.compositeMtime).toMatch(/^2000:1:1$/);
    });

    it('returns empty array for session with different directory', async () => {
      const db = createFixtureDb(dbPath);
      insertSession(db, { directory: '/other/workspace', time_updated: 1000 });
      db.close();

      process.env['OPENCODE_DB'] = dbPath;
      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(logger as any);
      const sessions = await provider.findSessions('/my/workspace');
      expect(sessions).toHaveLength(0);
    });

    it('skips sessions with relative directory and emits debug log', async () => {
      const db = createFixtureDb(dbPath);
      insertSession(db, { directory: 'relative/path', time_updated: 1000 });
      db.close();

      process.env['OPENCODE_DB'] = dbPath;
      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(logger as any);
      const sessions = await provider.findSessions('/my/workspace');
      expect(sessions).toHaveLength(0);
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('relative'));
    });

    it('emits Tier-1 signal once when sqliteAvailable is false', async () => {
      vi.resetModules();
      vi.doMock(
        '../../../../../src/features/agentSessionsArchiving/providers/openCodeAdapter',
        () => ({
          sqliteAvailable: false,
          openDb: vi.fn(),
          closeDb: vi.fn(),
          getAllSessionRows: vi.fn(),
          getMessagesForSession: vi.fn(),
          getPartsForMessage: vi.fn(),
          readSessionWithTransaction: vi.fn(),
          materializeSession: vi.fn(),
          SqliteUnavailableError: class extends Error {},
        })
      );

      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(logger as any);

      await provider.findSessions('/workspace');
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(window.showInformationMessage).toHaveBeenCalledTimes(1);

      // Second call does NOT re-emit
      await provider.findSessions('/workspace');
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(window.showInformationMessage).toHaveBeenCalledTimes(1);

      vi.doUnmock(
        '../../../../../src/features/agentSessionsArchiving/providers/openCodeAdapter'
      );
      vi.resetModules();
    });

    it('returns empty array and logs warn on Tier-2 failure (store unreadable)', async () => {
      // Reset modules so the mock takes effect before the provider is imported
      vi.resetModules();
      process.env['OPENCODE_DB'] = '/some/path/opencode.db';

      vi.doMock(
        '../../../../../src/features/agentSessionsArchiving/providers/openCodeAdapter',
        () => ({
          sqliteAvailable: true,
          openDb: vi.fn().mockImplementation(() => {
            throw new Error('SQLITE_CANTOPEN: unable to open database file');
          }),
          closeDb: vi.fn(),
          getAllSessionRows: vi.fn(),
          getMessagesForSession: vi.fn(),
          getPartsForMessage: vi.fn(),
          readSessionWithTransaction: vi.fn(),
          materializeSession: vi.fn(),
          SqliteUnavailableError: class extends Error {},
        })
      );

      const { OpenCodeProvider: Provider2 } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider2 = new Provider2(logger as any);
      const sessions = await provider2.findSessions('/workspace');
      expect(sessions).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('could not be opened')
      );

      vi.doUnmock(
        '../../../../../src/features/agentSessionsArchiving/providers/openCodeAdapter'
      );
      vi.resetModules();
    });

    it('absent store no-op: returns [] with no warning when store dir does not exist', async () => {
      const { workspace } = await import('vscode');
      vi.mocked(workspace.fs.readDirectory).mockRejectedValue(new Error('ENOENT'));

      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(logger as any);
      const sessions = await provider.findSessions('/workspace');
      expect(sessions).toHaveLength(0);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('out-of-scope signal emitted once when non-DB files exist in store dir', async () => {
      const { workspace } = await import('vscode');
      // First call: readDirectory returns non-DB entries (old JSON layout)
      vi.mocked(workspace.fs.readDirectory).mockResolvedValue([
        ['session-abc.json', 1 as any],
        ['session-def.json', 1 as any],
      ] as any);

      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(logger as any);
      await provider.findSessions('/workspace');
      expect(window.showInformationMessage).toHaveBeenCalledTimes(1);

      // Second call: does NOT re-emit
      await provider.findSessions('/workspace');
      expect(window.showInformationMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('schema-discovery: compaction', () => {
    it('session with time_compacting set but no compaction event returns compositeMtime without error', async () => {
      const db = createFixtureDb(dbPath);
      const workspacePath = fs.realpathSync(os.tmpdir());
      const sessionId = 'comp-sess-' + crypto.randomUUID().slice(0, 8);
      insertSession(db, {
        id: sessionId,
        directory: workspacePath,
        time_compacting: Date.now() - 10000,
        time_updated: 5000,
      });
      db.close();

      process.env['OPENCODE_DB'] = dbPath;
      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(logger as any);
      const sessions = await provider.findSessions(workspacePath);
      // Session returned; time_compacting is metadata only — no compaction events
      expect(sessions.length).toBe(1);
      expect(sessions[0]!.compositeMtime).toMatch(/^5000:0:0$/);
    });
  });

  describe('materializeSession §3 contract (Task 2.3)', () => {
    it('readContent() returns valid §3 JSON with schemaVersion 1, messages, and parts', async () => {
      const db = createFixtureDb(dbPath);
      const workspacePath = fs.realpathSync(os.tmpdir());
      const sessionId = 'mat-sess-' + crypto.randomUUID().slice(0, 8);
      const msgId1 = 'msg-1-' + crypto.randomUUID().slice(0, 6);
      const msgId2 = 'msg-2-' + crypto.randomUUID().slice(0, 6);

      insertSession(db, {
        id: sessionId,
        directory: workspacePath,
        title: 'Test Session',
        agent: 'claude-4',
        time_created: 1000,
        time_updated: 2000,
      });
      insertMessage(db, {
        id: msgId1,
        session_id: sessionId,
        time_created: 1100,
        data: JSON.stringify({ role: 'user' }),
      });
      insertPart(db, {
        message_id: msgId1,
        session_id: sessionId,
        time_created: 1200,
        data: JSON.stringify({ type: 'text', text: 'hello' }),
      });
      insertMessage(db, {
        id: msgId2,
        session_id: sessionId,
        time_created: 1300,
        data: JSON.stringify({ role: 'assistant' }),
      });
      insertPart(db, {
        message_id: msgId2,
        session_id: sessionId,
        time_created: 1400,
        data: JSON.stringify({ type: 'text', text: 'world' }),
      });
      insertPart(db, {
        message_id: msgId2,
        session_id: sessionId,
        time_created: 1500,
        data: JSON.stringify({ type: 'tool', tool: 'read_file' }),
      });
      db.close();

      process.env['OPENCODE_DB'] = dbPath;
      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(logger as any);
      const sessions = await provider.findSessions(workspacePath);

      expect(sessions.length).toBe(1);
      const content = await sessions[0]!.readContent!();
      const parsed = JSON.parse(content) as {
        schemaVersion: number;
        messages: Array<{ parts: unknown[] }>;
        subagents: unknown[];
      };

      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.messages).toHaveLength(2);
      expect(parsed.messages[0]!.parts).toHaveLength(1);
      expect(parsed.messages[1]!.parts).toHaveLength(2);
      expect(parsed.subagents).toEqual([]);
    });
  });
});
