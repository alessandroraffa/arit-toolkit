import type {
  SessionParser,
  NormalizedSession,
  NormalizedTurn,
  ToolCall,
} from '../types';

interface ContinueMessage {
  role: string;
  content: string;
}

interface ContextItem {
  name?: string;
  description?: string;
  uri?: { value?: string };
}

interface ContinueStep {
  name: string;
  params?: Record<string, unknown>;
  output?: string;
}

interface ContinueSessionData {
  history?: ContinueMessage[];
  context?: ContextItem[];
  steps?: ContinueStep[];
}

interface ParseContext {
  turns: NormalizedTurn[];
  contextFiles: string[];
  consumedSteps: boolean;
  steps: ContinueStep[] | undefined;
}

function makeToolCall(step: ContinueStep): ToolCall {
  const tc: ToolCall = { name: step.name };
  const input = step.params ? JSON.stringify(step.params, null, 2) : '';
  if (input && step.output) {
    return { ...tc, input, output: step.output };
  }
  if (input) {
    return { ...tc, input };
  }
  if (step.output) {
    return { ...tc, output: step.output };
  }
  return tc;
}

export class ContinueParser implements SessionParser {
  public readonly providerName = 'continue';

  public parse(content: string, sessionId: string): NormalizedSession {
    let data: ContinueSessionData;
    try {
      data = JSON.parse(content) as ContinueSessionData;
    } catch {
      return this.emptySession(sessionId);
    }

    const turns = this.processHistory(data);
    return {
      providerName: 'continue',
      providerDisplayName: 'Continue',
      sessionId,
      turns,
    };
  }

  private processHistory(data: ContinueSessionData): NormalizedTurn[] {
    const ctx: ParseContext = {
      turns: [],
      contextFiles: this.extractContextFiles(data.context),
      consumedSteps: false,
      steps: data.steps,
    };
    for (const msg of data.history ?? []) {
      this.processMessage(msg, ctx);
    }
    return ctx.turns;
  }

  private processMessage(msg: ContinueMessage, ctx: ParseContext): void {
    const role: 'user' | 'assistant' = msg.role === 'user' ? 'user' : 'assistant';
    const toolCalls = this.extractToolCalls(role, ctx);
    if (!msg.content) return;
    ctx.turns.push({
      role,
      content: msg.content,
      toolCalls,
      filesRead: role === 'user' ? ctx.contextFiles : [],
      filesModified: [],
    });
    if (role === 'user') ctx.contextFiles = [];
  }

  private extractToolCalls(role: 'user' | 'assistant', ctx: ParseContext): ToolCall[] {
    if (role !== 'assistant' || ctx.consumedSteps || !ctx.steps) return [];
    ctx.consumedSteps = true;
    return ctx.steps.map(makeToolCall);
  }

  private extractContextFiles(context: ContextItem[] | undefined): string[] {
    if (!context) {
      return [];
    }
    return context
      .map((item) => item.uri?.value ?? item.name ?? '')
      .filter((name) => name.length > 0);
  }

  private emptySession(sessionId: string): NormalizedSession {
    return {
      providerName: 'continue',
      providerDisplayName: 'Continue',
      sessionId,
      turns: [],
    };
  }
}
