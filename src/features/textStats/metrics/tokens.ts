import type { TokenizerModel } from '../../../types';

interface TiktokenEncoder {
  encode(text: string): number[];
}

interface TiktokenModule {
  Tiktoken: new (
    ranks: TiktokenRanks,
    special: Record<string, number>
  ) => TiktokenEncoder;
  getEncoding(encoding: string): TiktokenEncoder;
}

interface TiktokenRanks {
  bpe_ranks: string;
  special_tokens: Record<string, number>;
  pat_str: string;
}

const TIKTOKEN_ENCODING: Record<string, string> = {
  cl100k: 'cl100k_base',
  o200k: 'o200k_base',
};

export class TokenCounter {
  private cachedModel: TokenizerModel | undefined;
  private encoder: TiktokenEncoder | undefined;

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
    this.encoder = undefined;
  }

  private async encode(text: string, model: TokenizerModel): Promise<number> {
    const encoder = await this.getEncoder(model);
    return encoder.encode(text).length;
  }

  private async getEncoder(model: TokenizerModel): Promise<TiktokenEncoder> {
    if (this.encoder && this.cachedModel === model) {
      return this.encoder;
    }
    const mod = (await import('js-tiktoken')) as TiktokenModule;
    this.encoder =
      model === 'claude'
        ? await this.createClaudeEncoder(mod)
        : mod.getEncoding(TIKTOKEN_ENCODING[model] ?? 'o200k_base');
    this.cachedModel = model;
    return this.encoder;
  }

  private async createClaudeEncoder(mod: TiktokenModule): Promise<TiktokenEncoder> {
    const raw: unknown = await import('@anthropic-ai/tokenizer/dist/cjs/claude.json');
    const ranks = extractRanks(raw);
    return new mod.Tiktoken(ranks, ranks.special_tokens);
  }
}

function hasDefault(value: unknown): value is { default: unknown } {
  return typeof value === 'object' && value !== null && 'default' in value;
}

function extractRanks(raw: unknown): TiktokenRanks {
  const obj = hasDefault(raw) ? raw.default : raw;
  return obj as TiktokenRanks;
}
