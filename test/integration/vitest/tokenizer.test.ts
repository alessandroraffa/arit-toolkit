import { describe, it, expect, beforeEach } from 'vitest';
import { TokenCounter } from '../../../src/features/textStats/metrics/tokens';

/**
 * Integration tests for the tokenizer.
 * These exercise the REAL js-tiktoken library with REAL BPE ranks.
 * No mocks — if the tokenizer can't load encodings or WASM is
 * required, these tests will fail.
 */
describe('tokenizer integration', () => {
  let counter: TokenCounter;

  beforeEach(() => {
    counter = new TokenCounter();
  });

  describe('o200k model (GPT-4o)', () => {
    it('should return a positive number for non-empty text', async () => {
      const count = await counter.countTokens('hello world', 'o200k');
      expect(count).toBeTypeOf('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should return 0 for empty text', async () => {
      const count = await counter.countTokens('', 'o200k');
      expect(count).toBe(0);
    });

    it('should tokenize multi-language text', async () => {
      const count = await counter.countTokens('Hello 世界 مرحبا', 'o200k');
      expect(count).toBeTypeOf('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should tokenize code snippets', async () => {
      const code = 'function greet(name: string): string { return `Hello, ${name}!`; }';
      const count = await counter.countTokens(code, 'o200k');
      expect(count).toBeTypeOf('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should not return null (would indicate load failure)', async () => {
      const count = await counter.countTokens('test', 'o200k');
      expect(count).not.toBeNull();
    });
  });

  describe('cl100k model (GPT-4)', () => {
    it('should return a positive number for non-empty text', async () => {
      const count = await counter.countTokens('hello world', 'cl100k');
      expect(count).toBeTypeOf('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should return 0 for empty text', async () => {
      const count = await counter.countTokens('', 'cl100k');
      expect(count).toBe(0);
    });

    it('should not return null', async () => {
      const count = await counter.countTokens('test', 'cl100k');
      expect(count).not.toBeNull();
    });
  });

  describe('claude model', () => {
    it('should return a positive number for non-empty text', async () => {
      const count = await counter.countTokens('hello world', 'claude');
      expect(count).toBeTypeOf('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should return 0 for empty text', async () => {
      const count = await counter.countTokens('', 'claude');
      expect(count).toBe(0);
    });

    it('should tokenize multi-language text', async () => {
      const count = await counter.countTokens('Hello 世界 مرحبا', 'claude');
      expect(count).toBeTypeOf('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should not return null (would indicate WASM/load failure)', async () => {
      const count = await counter.countTokens('test', 'claude');
      expect(count).not.toBeNull();
    });

    it('should produce consistent counts across repeated calls', async () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const first = await counter.countTokens(text, 'claude');
      const second = await counter.countTokens(text, 'claude');
      expect(first).toBe(second);
    });
  });

  describe('model switching', () => {
    it('should switch between models without errors', async () => {
      const text = 'hello world';
      const o200k = await counter.countTokens(text, 'o200k');
      const claude = await counter.countTokens(text, 'claude');
      const cl100k = await counter.countTokens(text, 'cl100k');
      expect(o200k).toBeTypeOf('number');
      expect(claude).toBeTypeOf('number');
      expect(cl100k).toBeTypeOf('number');
    });

    it('should work after invalidation', async () => {
      await counter.countTokens('hello', 'o200k');
      counter.invalidate();
      const count = await counter.countTokens('hello', 'claude');
      expect(count).toBeTypeOf('number');
      expect(count).not.toBeNull();
    });
  });

  describe('edge cases with real tokenizer', () => {
    it('should handle very long text without crashing', async () => {
      const longText = 'word '.repeat(10000);
      const count = await counter.countTokens(longText, 'o200k');
      expect(count).toBeTypeOf('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should handle special characters', async () => {
      const special = '🎉🚀✨ <script>alert("xss")</script> \t\n\r\0';
      const count = await counter.countTokens(special, 'o200k');
      expect(count).toBeTypeOf('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should handle unicode normalization forms', async () => {
      // é as single char vs e + combining accent
      const nfc = '\u00e9';
      const nfd = '\u0065\u0301';
      const countNfc = await counter.countTokens(nfc, 'claude');
      const countNfd = await counter.countTokens(nfd, 'claude');
      expect(countNfc).toBeTypeOf('number');
      expect(countNfd).toBeTypeOf('number');
    });
  });
});
