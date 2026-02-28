/**
 * Extracts input/output from Copilot toolSpecificData.
 *
 * Different tool types store data in different shapes:
 * - terminal: commandLine.original + terminalCommandOutput.text
 * - input (MCP tools): rawInput
 * - subagent: prompt
 */

interface ToolSpecificData {
  readonly kind?: string;
  readonly commandLine?: { readonly original?: string };
  readonly terminalCommandOutput?: { readonly text?: string };
  readonly rawInput?: string;
  readonly prompt?: string;
}

interface Extraction {
  readonly input?: string;
  readonly output?: string;
}

function extractTerminal(data: ToolSpecificData): Extraction {
  const result: { input?: string; output?: string } = {};
  if (data.commandLine?.original) result.input = data.commandLine.original;
  if (data.terminalCommandOutput?.text) result.output = data.terminalCommandOutput.text;
  return result;
}

function extractInput(data: ToolSpecificData): Extraction {
  if (data.rawInput) return { output: data.rawInput };
  return {};
}

function extractSubagent(data: ToolSpecificData): Extraction {
  if (data.prompt) return { output: data.prompt };
  return {};
}

export function extractFromToolSpecificData(data: unknown): Extraction | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const tsd = data as ToolSpecificData;
  switch (tsd.kind) {
    case 'terminal':
      return extractTerminal(tsd);
    case 'input':
      return extractInput(tsd);
    case 'subagent':
      return extractSubagent(tsd);
    default:
      return undefined;
  }
}
