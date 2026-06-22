/**
 * Shared §3 document types for the OpenCode provider.
 *
 * These interfaces are produced by materializeSession (openCodeAdapter.ts) and
 * consumed by OpenCodeParser (markdown/parsers/openCodeParser.ts). Declaring
 * them once here prevents producer/consumer drift.
 */

export interface Section3Part {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface Section3Message {
  id: string;
  role: string;
  timeCreated: number;
  parts: Section3Part[];
}

export interface Section3SubagentSession {
  id: string;
  agent: string | null;
  title: string | null;
  parentId: string | null;
}

export interface Section3Subagent {
  session: Section3SubagentSession;
  messages: Section3Message[];
}

export interface Section3Document {
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
