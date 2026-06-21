import * as vscode from 'vscode';
import * as path from 'path';
import type {
  CompanionDataContext,
  SubagentEntry,
  CompactionEntry,
} from './markdown/companionDataTypes';
import type { Logger } from '../../core/logger';

const decoder = new TextDecoder();

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

async function readSubagents(
  companionDirUri: vscode.Uri,
  logger: Logger
): Promise<SubagentEntry[]> {
  const subagentsDirUri = vscode.Uri.joinPath(companionDirUri, 'subagents');
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(subagentsDirUri);
  } catch {
    return [];
  }

  const result: SubagentEntry[] = [];
  for (const [name] of entries) {
    if (/^agent-(?!acompact-).*\.jsonl$/.test(name)) {
      result.push(await readOneSubagent(subagentsDirUri, name, logger));
    }
  }
  return result;
}

async function readToolResults(
  companionDirUri: vscode.Uri,
  logger: Logger
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
  for (const [name] of entries) {
    const fileUri = vscode.Uri.joinPath(toolResultsDirUri, name);
    if (map.has(name)) {
      logger.warn(
        `Tool-result map key collision detected for "${name}" — duplicate entry ignored`
      );
      continue;
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      map.set(name, decoder.decode(bytes));
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
    return { content, mtime: stat.mtime };
  } catch (err) {
    logger.warn(`Failed to read compaction file ${name}: ${String(err)}`);
    return undefined;
  }
}

async function readCompactionFiles(
  companionDirUri: vscode.Uri,
  logger: Logger
): Promise<{ entries: CompactionEntry[]; partial: boolean }> {
  const subagentsDirUri = vscode.Uri.joinPath(companionDirUri, 'subagents');
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(subagentsDirUri);
  } catch {
    return { entries: [], partial: false };
  }

  const result: CompactionEntry[] = [];
  let partial = false;
  for (const [name] of entries) {
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
  logger: Logger
): Promise<CompanionDataContext> {
  const sessionId = path.parse(sessionUri.fsPath).name;
  const companionDirUri = vscode.Uri.joinPath(
    vscode.Uri.file(path.dirname(sessionUri.fsPath)),
    sessionId
  );

  try {
    await vscode.workspace.fs.readDirectory(companionDirUri);
  } catch (err) {
    if (!isBenignAbsent(err)) {
      logger.warn(`Failed to read companion directory: ${String(err)}`);
    }
    return { subagentEntries: [], toolResultMap: new Map(), compactionEntries: [] };
  }

  const subagentEntries = await readSubagents(companionDirUri, logger);
  const { map: toolResultMap, partial: toolResultPartial } = await readToolResults(
    companionDirUri,
    logger
  );
  const { entries: compactionEntries, partial: compactionPartial } =
    await readCompactionFiles(companionDirUri, logger);

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
