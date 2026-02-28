import { describe, it, expect } from 'vitest';
import { extractFromToolSpecificData } from '../../../../../../src/features/agentSessionsArchiving/markdown/parsers/toolSpecificDataExtractor';

describe('extractFromToolSpecificData', () => {
  it('returns undefined for null/undefined input', () => {
    expect(extractFromToolSpecificData(null)).toBeUndefined();
    expect(extractFromToolSpecificData(undefined)).toBeUndefined();
  });

  it('returns undefined for non-object input', () => {
    expect(extractFromToolSpecificData('string')).toBeUndefined();
    expect(extractFromToolSpecificData(42)).toBeUndefined();
  });

  it('returns undefined for unknown kind', () => {
    expect(extractFromToolSpecificData({ kind: 'unknown' })).toBeUndefined();
  });

  it('extracts terminal command and output', () => {
    const result = extractFromToolSpecificData({
      kind: 'terminal',
      commandLine: { original: 'ls -la' },
      terminalCommandOutput: { text: 'output text' },
    });
    expect(result).toEqual({ input: 'ls -la', output: 'output text' });
  });

  it('returns empty object for terminal without data', () => {
    const result = extractFromToolSpecificData({ kind: 'terminal' });
    expect(result).toEqual({});
  });

  it('extracts rawInput from MCP input kind', () => {
    const result = extractFromToolSpecificData({
      kind: 'input',
      rawInput: '{"url":"x"}',
    });
    expect(result).toEqual({ output: '{"url":"x"}' });
  });

  it('returns empty object for input kind without rawInput', () => {
    const result = extractFromToolSpecificData({ kind: 'input' });
    expect(result).toEqual({});
  });

  it('extracts prompt from subagent kind', () => {
    const result = extractFromToolSpecificData({ kind: 'subagent', prompt: 'search X' });
    expect(result).toEqual({ output: 'search X' });
  });

  it('returns empty object for subagent kind without prompt', () => {
    const result = extractFromToolSpecificData({ kind: 'subagent' });
    expect(result).toEqual({});
  });
});
