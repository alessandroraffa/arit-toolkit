import type { SessionParser } from '../types';
import { ClaudeCodeParser } from './claudeCodeParser';
import { ClineRooCodeParser } from './clineRooCodeParser';
import { CopilotChatParser } from './copilotChatParser';
import { ContinueParser } from './continueParser';

const PARSERS: readonly SessionParser[] = [
  new ClaudeCodeParser(),
  new ClineRooCodeParser('cline', 'Cline'),
  new ClineRooCodeParser('roo-code', 'Roo Code'),
  new CopilotChatParser(),
  new ContinueParser(),
];

export function getParserForProvider(providerName: string): SessionParser | undefined {
  return PARSERS.find((p) => p.providerName === providerName);
}
