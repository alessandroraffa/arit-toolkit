import { describe, it, expect, vi } from 'vitest';
import {
  resolveToolResultMarkers,
  extractSubagentMeta,
  extractCompactionSummaryText,
  parseFirstEventAgentType,
} from '../../../../../../src/features/agentSessionsArchiving/markdown/parsers/claudeCodeParserCompanion';
import { COMPACTION_SCAN_BUDGET } from '../../../../../../src/features/agentSessionsArchiving/constants';

describe('resolveToolResultMarkers', () => {
  it('replaces marker with full filename key from map', () => {
    const result = resolveToolResultMarkers(
      'before <persisted-output>/path/to/toolu_abc.txt</persisted-output> after',
      new Map([['toolu_abc.txt', 'resolved content']])
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

  it('resolves same-stem-different-extension markers to correct content', () => {
    const content =
      '<persisted-output>/path/toolu_abc.txt</persisted-output> and ' +
      '<persisted-output>/path/toolu_abc.json</persisted-output>';
    const map = new Map([
      ['toolu_abc.txt', 'txt content'],
      ['toolu_abc.json', 'json content'],
    ]);
    const result = resolveToolResultMarkers(content, map);
    expect(result).toBe('txt content and json content');
  });

  // H-06 tests

  it('H-06: Windows backslash path resolves against forward-slash-keyed map', () => {
    const result = resolveToolResultMarkers(
      '<persisted-output>tool-results\\abc.txt</persisted-output>',
      new Map([['abc.txt', 'backslash resolved']])
    );
    expect(result).toBe('backslash resolved');
  });

  it('H-06: case-insensitive fallback resolves uppercase marker against lowercase map key', () => {
    const result = resolveToolResultMarkers(
      '<persisted-output>ABC.txt</persisted-output>',
      new Map([['abc.txt', 'case fallback content']])
    );
    expect(result).toBe('case fallback content');
  });

  it('H-06: exact-case match takes priority over lowercase fallback', () => {
    // map has both 'ABC.txt' (exact) and 'abc.txt' (lower) — exact should win
    const result = resolveToolResultMarkers(
      '<persisted-output>ABC.txt</persisted-output>',
      new Map([
        ['ABC.txt', 'exact content'],
        ['abc.txt', 'lower content'],
      ])
    );
    expect(result).toBe('exact content');
  });

  it('H-06: same-stem-different-extension still resolves to distinct content (v2.5.1 regression)', () => {
    const content =
      '<persisted-output>/path/toolu_abc.txt</persisted-output> and ' +
      '<persisted-output>/path/toolu_abc.json</persisted-output>';
    const map = new Map([
      ['toolu_abc.txt', 'txt content'],
      ['toolu_abc.json', 'json content'],
    ]);
    const result = resolveToolResultMarkers(content, map);
    expect(result).toBe('txt content and json content');
  });

  it('H-06: empty/whitespace-only marker retains original marker and emits debug log', () => {
    const debugFn = vi.fn();
    const logger = { debug: debugFn };
    const marker = '<persisted-output>   </persisted-output>';
    const result = resolveToolResultMarkers(marker, new Map([['a.txt', 'x']]), logger);
    expect(result).toBe(marker);
    expect(debugFn).toHaveBeenCalled();
  });

  it('H-06: unknown filename retains original marker verbatim', () => {
    const result = resolveToolResultMarkers(
      '<persisted-output>unknown.txt</persisted-output>',
      new Map([['other.txt', 'content']])
    );
    expect(result).toBe('<persisted-output>unknown.txt</persisted-output>');
  });

  it('L-07: unresolved marker (key missing) emits debug log and retains marker', () => {
    const debugFn = vi.fn();
    const logger = { debug: debugFn };
    const marker = '<persisted-output>missing.txt</persisted-output>';
    const result = resolveToolResultMarkers(
      marker,
      new Map([['other.txt', 'x']]),
      logger
    );
    expect(result).toBe(marker);
    expect(debugFn).toHaveBeenCalled();
    // The debug message must mention the filename
    const calls = debugFn.mock.calls.map((c) => String(c[0]));
    expect(calls.some((m) => m.includes('missing.txt'))).toBe(true);
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

  // H-07 compaction scan budget

  it('H-07: content far larger than scan budget still returns the first assistant text block', () => {
    // Build a valid event within the first COMPACTION_SCAN_BUDGET bytes
    const event = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Summary inside budget.' }],
      },
    });
    // Append a huge tail beyond the budget — should never be scanned
    const hugeTail = '\n' + 'x'.repeat(COMPACTION_SCAN_BUDGET * 2);
    const content = event + hugeTail;

    expect(extractCompactionSummaryText(content)).toBe('Summary inside budget.');
  });

  it('H-07: returns undefined when no assistant event appears within the scan budget', () => {
    // Fill the scan budget with non-assistant content, then add an assistant event beyond it
    const userLine = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'u' }] },
    });
    // Repeat the user line until we exceed the budget
    const padding = (userLine + '\n').repeat(
      Math.ceil(COMPACTION_SCAN_BUDGET / (userLine.length + 1)) + 1
    );
    const assistantBeyondBudget = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Should not be found.' }],
      },
    });
    const content = padding + assistantBeyondBudget;

    // The assistant event is beyond the scan budget, so the result should be undefined
    expect(extractCompactionSummaryText(content)).toBeUndefined();
  });

  // H-09 string content (implemented alongside H-07 in extractCompactionSummaryText)

  it('H-09: string-form message.content returns that string as the summary', () => {
    const content = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: 'Plain string summary.',
      },
    });
    expect(extractCompactionSummaryText(content)).toBe('Plain string summary.');
  });

  it('H-09: array-of-text-blocks form still returns the first text block', () => {
    const content = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Block summary.' }],
      },
    });
    expect(extractCompactionSummaryText(content)).toBe('Block summary.');
  });

  it('H-09: event with neither string nor array content returns undefined', () => {
    const content = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: null,
      },
    });
    expect(extractCompactionSummaryText(content)).toBeUndefined();
  });
});

describe('parseFirstEventAgentType', () => {
  it('returns agentId in kebab-case when first line has agentId', () => {
    const content = JSON.stringify({ type: 'user', agentId: 'ReviewerAgent' });
    expect(parseFirstEventAgentType(content)).toBe('reviewer-agent');
  });

  it('falls back to subagentType in kebab-case when agentId is absent', () => {
    const content = JSON.stringify({ type: 'user', subagentType: 'CodeReviewer' });
    expect(parseFirstEventAgentType(content)).toBe('code-reviewer');
  });

  it('returns unknown when neither agentId nor subagentType present', () => {
    const content = JSON.stringify({ type: 'user' });
    expect(parseFirstEventAgentType(content)).toBe('unknown');
  });
});
