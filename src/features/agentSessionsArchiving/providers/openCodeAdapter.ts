/**
 * OpenCode node:sqlite read-only adapter.
 *
 * Two-tier failure taxonomy:
 *   Tier 1 — node:sqlite module absent (older runtime): feature-detected at
 *             module load; sqliteAvailable = false; provider emits one deduped
 *             informational notification and contributes zero sessions.
 *   Tier 2 — store present but unopenable (corrupt/permission/locked): caught
 *             per-store by caller; per-store warn logged; zero sessions for that
 *             store.
 *
 * Schema-discovery findings (increment-1, Task 1.3):
 *   - Compaction: session-level summary_x / time_compacting only; no per-event
 *     compaction message/part found in available v1.17.9 store. compactionSummaries
 *     will be empty in the parser.
 *   - Windows store path: TBV (%USERPROFILE%\.local\share\opencode vs %LOCALAPPDATA%).
 *     Degrades safely to absent-store no-op when resolved path does not exist.
 *   - Snapshot isolation: confirmed under Node 22.22 — concurrent writes blocked
 *     ("database is locked") while a deferred read transaction is open.
 *   - Extension-host node:sqlite: available under Node 22.22 (sqliteAvailable = true).
 *     VS Code extension host on Node < 22 would set false, triggering Tier-1.
 *   - readOnly: true option does NOT enforce SQL-level read-only on exec — writes go
 *     to an in-memory overlay, leaving the DB file byte-unchanged (AC-7 satisfied).
 */

import type { DatabaseSync } from 'node:sqlite';

type DbHandle = DatabaseSync;

interface NodeSqliteModule {
  DatabaseSync: typeof DatabaseSync;
}

// Feature-detect node:sqlite at module load. require() is the only way to
// conditionally load a built-in in a CJS bundle without failing at parse time
// on runtimes that lack the module.
const nodeSqlite = ((): NodeSqliteModule | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node:sqlite') as NodeSqliteModule;
  } catch {
    return null;
  }
})();

export const sqliteAvailable: boolean = nodeSqlite !== null;

export class SqliteUnavailableError extends Error {
  constructor() {
    super('node:sqlite module not available in this runtime');
    this.name = 'SqliteUnavailableError';
  }
}

export interface SessionRow {
  id: string;
  parent_id: string | null;
  directory: string;
  title: string | null;
  agent: string | null;
  time_created: number | null;
  time_updated: number | null;
  summary_additions: number | null;
  summary_deletions: number | null;
  summary_files: number | null;
  summary_diffs: string | null;
  time_compacting: number | null;
}

export interface MessageRow {
  id: string;
  session_id: string | null;
  time_created: number | null;
  data: string | null;
}

export interface PartRow {
  id: string;
  message_id: string | null;
  session_id: string | null;
  time_created: number | null;
  data: string | null;
}

/**
 * Open a DB at path read-only. Throws SqliteUnavailableError when
 * node:sqlite is absent; throws constructor error for missing/unreadable paths.
 */
export function openDb(filePath: string): DbHandle {
  if (!nodeSqlite) {
    throw new SqliteUnavailableError();
  }
  return new nodeSqlite.DatabaseSync(filePath, { readOnly: true });
}

/** Close the DB handle safely; calling twice is safe. */
export function closeDb(db: DbHandle): void {
  try {
    db.close();
  } catch {
    // already closed or never opened
  }
}

/**
 * Return all session rows (no directory filter — real-path workspace
 * resolution is the provider's responsibility, not SQL's).
 * Returns [] on any error.
 */
export function getAllSessionRows(db: DbHandle): SessionRow[] {
  try {
    return db
      .prepare(
        `SELECT id, parent_id, directory, title, agent,
          time_created, time_updated, summary_additions, summary_deletions,
          summary_files, summary_diffs, time_compacting
         FROM session`
      )
      .all() as unknown as SessionRow[];
  } catch {
    return [];
  }
}

/**
 * Execute fn inside a deferred read transaction for snapshot consistency.
 * Rolls back and re-throws on any fn error.
 */
export function readSessionWithTransaction<T>(db: DbHandle, fn: () => T): T {
  db.exec('BEGIN DEFERRED');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    throw err;
  }
}

/** Return messages for a session ordered by (time_created, id) ASC. */
export function getMessagesForSession(db: DbHandle, sessionId: string): MessageRow[] {
  return db
    .prepare(
      `SELECT id, session_id, time_created, data
       FROM message WHERE session_id = ?
       ORDER BY time_created ASC, id ASC`
    )
    .all(sessionId) as unknown as MessageRow[];
}

/** Return parts for a message ordered by (time_created, id) ASC. */
export function getPartsForMessage(db: DbHandle, messageId: string): PartRow[] {
  return db
    .prepare(
      `SELECT id, message_id, session_id, time_created, data
       FROM part WHERE message_id = ?
       ORDER BY time_created ASC, id ASC`
    )
    .all(messageId) as unknown as PartRow[];
}

interface Section3Part {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

interface Section3Message {
  id: string;
  role: string;
  timeCreated: number;
  parts: Section3Part[];
}

interface Section3SubagentSession {
  id: string;
  agent: string | null;
  title: string | null;
  parentId: string | null;
}

interface Section3Subagent {
  session: Section3SubagentSession;
  messages: Section3Message[];
}

interface Section3Document {
  schemaVersion: 1;
  session: {
    id: string;
    directory: string;
    title: string | null;
    agent: string | null;
    parentId: string | null;
    timeCreated: number;
    timeUpdated: number;
    timeCompacting: number | null;
    summary: {
      additions: number;
      deletions: number;
      files: number;
      diffs: string;
    };
  };
  messages: Section3Message[];
  subagents: Section3Subagent[];
}

function buildMessage(db: DbHandle, msgRow: MessageRow): Section3Message {
  let role = 'user';
  try {
    const parsed = JSON.parse(msgRow.data ?? '{}') as Record<string, unknown>;
    if (typeof parsed.role === 'string') {
      role = parsed.role;
    }
  } catch {
    // use default role
  }
  const partRows = getPartsForMessage(db, msgRow.id);
  const parts: Section3Part[] = partRows.map((p) => {
    let partData: Record<string, unknown> = {};
    try {
      partData = JSON.parse(p.data ?? '{}') as Record<string, unknown>;
    } catch {
      // use empty
    }
    const type = typeof partData.type === 'string' ? partData.type : 'unknown';
    return { id: p.id, type, data: partData };
  });
  return { id: msgRow.id, role, timeCreated: msgRow.time_created ?? 0, parts };
}

/**
 * Materialize the PLAN-005 §3 JSON document for a session.
 *
 * Called inside a readSessionWithTransaction in findSessions. Performs only
 * reads; all DB reads occur while the handle is open within one consistent
 * snapshot. Returns JSON.stringify of the §3 document.
 *
 * Subagent JSDoc: queries child sessions via SELECT … WHERE parent_id = ?,
 * assembles their messages/parts the same way as the parent session.
 */
export function materializeSession(
  db: DbHandle,
  row: SessionRow,
  messages: MessageRow[]
): string {
  const builtMessages: Section3Message[] = messages.map((m) => buildMessage(db, m));

  // Query child sessions (subagents)
  const childRows = db
    .prepare(
      `SELECT id, parent_id, directory, title, agent,
        time_created, time_updated, time_compacting
       FROM session WHERE parent_id = ?`
    )
    .all(row.id) as unknown as SessionRow[];

  const subagents: Section3Subagent[] = childRows.map((child) => {
    const childMsgs = getMessagesForSession(db, child.id);
    const childBuilt = childMsgs.map((m) => buildMessage(db, m));
    return {
      session: {
        id: child.id,
        agent: child.agent,
        title: child.title,
        parentId: child.parent_id,
      },
      messages: childBuilt,
    };
  });

  const doc: Section3Document = {
    schemaVersion: 1,
    session: {
      id: row.id,
      directory: row.directory,
      title: row.title,
      agent: row.agent,
      parentId: row.parent_id,
      timeCreated: row.time_created ?? 0,
      timeUpdated: row.time_updated ?? 0,
      timeCompacting: row.time_compacting ?? null,
      summary: {
        additions: row.summary_additions ?? 0,
        deletions: row.summary_deletions ?? 0,
        files: row.summary_files ?? 0,
        diffs: row.summary_diffs ?? '',
      },
    },
    messages: builtMessages,
    subagents,
  };

  return JSON.stringify(doc);
}
