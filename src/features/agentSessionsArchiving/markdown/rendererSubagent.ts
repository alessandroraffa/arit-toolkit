import type { CompactionSummary, SubagentSession } from './types';
import { formatTimestamp, renderTurnLines } from './renderer';

export function renderSubagentSections(
  subagentSessions: readonly SubagentSession[]
): string[] {
  const lines: string[] = [];

  for (const session of subagentSessions) {
    lines.push('');
    lines.push(`## Subagent: ${session.agentType} (${session.agentId})`);

    if (session.unreadable === true) {
      lines.push('> ⚠ Subagent transcript could not be read.');
      lines.push('');
      continue;
    }

    if (session.description) {
      lines.push(`_${session.description}_`);
      lines.push('');
    }

    for (const turn of session.turns) {
      lines.push(...renderTurnLines(turn));
    }

    if (session.compactionSummaries && session.compactionSummaries.length > 0) {
      lines.push(...renderCompactionSummaries(session.compactionSummaries));
    }
  }

  return lines;
}

export function renderCompactionSummaries(
  summaries: readonly CompactionSummary[]
): string[] {
  const lines: string[] = [];

  for (const summary of summaries) {
    const formattedTimestamp = formatTimestamp(summary.timestamp);
    lines.push('<details>');
    lines.push(`  <summary>Compaction Summary — ${formattedTimestamp}</summary>`);
    lines.push('');
    lines.push(`  ${summary.summaryText}`);
    lines.push('</details>');
  }

  return lines;
}
