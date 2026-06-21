export const CONFIG_KEY = 'agentSessionsArchiving';
export const DEFAULT_ARCHIVE_PATH = '.tangyr/agent-sessions';
/**
 * The archive path used by all installs before the v2.x default change.
 * Retained for one release cycle to support the idempotent one-shot relocation
 * in reconcileArchiveLocation and the migrateValue rewrite in registerWithCore.
 * May be retired once all active installs have migrated.
 */
export const HISTORICAL_DEFAULT_ARCHIVE_PATH = 'docs/archive/agent-sessions';
export const DEFAULT_INTERVAL_MINUTES = 5;
export const COMMAND_ID_TOGGLE = 'tangyr.toggleAgentSessionsArchiving';
export const COMMAND_ID_ARCHIVE_NOW = 'tangyr.archiveAgentSessionsNow';
export const WATCH_DEBOUNCE_MS = 10_000;
export const INTRODUCED_AT_VERSION_CODE = 1001003000; // 1.3.0

/**
 * H-07: Maximum byte length for a single companion file (tool-result, subagent,
 * compaction) stored in memory.  Content beyond this limit is replaced with a
 * truncated head plus an elision note.  Intentional truncation does NOT set
 * companionPartial.  Reuse this constant across all readers so the cap is
 * consistent and easy to tune in one place.
 */
export const COMPANION_FILE_BYTE_CAP = 256 * 1024; // 256 KB

/**
 * H-07: Maximum byte length for the rendered archive markdown file.  If the
 * rendered markdown exceeds this limit, writeArchiveFile writes a truncated
 * document with a clear elision banner instead.
 */
export const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * H-07: Byte budget for the compaction-summary scan head.  Only the first
 * COMPACTION_SCAN_BUDGET bytes of a compaction file are scanned for the
 * assistant text block; the rest is ignored.
 */
export const COMPACTION_SCAN_BUDGET = 512 * 1024; // 512 KB
