import type { TextStatsConfig, TokenizerModel } from '../../types';
import type { MetricsResult } from './formatter';
import { countCharacters } from './metrics/characters';
import { countWords } from './metrics/words';
import { countParagraphs } from './metrics/paragraphs';
import { calculateReadingTime } from './metrics/readingTime';
import { formatSize } from './metrics/size';
import { TokenCounter } from './metrics/tokens';
import { DEBOUNCE_MS } from './constants';

export class TextStatsController {
  private readonly tokenCounter = new TokenCounter();
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private lastTokenizerModel: TokenizerModel | undefined;

  public async computeMetrics(
    text: string,
    config: TextStatsConfig
  ): Promise<MetricsResult> {
    this.handleTokenizerChange(config.tokenizer);

    const chars = countCharacters(text, config.includeWhitespace);
    const words = countWords(text);
    const paragraphs = countParagraphs(text);
    const readingTime = calculateReadingTime(words, config.wpm);
    const bytes = Buffer.byteLength(text, 'utf8');
    const size = formatSize(bytes);
    const tokens = await this.safeCountTokens(text, config);

    return { chars, tokens, words, lines: 0, paragraphs, readingTime, size };
  }

  public scheduleUpdate(callback: () => void): void {
    this.clearDebounce();
    this.debounceTimer = setTimeout(callback, DEBOUNCE_MS);
  }

  public dispose(): void {
    this.clearDebounce();
  }

  private handleTokenizerChange(model: TokenizerModel): void {
    if (this.lastTokenizerModel && this.lastTokenizerModel !== model) {
      this.tokenCounter.invalidate();
    }
    this.lastTokenizerModel = model;
  }

  private async safeCountTokens(
    text: string,
    config: TextStatsConfig
  ): Promise<number | null> {
    if (text.length > config.tokenSizeLimit) {
      return null;
    }
    return this.tokenCounter.countTokens(text, config.tokenizer);
  }

  private clearDebounce(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }
}
