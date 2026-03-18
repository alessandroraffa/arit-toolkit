export interface SubagentEntry {
  readonly agentId: string;
  readonly content: string;
  readonly metaContent?: string;
}

export interface CompactionEntry {
  readonly content: string;
  readonly mtime: number;
}

export interface CompanionDataContext {
  readonly subagentEntries: readonly SubagentEntry[];
  readonly toolResultMap: ReadonlyMap<string, string>;
  readonly compactionEntries: readonly CompactionEntry[];
}
