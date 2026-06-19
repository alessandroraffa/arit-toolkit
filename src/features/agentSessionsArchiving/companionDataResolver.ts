import * as vscode from 'vscode';
import * as path from 'path';
import type {
  CompanionDataContext,
  SubagentEntry,
  CompactionEntry,
} from './markdown/companionDataTypes';
import type { Logger } from '../../core/logger';

const decoder = new TextDecoder();

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
): Promise<Map<string, string>> {
  const toolResultsDirUri = vscode.Uri.joinPath(companionDirUri, 'tool-results');
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(toolResultsDirUri);
  } catch {
    return new Map();
  }

  const result = new Map<string, string>();
  for (const [name] of entries) {
    const fileUri = vscode.Uri.joinPath(toolResultsDirUri, name);
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      result.set(path.parse(name).name, decoder.decode(bytes));
    } catch (err) {
      logger.warn(`Failed to read tool-result file ${name}: ${String(err)}`);
    }
  }
  return result;
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
): Promise<CompactionEntry[]> {
  const subagentsDirUri = vscode.Uri.joinPath(companionDirUri, 'subagents');
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(subagentsDirUri);
  } catch {
    return [];
  }

  const result: CompactionEntry[] = [];
  for (const [name] of entries) {
    if (/^agent-acompact-.*\.jsonl$/.test(name)) {
      const entry = await readOneCompactionFile(subagentsDirUri, name, logger);
      if (entry !== undefined) {
        result.push(entry);
      }
    }
  }
  return result;
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
  } catch {
    return { subagentEntries: [], toolResultMap: new Map(), compactionEntries: [] };
  }

  const subagentEntries = await readSubagents(companionDirUri, logger);
  const toolResultMap = await readToolResults(companionDirUri, logger);
  const compactionEntries = await readCompactionFiles(companionDirUri, logger);

  logger.debug(
    `Companion data resolved: ${String(subagentEntries.length)} subagent(s), ` +
      `${String(toolResultMap.size)} tool-result(s), ` +
      `${String(compactionEntries.length)} compaction(s)`
  );

  return { subagentEntries, toolResultMap, compactionEntries };
}
