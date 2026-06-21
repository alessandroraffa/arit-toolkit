import * as vscode from 'vscode';
import * as path from 'path';
import type {
  CompanionDataContext,
  SubagentEntry,
  CompactionEntry,
} from './markdown/companionDataTypes';
import type { Logger } from '../../core/logger';
import { COMPANION_FILE_BYTE_CAP } from './constants';

const decoder = new TextDecoder();

/** Elision note appended to truncated companion file content. */
const ELISION_NOTE = (name: string, totalBytes: number): string =>
  `\n… ${String(totalBytes - COMPANION_FILE_BYTE_CAP)} bytes elided, see tool-results/${name}`;

/**
 * Scan text for basenames referenced inside <persisted-output> markers.
 * Uses the same separator-agnostic logic as resolveToolResultMarkers.
 */
function collectReferencedBasenames(text: string): Set<string> {
  const set = new Set<string>();
  const re = /<persisted-output>([\s\S]*?)<\/persisted-output>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const payload = (m[1] ?? '').trim();
    const parts = payload.split(/[\\/]/).filter(Boolean);
    const basename = parts[parts.length - 1];
    if (basename) set.add(basename);
  }
  return set;
}

/**
 * Apply the byte cap to already-decoded text content.
 * Returns the text unchanged when it is within the cap.
 * Returns a truncated head + elision note when it exceeds the cap.
 * Truncation is intentional; it does NOT affect companionPartial.
 */
function applyByteCap(content: string, name: string): string {
  if (content.length <= COMPANION_FILE_BYTE_CAP) return content;
  const head = content.slice(0, COMPANION_FILE_BYTE_CAP);
  return head + ELISION_NOTE(name, content.length);
}

/**
 * Returns true when the caught error is a benign "directory/file not found"
 * condition (FileNotFound from vscode.FileSystemError, or ENOENT from Node).
 * Any other error code (NoPermissions, Unavailable, EBUSY, EACCES …) means
 * the target may exist but be transiently unreadable — those should set
 * companionPartial so the session is retried on the next cycle.
 */
function isBenignAbsent(err: unknown): boolean {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'FileNotFound' || code === 'ENOENT') {
      return true;
    }
  }
  return false;
}

async function readMetaContent(
  subagentsDirUri: vscode.Uri,
  agentId: string
): Promise<string | undefined> {
  const metaUri = vscode.Uri.joinPath(subagentsDirUri, `agent-${agentId}.meta.json`);
  try {
    const bytes = await vscode.workspace.fs.readFile(metaUri);
    return decoder.decode(bytes);
  } catch {
    return undefined;
  }
}

async function readOneSubagent(
  subagentsDirUri: vscode.Uri,
  name: string,
  logger: Logger
): Promise<SubagentEntry> {
  const agentId = name.slice('agent-'.length, -'.jsonl'.length);
  // L-01: belt-and-suspenders guard — the regex already requires at least one
  // id char, but guard here too so an empty agentId never produces a '()' heading.
  if (agentId.length === 0) {
    logger.warn(`Skipping subagent file with empty agentId: ${name}`);
    return { agentId: '', content: '', unreadable: true };
  }
  const fileUri = vscode.Uri.joinPath(subagentsDirUri, name);
  let content: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(fileUri);
    content = decoder.decode(bytes);
  } catch (err) {
    logger.warn(`Failed to read subagent file ${name}: ${String(err)}`);
    return { agentId, content: '', unreadable: true };
  }
  const metaContent = await readMetaContent(subagentsDirUri, agentId);
  return metaContent !== undefined
    ? { agentId, content, metaContent }
    : { agentId, content };
}

/**
 * Read subagent entries from a pre-partitioned listing of the subagents/ directory.
 * L-02: accepts the already-read listing so the caller reads subagents/ only once.
 */
async function readSubagentsFromListing(
  subagentsDirUri: vscode.Uri,
  listing: readonly [string, vscode.FileType][],
  logger: Logger
): Promise<SubagentEntry[]> {
  const result: SubagentEntry[] = [];
  for (const [name, fileType] of listing) {
    if (fileType !== vscode.FileType.File) {
      // Skip directories and symlinks in subagents/ for symmetry with readToolResults
      continue;
    }
    // L-01: require at least one id character after the 'agent-' prefix so
    // 'agent-.jsonl' (empty id) is excluded at the regex stage.
    if (/^agent-(?!acompact-).+\.jsonl$/.test(name)) {
      result.push(await readOneSubagent(subagentsDirUri, name, logger));
    }
  }
  return result;
}

async function readToolResults(
  companionDirUri: vscode.Uri,
  logger: Logger,
  referencedFilenames?: ReadonlySet<string>
): Promise<{ map: Map<string, string>; partial: boolean }> {
  const toolResultsDirUri = vscode.Uri.joinPath(companionDirUri, 'tool-results');
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(toolResultsDirUri);
  } catch (err) {
    if (isBenignAbsent(err)) {
      return { map: new Map(), partial: false };
    }
    logger.warn(`Failed to read tool-results directory: ${String(err)}`);
    return { map: new Map(), partial: true };
  }

  const map = new Map<string, string>();
  let partial = false;
  for (const [name, fileType] of entries) {
    if (fileType !== vscode.FileType.File) {
      // Skip directories, symlinks, and unknown entries in tool-results/
      continue;
    }
    // H-07: lazy/referenced loading — skip files not referenced by any marker
    if (referencedFilenames !== undefined) {
      const lowerName = name.toLowerCase();
      const isReferenced =
        referencedFilenames.has(name) ||
        referencedFilenames.has(lowerName) ||
        [...referencedFilenames].some((r) => r.toLowerCase() === lowerName);
      if (!isReferenced) {
        continue;
      }
    }
    const fileUri = vscode.Uri.joinPath(toolResultsDirUri, name);
    if (map.has(name)) {
      logger.warn(
        `Tool-result map key collision detected for "${name}" — duplicate entry ignored`
      );
      continue;
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      // H-07: apply per-file byte cap; truncation is intentional (no companionPartial)
      const decoded = decoder.decode(bytes);
      map.set(name, applyByteCap(decoded, name));
    } catch (err) {
      logger.warn(`Failed to read tool-result file ${name}: ${String(err)}`);
      partial = true;
    }
  }
  return { map, partial };
}

async function readOneCompactionFile(
  subagentsDirUri: vscode.Uri,
  name: string,
  logger: Logger
): Promise<CompactionEntry | undefined> {
  const fileUri = vscode.Uri.joinPath(subagentsDirUri, name);
  try {
    const bytes = await vscode.workspace.fs.readFile(fileUri);
    const content = decoder.decode(bytes);
    const stat = await vscode.workspace.fs.stat(fileUri);
    // L-04: plumb the source filename through CompactionEntry for deterministic sort
    return { content, mtime: stat.mtime, filename: name };
  } catch (err) {
    logger.warn(`Failed to read compaction file ${name}: ${String(err)}`);
    return undefined;
  }
}

/**
 * Read compaction entries from a pre-partitioned listing of the subagents/ directory.
 * L-02: accepts the already-read listing so the caller reads subagents/ only once.
 */
async function readCompactionFilesFromListing(
  subagentsDirUri: vscode.Uri,
  listing: readonly [string, vscode.FileType][],
  logger: Logger
): Promise<{ entries: CompactionEntry[]; partial: boolean }> {
  const result: CompactionEntry[] = [];
  let partial = false;
  for (const [name, fileType] of listing) {
    if (fileType !== vscode.FileType.File) {
      continue;
    }
    if (/^agent-acompact-.*\.jsonl$/.test(name)) {
      const entry = await readOneCompactionFile(subagentsDirUri, name, logger);
      if (entry !== undefined) {
        result.push(entry);
      } else {
        partial = true;
      }
    }
  }
  return { entries: result, partial };
}

export async function resolveCompanionData(
  sessionUri: vscode.Uri,
  logger: Logger,
  rawSessionContent?: string
): Promise<CompanionDataContext> {
  const sessionId = path.parse(sessionUri.fsPath).name;
  // H-12: use vscode.Uri.file(path.join(...)) to match toSessionFile's construction
  // exactly — Uri.joinPath has UNC-root edge cases on Windows that path.join avoids.
  const companionDirUri = vscode.Uri.file(
    path.join(path.dirname(sessionUri.fsPath), sessionId)
  );

  try {
    await vscode.workspace.fs.readDirectory(companionDirUri);
  } catch (err) {
    if (!isBenignAbsent(err)) {
      logger.warn(`Failed to read companion directory: ${String(err)}`);
    }
    return { subagentEntries: [], toolResultMap: new Map(), compactionEntries: [] };
  }

  // L-02: read subagents/ directory ONCE and partition into the subagent set
  // and the compaction set, so we halve the readDirectory cost per session.
  // A missing subagents/ degrades both consistently (a single failed read leaves
  // both collections empty without setting companionPartial — benign absence).
  const subagentsDirUri = vscode.Uri.joinPath(companionDirUri, 'subagents');
  let subagentsListing: [string, vscode.FileType][];
  try {
    subagentsListing = await vscode.workspace.fs.readDirectory(subagentsDirUri);
  } catch (err) {
    // L-06/WT-004: a missing subagents/ is benign — both collections are empty
    // and companionPartial is NOT set (this is not a transient failure).
    if (!isBenignAbsent(err)) {
      logger.warn(`Failed to read subagents directory: ${String(err)}`);
    }
    subagentsListing = [];
  }

  // H-07: read subagents first so we can scan their content for marker references
  // alongside the main session content when building the referenced-filename set.
  const subagentEntries = await readSubagentsFromListing(
    subagentsDirUri,
    subagentsListing,
    logger
  );

  // Build the referenced-filename set from main content + subagent contents
  const referencedFilenames = new Set<string>();
  if (rawSessionContent !== undefined) {
    for (const name of collectReferencedBasenames(rawSessionContent)) {
      referencedFilenames.add(name);
    }
  }
  for (const entry of subagentEntries) {
    if (entry.content) {
      for (const name of collectReferencedBasenames(entry.content)) {
        referencedFilenames.add(name);
      }
    }
  }
  // When no raw content provided (e.g. tests that don't pass it), read all files
  const lazySet = rawSessionContent !== undefined ? referencedFilenames : undefined;

  const { map: toolResultMap, partial: toolResultPartial } = await readToolResults(
    companionDirUri,
    logger,
    lazySet
  );
  // L-02: use the same subagentsListing for compaction (already read above)
  const { entries: compactionEntries, partial: compactionPartial } =
    await readCompactionFilesFromListing(subagentsDirUri, subagentsListing, logger);

  const hasUnreadable = subagentEntries.some((e) => e.unreadable === true);
  const companionPartial = hasUnreadable || toolResultPartial || compactionPartial;

  logger.debug(
    `Companion data resolved: ${String(subagentEntries.length)} subagent(s), ` +
      `${String(toolResultMap.size)} tool-result(s), ` +
      `${String(compactionEntries.length)} compaction(s)` +
      (companionPartial ? ' [partial]' : '')
  );

  if (companionPartial) {
    return { subagentEntries, toolResultMap, compactionEntries, companionPartial: true };
  }
  return { subagentEntries, toolResultMap, compactionEntries };
}
