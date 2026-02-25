import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenCounter } from '../../../../../src/features/textStats/metrics/tokens';

// Mock js-tiktoken
vi.mock('js-tiktoken', () => {
  const mockEncode = vi.fn((text: string) => text.split(/\s+/).filter(Boolean));
  return {
    getEncoding: vi.fn(() => ({
      encode: mockEncode,
    })),
  };
});

// Mock @anthropic-ai/tokenizer
vi.mock('@anthropic-ai/tokenizer', () => ({
  countTokens: vi.fn((text: string) => text.split(/\s+/).filter(Boolean).length),
}));

describe('TokenCounter', () => {
  let counter: TokenCounter;

  beforeEach(() => {
    counter = new TokenCounter();
    vi.clearAllMocks();
  });

  it('should count tokens using o200k model', async () => {
    const count = await counter.countTokens('hello world', 'o200k');
    expect(count).toBe(2);
  });

  it('should count tokens using cl100k model', async () => {
    const count = await counter.countTokens('hello world', 'cl100k');
    expect(count).toBe(2);
  });

  it('should count tokens using claude model', async () => {
    const count = await counter.countTokens('one two three', 'claude');
    expect(count).toBe(3);
  });

  it('should return 0 for empty string', async () => {
    const count = await counter.countTokens('', 'o200k');
    expect(count).toBe(0);
  });

  it('should cache encoder and reuse it', async () => {
    const tiktoken = await import('js-tiktoken');
    await counter.countTokens('a', 'o200k');
    await counter.countTokens('b', 'o200k');
    expect(tiktoken.getEncoding).toHaveBeenCalledTimes(1);
  });

  it('should re-instantiate encoder when model changes', async () => {
    const tiktoken = await import('js-tiktoken');
    await counter.countTokens('a', 'o200k');
    await counter.countTokens('b', 'cl100k');
    expect(tiktoken.getEncoding).toHaveBeenCalledTimes(2);
  });

  it('should invalidate cache via invalidate()', async () => {
    const tiktoken = await import('js-tiktoken');
    await counter.countTokens('a', 'o200k');
    counter.invalidate();
    await counter.countTokens('b', 'o200k');
    expect(tiktoken.getEncoding).toHaveBeenCalledTimes(2);
  });

  it('should return null when tokenizer fails', async () => {
    const tiktoken = await import('js-tiktoken');
    vi.mocked(tiktoken.getEncoding).mockImplementationOnce(() => {
      throw new Error('load failed');
    });
    const freshCounter = new TokenCounter();
    const count = await freshCounter.countTokens('hello', 'o200k');
    expect(count).toBeNull();
  });
});
