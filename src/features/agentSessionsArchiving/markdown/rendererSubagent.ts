import type { CompactionSummary, SubagentSession } from './types';
import { appendLines, formatTimestamp, renderTurnLines } from './renderer';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
      appendLines(lines, renderTurnLines(turn));
    }

    if (session.compactionSummaries && session.compactionSummaries.length > 0) {
      appendLines(lines, renderCompactionSummaries(session.compactionSummaries));
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
    // H-11: indent EVERY line of a multi-line summary so the <details> block
    // renders correctly regardless of embedded newlines or markdown-significant
    // leading characters ('#', '-', '>').  escapeHtml already neutralises a
    // literal </details> in the body (BK-005 regression preserved).
    const indentedBody = escapeHtml(summary.summaryText)
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n');
    lines.push(indentedBody);
    lines.push('</details>');
  }

  return lines;
}
