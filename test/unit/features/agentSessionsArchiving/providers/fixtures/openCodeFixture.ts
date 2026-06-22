import { DatabaseSync } from 'node:sqlite';
import * as crypto from 'crypto';

export interface SessionRow {
  id: string;
  project_id: string | null;
  parent_id: string | null;
  directory: string;
  title: string | null;
  agent: string | null;
  model: string | null;
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

const DDL = `
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  parent_id TEXT,
  directory TEXT NOT NULL,
  title TEXT,
  agent TEXT,
  model TEXT,
  time_created INTEGER,
  time_updated INTEGER,
  summary_additions INTEGER,
  summary_deletions INTEGER,
  summary_files INTEGER,
  summary_diffs TEXT,
  time_compacting INTEGER
);
CREATE TABLE IF NOT EXISTS message (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  time_created INTEGER,
  data TEXT
);
CREATE TABLE IF NOT EXISTS part (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  session_id TEXT,
  time_created INTEGER,
  data TEXT
);
`;

export function createFixtureDb(filePath: string): DatabaseSync {
  const db = new DatabaseSync(filePath);
  db.exec(DDL);
  return db;
}

export function insertSession(db: DatabaseSync, row: Partial<SessionRow> = {}): void {
  const id = row.id ?? crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO session (id, project_id, parent_id, directory, title, agent, model,
      time_created, time_updated, summary_additions, summary_deletions,
      summary_files, summary_diffs, time_compacting)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    row.project_id ?? null,
    row.parent_id ?? null,
    row.directory ?? '/workspace',
    row.title ?? null,
    row.agent ?? null,
    row.model ?? null,
    row.time_created ?? now,
    row.time_updated ?? now,
    row.summary_additions ?? null,
    row.summary_deletions ?? null,
    row.summary_files ?? null,
    row.summary_diffs ?? null,
    row.time_compacting ?? null
  );
}

export function insertMessage(db: DatabaseSync, row: Partial<MessageRow> = {}): void {
  const id = row.id ?? crypto.randomUUID();
  db.prepare(
    `INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)`
  ).run(id, row.session_id ?? null, row.time_created ?? Date.now(), row.data ?? null);
}

export function insertPart(db: DatabaseSync, row: Partial<PartRow> = {}): void {
  const id = row.id ?? crypto.randomUUID();
  db.prepare(
    `INSERT INTO part (id, message_id, session_id, time_created, data) VALUES (?, ?, ?, ?, ?)`
  ).run(
    id,
    row.message_id ?? null,
    row.session_id ?? null,
    row.time_created ?? Date.now(),
    row.data ?? null
  );
}
