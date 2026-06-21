export interface SubagentEntry {
  readonly agentId: string;
  readonly content: string;
  readonly metaContent?: string;
  readonly unreadable?: true;
}

export interface CompactionEntry {
  readonly content: string;
  readonly mtime: number;
  /** L-04: source filename for deterministic secondary sort tiebreaker. */
  readonly filename?: string;
}

export interface CompanionDataContext {
  readonly subagentEntries: readonly SubagentEntry[];
  readonly toolResultMap: ReadonlyMap<string, string>;
  readonly compactionEntries: readonly CompactionEntry[];
  /**
   * True when at least one subagent file was unreadable during the resolve
   * pass. An archive produced with a partial companion dataset must not lock
   * in the session's effectiveMtime so the next cycle retries it.
   */
  readonly companionPartial?: true;
}
