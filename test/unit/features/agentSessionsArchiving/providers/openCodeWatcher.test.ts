/**
 * Activity 4 tests for OpenCodeProvider: change-detection, watch patterns,
 * cross-workspace isolation, and fingerprint scoping (WS-0022 Task 4.1).
 *
 * These tests use real fixture DBs (node:sqlite) — no DB mocking.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

function tmpDb(): string {
  return path.join(os.tmpdir(), `opencode-watcher-test-${crypto.randomUUID()}.db`);
}

function createLogger() {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

describe('OpenCodeProvider — change detection and watch patterns (Activity 4)', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDb();
    delete process.env['OPENCODE_DB'];
    delete process.env['XDG_DATA_HOME'];
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ok */
    }
  });

  describe('re-archive on update (AC-5)', () => {
    it('compositeMtime changes when time_updated or message/part count changes', async () => {
      const workspacePath = fs.realpathSync(os.tmpdir());
      const sessionId = `re-arch-${crypto.randomUUID().slice(0, 8)}`;

      const db = createFixtureDb(dbPath);
      insertSession(db, { id: sessionId, directory: workspacePath, time_updated: 1000 });
      db.close();

      process.env['OPENCODE_DB'] = dbPath;
      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(createLogger() as any);

      const sessions1 = await provider.findSessions(workspacePath);
      expect(sessions1).toHaveLength(1);
      const mtime1 = sessions1[0]!.compositeMtime;
      expect(mtime1).toMatch(/^1000:0:0$/);

      // Update the DB: add a message and a part
      const db2 = createFixtureDb(dbPath);
      // createFixtureDb creates tables but data is already there — need to open existing
      db2.close();
      // Open with write access to insert
      const { DatabaseSync } = await import('node:sqlite');
      const writeDb = new DatabaseSync(dbPath);
      writeDb
        .prepare('UPDATE session SET time_updated = ? WHERE id = ?')
        .run(2000, sessionId);
      const msgId = `msg-${crypto.randomUUID().slice(0, 6)}`;
      writeDb
        .prepare(
          'INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)'
        )
        .run(msgId, sessionId, 1100, JSON.stringify({ role: 'user' }));
      writeDb
        .prepare(
          'INSERT INTO part (id, message_id, session_id, time_created, data) VALUES (?, ?, ?, ?, ?)'
        )
        .run(
          crypto.randomUUID(),
          msgId,
          sessionId,
          1200,
          JSON.stringify({ type: 'text', text: 'hi' })
        );
      writeDb.close();

      const sessions2 = await provider.findSessions(workspacePath);
      expect(sessions2).toHaveLength(1);
      const mtime2 = sessions2[0]!.compositeMtime;
      expect(mtime2).toMatch(/^2000:1:1$/);

      // Different fingerprint — archiveService would re-archive
      expect(mtime1).not.toBe(mtime2);
    });
  });

  describe('no cross-workspace churn (AC-6)', () => {
    it('findSessions with workspace A only returns workspace-A sessions', async () => {
      const workspaceA = fs.realpathSync(os.tmpdir());
      const workspaceB = '/nonexistent-workspace-b-' + crypto.randomUUID();

      const db = createFixtureDb(dbPath);
      insertSession(db, { id: 'sess-a', directory: workspaceA, time_updated: 100 });
      insertSession(db, { id: 'sess-b', directory: workspaceB, time_updated: 200 });
      db.close();

      process.env['OPENCODE_DB'] = dbPath;
      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(createLogger() as any);
      const sessions = await provider.findSessions(workspaceA);

      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.archiveName).toContain('sess-a');
    });
  });

  describe('fingerprint scoping (AC-5)', () => {
    it('compositeMtime includes timeUpdated, messageCount, partCount for the specific session', async () => {
      const workspacePath = fs.realpathSync(os.tmpdir());
      const sessionId = `fp-sess-${crypto.randomUUID().slice(0, 8)}`;
      const msgId = `fp-msg-${crypto.randomUUID().slice(0, 6)}`;

      const db = createFixtureDb(dbPath);
      insertSession(db, { id: sessionId, directory: workspacePath, time_updated: 5000 });
      insertMessage(db, { id: msgId, session_id: sessionId, time_created: 5100 });
      insertPart(db, { message_id: msgId, session_id: sessionId, time_created: 5200 });
      insertPart(db, { message_id: msgId, session_id: sessionId, time_created: 5300 });
      db.close();

      process.env['OPENCODE_DB'] = dbPath;
      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(createLogger() as any);
      const sessions = await provider.findSessions(workspacePath);

      expect(sessions).toHaveLength(1);
      // timeUpdated:messageCount:partCount
      expect(sessions[0]!.compositeMtime).toBe('5000:1:2');
    });
  });

  describe('watch patterns (Task 4.1 / F3)', () => {
    it('default: returns wildcard globs matching discovery pattern (opencode*.db / opencode*.db-wal)', async () => {
      const storeDir = path.join(os.homedir(), '.local', 'share', 'opencode');
      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(createLogger() as any);
      const patterns = provider.getWatchPatterns('/workspace');

      expect(patterns).toHaveLength(2);
      const globs = patterns.map((p) => p.glob);
      // Wildcard glob covers opencode.db, opencode-beta.db, opencode-stable.db, etc.
      expect(globs).toContain('opencode*.db');
      expect(globs).toContain('opencode*.db-wal');
      expect(globs).not.toContain('opencode.db-shm');
      // All patterns point to the default store dir
      for (const p of patterns) {
        expect(p.baseUri.fsPath).toBe(storeDir);
      }
    });

    it('OPENCODE_DB: watches exact filename (plus WAL) in its directory', async () => {
      const customDir = path.join(os.tmpdir(), 'custom-opencode');
      const customDb = path.join(customDir, 'mystore.db');
      process.env['OPENCODE_DB'] = customDb;

      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(createLogger() as any);
      const patterns = provider.getWatchPatterns('/workspace');

      expect(patterns).toHaveLength(2);
      const globs = patterns.map((p) => p.glob);
      expect(globs).toContain('mystore.db');
      expect(globs).toContain('mystore.db-wal');
      for (const p of patterns) {
        expect(p.baseUri.fsPath).toBe(customDir);
      }
    });

    it('OPENCODE_DB with opencode.db filename: watches opencode.db and opencode.db-wal', async () => {
      const customDir = path.join(os.tmpdir(), 'custom-opencode');
      const customDb = path.join(customDir, 'opencode.db');
      process.env['OPENCODE_DB'] = customDb;

      const { OpenCodeProvider } =
        await import('../../../../../src/features/agentSessionsArchiving/providers/openCodeProvider');
      const provider = new OpenCodeProvider(createLogger() as any);
      const patterns = provider.getWatchPatterns('/workspace');

      expect(patterns).toHaveLength(2);
      const globs = patterns.map((p) => p.glob);
      expect(globs).toContain('opencode.db');
      expect(globs).toContain('opencode.db-wal');
      for (const p of patterns) {
        expect(p.baseUri.fsPath).toBe(customDir);
      }
    });
  });
});

// Verify window mock is available (sanity — not a real assertion)
void window;
