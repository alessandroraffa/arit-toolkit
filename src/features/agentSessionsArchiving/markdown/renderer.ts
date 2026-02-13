import type { NormalizedSession, NormalizedTurn, ToolCall } from './types';

export function renderSessionToMarkdown(session: NormalizedSession): string {
  const lines: string[] = [];

  lines.push(`# ${session.providerDisplayName} Session`);
  lines.push('');
  lines.push(`**Provider:** ${session.providerDisplayName}`);
  lines.push(`**Session ID:** ${session.sessionId}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const [index, turn] of session.turns.entries()) {
    lines.push(...renderTurn(turn, index + 1));
  }

  return lines.join('\n');
}

function renderTurn(turn: NormalizedTurn, turnNumber: number): string[] {
  const roleLabel = turn.role === 'user' ? 'User' : 'Assistant';
  const lines: string[] = [`## Turn ${String(turnNumber)} (${roleLabel})`, ''];

  if (turn.content) lines.push(turn.content, '');
  lines.push(...renderToolsSection(turn.toolCalls));
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

function renderToolCall(tool: ToolCall): string[] {
  const lines: string[] = [];

  lines.push(`- **${tool.name}**`);
  if (tool.input) {
    lines.push('');
    lines.push('  ```');
    lines.push(`  ${tool.input.split('\n').join('\n  ')}`);
    lines.push('  ```');
  }
  lines.push('');

  return lines;
}
