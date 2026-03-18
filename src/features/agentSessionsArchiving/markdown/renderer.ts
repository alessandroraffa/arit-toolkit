import type { NormalizedSession, NormalizedTurn, ToolCall } from './types';
import { renderCompactionSummaries, renderSubagentSections } from './rendererSubagent';

export function renderSessionToMarkdown(session: NormalizedSession): string {
  const lines: string[] = [];

  lines.push(`# ${session.providerDisplayName} Session`);
  lines.push('');
  lines.push(`**Provider:** ${session.providerDisplayName}`);
  lines.push(`**Session ID:** ${session.sessionId}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  const hasSubagents =
    session.subagentSessions !== undefined && session.subagentSessions.length > 0;

  for (const turn of session.turns) {
    if (isEmptyTurn(turn)) {
      continue;
    }
    lines.push(...renderTurnLines(turn, hasSubagents));
  }

  if (session.subagentSessions && session.subagentSessions.length > 0) {
    const sorted = [...session.subagentSessions].sort((a, b) => {
      const aTs = a.turns[0]?.timestamp ?? '';
      const bTs = b.turns[0]?.timestamp ?? '';
      return aTs.localeCompare(bTs);
    });
    lines.push(...renderSubagentSections(sorted));
  }
  if (session.compactionSummaries && session.compactionSummaries.length > 0) {
    lines.push(...renderCompactionSummaries(session.compactionSummaries));
  }

  return lines.join('\n');
}

function isEmptyTurn(turn: NormalizedTurn): boolean {
  return (
    !turn.content.trim() &&
    turn.toolCalls.length === 0 &&
    !turn.thinking &&
    turn.filesRead.length === 0 &&
    turn.filesModified.length === 0
  );
}

export function renderTurnLines(
  turn: NormalizedTurn,
  suppressAgentOutput = false
): string[] {
  const agentLabel =
    turn.role !== 'user' && turn.agentName ? `Agent(${turn.agentName})` : 'Agent';
  const roleLabel = turn.role === 'user' ? 'User' : agentLabel;
  const timestampSuffix = turn.timestamp ? ` — ${formatTimestamp(turn.timestamp)}` : '';
  const lines: string[] = [];

  if (turn.content) {
    lines.push(`**${roleLabel}:**${timestampSuffix} ${turn.content}`, '');
  } else {
    lines.push(`**${roleLabel}:**${timestampSuffix}`, '');
  }

  const toolCallsToRender: readonly ToolCall[] = suppressAgentOutput
    ? turn.toolCalls.map((tc): ToolCall => {
        if (tc.name === 'Agent' && tc.output) {
          return tc.input !== undefined
            ? { name: tc.name, input: tc.input, output: 'See Subagent section below.' }
            : { name: tc.name, output: 'See Subagent section below.' };
        }
        return tc;
      })
    : turn.toolCalls;

  lines.push(...renderSkillAnnotation(turn.skillName));
  lines.push(...renderToolsSection(toolCallsToRender));
  lines.push(...renderThinkingSection(turn.thinking));
  lines.push(...renderFileList('Files Read', turn.filesRead));
  lines.push(...renderFileList('Files Modified', turn.filesModified));
  lines.push('---', '');

  return lines;
}

function renderToolsSection(toolCalls: readonly ToolCall[]): string[] {
  if (toolCalls.length === 0) return [];
  const lines = ['### Tools Called', ''];
  for (const tool of toolCalls) {
    lines.push(...renderToolCall(tool));
  }
  return lines;
}

function renderThinkingSection(thinking: string | undefined): string[] {
  if (!thinking) return [];
  return [
    '<details>',
    '<summary>Reasoning</summary>',
    '',
    thinking,
    '',
    '</details>',
    '',
  ];
}

function renderFileList(title: string, files: readonly string[]): string[] {
  if (files.length === 0) return [];
  const lines = [`### ${title}`, ''];
  for (const f of files) {
    lines.push(`- \`${f}\``);
  }
  lines.push('');
  return lines;
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const year = String(d.getUTCFullYear());
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function renderSkillAnnotation(skillName: string | undefined): string[] {
  if (!skillName) return [];
  return [`> **Skill:** ${skillName}`, ''];
}

function renderCodeBlock(text: string, indent: string): string[] {
  return [
    `${indent}\`\`\``,
    `${indent}${text.split('\n').join(`\n${indent}`)}`,
    `${indent}\`\`\``,
  ];
}

function renderOutputDetails(output: string): string[] {
  return [
    '',
    '  <details>',
    '  <summary>Output</summary>',
    '',
    ...renderCodeBlock(output, '  '),
    '',
    '  </details>',
  ];
}

function renderToolCall(tool: ToolCall): string[] {
  const lines: string[] = [`- **${tool.name}**`];
  if (tool.input) {
    lines.push('', ...renderCodeBlock(tool.input, '  '));
  }
  if (tool.output) {
    lines.push(...renderOutputDetails(tool.output));
  }
  lines.push('');
  return lines;
}
