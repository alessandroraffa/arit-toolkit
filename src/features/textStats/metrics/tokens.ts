import type { TokenizerModel } from '../../../types';

interface TiktokenEncoder {
  encode(text: string): number[];
}

interface TiktokenModule {
  getEncoding(encoding: string): TiktokenEncoder;
}

interface ClaudeModule {
  countTokens(text: string): number;
}

const TIKTOKEN_ENCODING: Record<string, string> = {
  cl100k: 'cl100k_base',
  o200k: 'o200k_base',
};

export class TokenCounter {
  private cachedModel: TokenizerModel | undefined;
  private tiktokenEncoder: TiktokenEncoder | undefined;
  private claudeModule: ClaudeModule | undefined;

  public async countTokens(text: string, model: TokenizerModel): Promise<number | null> {
    if (text.length === 0) {
      return 0;
    }
    try {
      return await this.encode(text, model);
    } catch {
      return null;
    }
  }

  public invalidate(): void {
    this.cachedModel = undefined;
    this.tiktokenEncoder = undefined;
    this.claudeModule = undefined;
  }

  private async encode(text: string, model: TokenizerModel): Promise<number> {
    if (model === 'claude') {
      return this.encodeClaude(text);
    }
    return this.encodeTiktoken(text, model);
  }

  private async encodeClaude(text: string): Promise<number> {
    if (!this.claudeModule || this.cachedModel !== 'claude') {
      const mod = (await import('@anthropic-ai/tokenizer')) as ClaudeModule;
      this.claudeModule = mod;
      this.cachedModel = 'claude';
    }
    return this.claudeModule.countTokens(text);
  }

  private async encodeTiktoken(text: string, model: TokenizerModel): Promise<number> {
    if (!this.tiktokenEncoder || this.cachedModel !== model) {
      const mod = (await import('js-tiktoken')) as TiktokenModule;
      const encoding = TIKTOKEN_ENCODING[model] ?? 'o200k_base';
      this.tiktokenEncoder = mod.getEncoding(encoding);
      this.cachedModel = model;
    }
    return this.tiktokenEncoder.encode(text).length;
  }
}
