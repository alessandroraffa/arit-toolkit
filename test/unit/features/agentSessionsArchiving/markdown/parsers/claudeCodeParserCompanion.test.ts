import { describe, it, expect } from 'vitest';
import {
  resolveToolResultMarkers,
  extractSubagentMeta,
  extractCompactionSummaryText,
  parseFirstEventAgentType,
} from '../../../../../../src/features/agentSessionsArchiving/markdown/parsers/claudeCodeParserCompanion';

describe('resolveToolResultMarkers', () => {
  it('replaces marker with matching key from map', () => {
    const result = resolveToolResultMarkers(
      'before <persisted-output>/path/to/toolu_abc.txt</persisted-output> after',
      new Map([['toolu_abc', 'resolved content']])
    );
    expect(result).toBe('before resolved content after');
  });

  it('retains marker when key is not in map', () => {
    const result = resolveToolResultMarkers(
      'before <persisted-output>/path/to/toolu_abc.txt</persisted-output> after',
      new Map()
    );
    expect(result).toContain('<persisted-output>');
  });

  it('returns content unchanged when no markers are present', () => {
    const result = resolveToolResultMarkers('no markers here', new Map([['key', 'val']]));
    expect(result).toBe('no markers here');
  });
});

describe('extractSubagentMeta', () => {
  it('returns agentType and description from valid json', () => {
    const result = extractSubagentMeta(
      '{"agentType":"CodeReview","description":"Review code"}'
    );
    expect(result.agentType).toBe('code-review');
    expect(result.description).toBe('Review code');
  });

  it('returns agentType without description when description absent', () => {
    const result = extractSubagentMeta('{"agentType":"Explore"}');
    expect(result.agentType).toBe('explore');
    expect(result.description).toBeUndefined();
  });

  it('returns unknown agentType for invalid json', () => {
    const result = extractSubagentMeta('not json');
    expect(result.agentType).toBe('unknown');
    expect(result.description).toBeUndefined();
  });

  it('returns unknown agentType when metaContent is undefined', () => {
    const result = extractSubagentMeta(undefined);
    expect(result.agentType).toBe('unknown');
    expect(result.description).toBeUndefined();
  });
});

describe('extractCompactionSummaryText', () => {
  it('returns text from first assistant text event', () => {
    const content = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'The summary text.' }],
      },
    });
    expect(extractCompactionSummaryText(content)).toBe('The summary text.');
  });

  it('returns undefined when no assistant event is present', () => {
    const content = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    });
    expect(extractCompactionSummaryText(content)).toBeUndefined();
  });
});

describe('parseFirstEventAgentType', () => {
  it('returns agentId in kebab-case when first line has agentId', () => {
    const content = JSON.stringify({ type: 'user', agentId: 'ReviewerAgent' });
    expect(parseFirstEventAgentType(content)).toBe('reviewer-agent');
  });

  it('returns unknown when neither agentId nor subagentType present', () => {
    const content = JSON.stringify({ type: 'user' });
    expect(parseFirstEventAgentType(content)).toBe('unknown');
  });
});
