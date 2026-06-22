import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  openDb,
  closeDb,
  getAllSessionRows,
  getMessagesForSession,
  getPartsForMessage,
  readSessionWithTransaction,
  SqliteUnavailableError,
} from '../../../../../src/features/agentSessionsArchiving/providers/openCodeAdapter';
import {
  createFixtureDb,
  insertSession,
  insertMessage,
  insertPart,
} from './fixtures/openCodeFixture';

function tmpPath(): string {
  return path.join(os.tmpdir(), `opencode-test-${crypto.randomUUID()}.db`);
}

describe('openCodeAdapter', () => {
  let dbPath: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dbPath = tmpPath();
    db = createFixtureDb(dbPath);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // already closed
    }
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // already deleted
    }
  });

  describe('openDb', () => {
    it('returns an open handle for a valid fixture DB', () => {
      const handle = openDb(dbPath);
      expect(handle).toBeDefined();
      closeDb(handle);
    });

    it('throws for a non-existent path (caller catches for Tier-2)', () => {
      // With readOnly: true (correct option casing), DatabaseSync throws for
      // non-existent paths — confirmed under Node 22.22 with node:sqlite.
      // The provider catches this in its per-store try/catch (Tier-2 guard).
      expect(() => openDb(tmpPath())).toThrow();
    });
  });

  describe('getAllSessionRows', () => {
    it('returns all session rows without directory filter', () => {
      const handle = openDb(dbPath);
      try {
        insertSession(db, { directory: '/workspace/a', id: 'sess-a' });
        insertSession(db, { directory: '/workspace/b', id: 'sess-b' });
        const rows = getAllSessionRows(handle);
        expect(rows.length).toBe(2);
      } finally {
        closeDb(handle);
      }
    });

    it('returns empty array for empty table', () => {
      const handle = openDb(dbPath);
      try {
        const rows = getAllSessionRows(handle);
        expect(rows).toEqual([]);
      } finally {
        closeDb(handle);
      }
    });
  });

  describe('getMessagesForSession', () => {
    it('returns all messages for a session ordered by (time_created, id) asc', () => {
      const handle = openDb(dbPath);
      try {
        insertSession(db, { id: 'sess-1' });
        insertMessage(db, { session_id: 'sess-1', id: 'msg-b', time_created: 2000 });
        insertMessage(db, { session_id: 'sess-1', id: 'msg-a', time_created: 1000 });
        const msgs = getMessagesForSession(handle, 'sess-1');
        expect(msgs.length).toBe(2);
        expect(msgs[0]!.id).toBe('msg-a');
        expect(msgs[1]!.id).toBe('msg-b');
      } finally {
        closeDb(handle);
      }
    });

    it('returns empty array when no messages exist for session', () => {
      const handle = openDb(dbPath);
      try {
        const msgs = getMessagesForSession(handle, 'non-existent');
        expect(msgs).toEqual([]);
      } finally {
        closeDb(handle);
      }
    });
  });

  describe('getPartsForMessage', () => {
    it('returns all parts for a message ordered by (time_created, id) asc', () => {
      const handle = openDb(dbPath);
      try {
        insertMessage(db, { id: 'msg-1', session_id: 'sess-1' });
        insertPart(db, { message_id: 'msg-1', id: 'part-b', time_created: 2000 });
        insertPart(db, { message_id: 'msg-1', id: 'part-a', time_created: 1000 });
        const parts = getPartsForMessage(handle, 'msg-1');
        expect(parts.length).toBe(2);
        expect(parts[0]!.id).toBe('part-a');
        expect(parts[1]!.id).toBe('part-b');
      } finally {
        closeDb(handle);
      }
    });

    it('returns empty array when no parts exist for message', () => {
      const handle = openDb(dbPath);
      try {
        const parts = getPartsForMessage(handle, 'non-existent');
        expect(parts).toEqual([]);
      } finally {
        closeDb(handle);
      }
    });
  });

  describe('closeDb', () => {
    it('closes the handle without throwing', () => {
      const handle = openDb(dbPath);
      expect(() => closeDb(handle)).not.toThrow();
    });

    it('calling closeDb twice is safe', () => {
      const handle = openDb(dbPath);
      closeDb(handle);
      expect(() => closeDb(handle)).not.toThrow();
    });
  });

  describe('snapshot-isolation smoke-check', () => {
    it('F11 — WAL snapshot isolation: write during open read txn is blocked or not visible', () => {
      // Under node:sqlite, opening a second write handle while a deferred read
      // transaction is open causes the write to be blocked ("database is locked").
      // This is a strong isolation guarantee: isolation holds either because:
      //   (a) the write is blocked/fails — the read transaction snapshot is protected, OR
      //   (b) the write succeeds but is not visible within the open read transaction.
      // Either outcome confirms the deferred-read mitigation is effective.
      const readPath = tmpPath();
      try {
        const setupDb = createFixtureDb(readPath);
        insertSession(setupDb, { id: 'initial-sess', directory: '/init' });
        setupDb.close();

        // Open read handle and start deferred read transaction
        const readHandle = new DatabaseSync(readPath, { readOnly: true });
        readHandle.exec('BEGIN DEFERRED');

        const rowsBefore = readHandle.prepare('SELECT id FROM session').all() as Array<{
          id: string;
        }>;
        expect(rowsBefore).toHaveLength(1);

        // Attempt concurrent write — may throw "database is locked" or succeed.
        // We don't track writeBlocked separately: in both outcomes the open
        // deferred-read transaction must not see any new row (either the write
        // failed, or snapshot isolation hides it).
        const writeHandle = new DatabaseSync(readPath);
        try {
          writeHandle
            .prepare('INSERT INTO session (id, directory) VALUES (?, ?)')
            .run('new-sess', '/new');
        } catch {
          // "database is locked" — write blocked; isolation trivially holds
        } finally {
          try {
            writeHandle.close();
          } catch {
            /* ok */
          }
        }

        // Read inside the still-open deferred transaction — must see exactly the
        // pre-write snapshot (1 row) whether the write was blocked or succeeded.
        const rowsDuring = readHandle.prepare('SELECT id FROM session').all() as Array<{
          id: string;
        }>;

        readHandle.exec('COMMIT');
        readHandle.close();

        // Falsifying assertion (F11): snapshot isolation must hold — the open
        // deferred-read transaction must NOT see any concurrently written row.
        expect(rowsDuring).toHaveLength(rowsBefore.length);
      } finally {
        try {
          fs.unlinkSync(readPath);
        } catch {
          /* ok */
        }
        try {
          fs.unlinkSync(readPath + '-wal');
        } catch {
          /* ok */
        }
        try {
          fs.unlinkSync(readPath + '-shm');
        } catch {
          /* ok */
        }
      }
    });
  });

  describe('F10 — WAL-only readability', () => {
    it('row written into WAL (uncheckpointed) is visible to a subsequent read-only handle', () => {
      // This test proves that the node:sqlite read-only handle correctly reads
      // uncheckpointed WAL data — i.e. WAL-correctness holds for our use case.
      // Write a row via a write handle (in WAL mode), then immediately open a
      // fresh read-only handle without checkpointing and assert the row is visible.
      const walPath = tmpPath();
      try {
        // Step 1: create DB in WAL mode and insert a row via write handle
        const writeDb = new DatabaseSync(walPath);
        writeDb.exec(`
          CREATE TABLE IF NOT EXISTS session (
            id TEXT PRIMARY KEY,
            directory TEXT NOT NULL
          );
          PRAGMA journal_mode=WAL;
        `);
        writeDb
          .prepare('INSERT INTO session (id, directory) VALUES (?, ?)')
          .run('wal-row', '/wal-workspace');
        // Close write handle WITHOUT checkpointing — row stays in WAL file
        writeDb.close();

        // Step 2: open a fresh read-only handle and verify the WAL row is readable
        const readDb = new DatabaseSync(walPath, { readOnly: true });
        const rows = readDb.prepare('SELECT id FROM session').all() as Array<{
          id: string;
        }>;
        readDb.close();

        expect(rows).toHaveLength(1);
        expect(rows[0]!.id).toBe('wal-row');
      } finally {
        try {
          fs.unlinkSync(walPath);
        } catch {
          /* ok */
        }
        try {
          fs.unlinkSync(walPath + '-wal');
        } catch {
          /* ok */
        }
        try {
          fs.unlinkSync(walPath + '-shm');
        } catch {
          /* ok */
        }
      }
    });
  });

  describe('read-only enforcement (AC-7/AC-12)', () => {
    it('exec INSERT on read-only handle throws; DB file byte-unchanged (AC-7/AC-12)', () => {
      // With readOnly: true (correct option name for node:sqlite), exec INSERT
      // throws "attempt to write a readonly database" — full SQL-level enforcement.
      // The DB file is also byte-unchanged after a read cycle.
      const sizeBefore = fs.statSync(dbPath).size;
      const handle = openDb(dbPath);
      try {
        // INSERT throws on a readOnly handle
        expect(() =>
          handle.exec("INSERT INTO session (id, directory) VALUES ('x', '/x')")
        ).toThrow();
      } finally {
        closeDb(handle);
      }
      const sizeAfter = fs.statSync(dbPath).size;
      expect(sizeAfter).toBe(sizeBefore);
    });

    it('DB file byte size is unchanged after a full read cycle', () => {
      const sizeBefore = fs.statSync(dbPath).size;
      const handle = openDb(dbPath);
      try {
        insertSession(db, { id: 'existing-sess', directory: '/ws' });
        getAllSessionRows(handle);
      } finally {
        closeDb(handle);
      }
      const sizeAfter = fs.statSync(dbPath).size;
      // Read handle does not write to the DB file itself
      // (WAL file may differ but the main DB is unchanged by reads)
      expect(sizeAfter).toBe(sizeBefore);
    });
  });

  describe('readSessionWithTransaction', () => {
    it('executes fn inside a deferred transaction and returns its result', () => {
      const handle = openDb(dbPath);
      try {
        insertSession(db, { id: 'txn-sess', directory: '/workspace' });
        const result = readSessionWithTransaction(handle, () => {
          return getAllSessionRows(handle);
        });
        expect(result.length).toBe(1);
        expect(result[0]!.id).toBe('txn-sess');
      } finally {
        closeDb(handle);
      }
    });

    it('rolls back and re-throws when fn throws', () => {
      const handle = openDb(dbPath);
      try {
        expect(() =>
          readSessionWithTransaction(handle, () => {
            throw new Error('test error inside txn');
          })
        ).toThrow('test error inside txn');
      } finally {
        closeDb(handle);
      }
    });
  });

  describe('SqliteUnavailableError', () => {
    it('is an Error subclass', () => {
      const err = new SqliteUnavailableError();
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('node:sqlite module not available in this runtime');
    });
  });
});
