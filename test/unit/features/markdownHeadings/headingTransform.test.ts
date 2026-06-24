import { describe, it, expect } from 'vitest';
import {
  splitLines,
  isAtLimit,
  transformHeadingsInScope,
} from '../../../../src/features/markdownHeadings/headingTransform';

// Helper: build a whole-document scopeLines set for a given text
function allLines(text: string): Set<number> {
  return new Set(splitLines(text).map((_, i) => i));
}

describe('transformHeadingsInScope (migrated from transformHeadings)', () => {
  describe('increment', () => {
    it('should increment all headings by one level', () => {
      const input = '# Title\n\nSome text\n\n## Section\n\n### Subsection';
      const result = transformHeadingsInScope(input, 'increment', allLines(input));
      expect(result).toEqual({
        outcome: 'changed',
        text: '## Title\n\nSome text\n\n### Section\n\n#### Subsection',
      });
    });

    it('should handle h6 headings by aborting', () => {
      // Pure all-at-limit input — rewritten in Activity 3
      const input = '###### A\n\n###### B';
      const result = transformHeadingsInScope(input, 'increment', new Set([0, 2]));
      expect(result).toEqual({
        outcome: 'no-op: all in-scope headings at the limit',
        text: input,
      });
    });

    it('should not modify headings inside fenced code blocks', () => {
      const input =
        '# Title\n\n```\n# This is a comment\n## Not a heading\n```\n\n## Section';
      const result = transformHeadingsInScope(input, 'increment', allLines(input));
      expect(result).toEqual({
        outcome: 'changed',
        text: '## Title\n\n```\n# This is a comment\n## Not a heading\n```\n\n### Section',
      });
    });

    it('should not modify headings inside fenced code blocks with language', () => {
      const input = '# Title\n\n```markdown\n# Heading in code\n```\n\n## Section';
      const result = transformHeadingsInScope(input, 'increment', allLines(input));
      expect(result).toEqual({
        outcome: 'changed',
        text: '## Title\n\n```markdown\n# Heading in code\n```\n\n### Section',
      });
    });

    it('should handle text with no headings', () => {
      const input = 'Just some text\nwithout any headings.';
      const result = transformHeadingsInScope(input, 'increment', allLines(input));
      expect(result).toEqual({
        outcome: 'no-op: no transformable heading in scope',
        text: input,
      });
    });

    it('should handle empty string', () => {
      const result = transformHeadingsInScope('', 'increment', new Set());
      expect(result).toEqual({
        outcome: 'no-op: no transformable heading in scope',
        text: '',
      });
    });

    it('should handle headings with extra spaces after hashes', () => {
      const input = '#  Title with spaces';
      const result = transformHeadingsInScope(input, 'increment', allLines(input));
      expect(result).toEqual({ outcome: 'changed', text: '##  Title with spaces' });
    });
  });

  describe('decrement', () => {
    it('should decrement all headings by one level', () => {
      const input = '## Title\n\n### Section\n\n#### Subsection';
      const result = transformHeadingsInScope(input, 'decrement', allLines(input));
      expect(result).toEqual({
        outcome: 'changed',
        text: '# Title\n\n## Section\n\n### Subsection',
      });
    });

    it('should abort when any heading is already h1', () => {
      // Pure all-at-limit input — rewritten in Activity 3
      const input = '# A\n\n# B';
      const result = transformHeadingsInScope(input, 'decrement', new Set([0, 2]));
      expect(result).toEqual({
        outcome: 'no-op: all in-scope headings at the limit',
        text: input,
      });
    });

    it('should not modify headings inside fenced code blocks', () => {
      const input = '## Title\n\n```\n# Code comment\n```\n\n### Section';
      const result = transformHeadingsInScope(input, 'decrement', allLines(input));
      expect(result).toEqual({
        outcome: 'changed',
        text: '# Title\n\n```\n# Code comment\n```\n\n## Section',
      });
    });

    it('should handle text with no headings', () => {
      const input = 'No headings here.';
      const result = transformHeadingsInScope(input, 'decrement', allLines(input));
      expect(result).toEqual({
        outcome: 'no-op: no transformable heading in scope',
        text: input,
      });
    });
  });

  describe('code block edge cases', () => {
    it('should handle nested code blocks (triple backticks)', () => {
      const input = '# Title\n\n````\n```\n# Nested\n```\n````\n\n## Section';
      const result = transformHeadingsInScope(input, 'increment', allLines(input));
      expect(result).toEqual({
        outcome: 'changed',
        text: '## Title\n\n````\n```\n# Nested\n```\n````\n\n### Section',
      });
    });

    it('should handle indented code block fences', () => {
      const input = '# Title\n\n   ```\n   # In code\n   ```\n\n## Section';
      const result = transformHeadingsInScope(input, 'increment', allLines(input));
      expect(result).toEqual({
        outcome: 'changed',
        text: '## Title\n\n   ```\n   # In code\n   ```\n\n### Section',
      });
    });

    it('should handle tilde code blocks', () => {
      const input = '# Title\n\n~~~\n# In code\n~~~\n\n## Section';
      const result = transformHeadingsInScope(input, 'increment', allLines(input));
      expect(result).toEqual({
        outcome: 'changed',
        text: '## Title\n\n~~~\n# In code\n~~~\n\n### Section',
      });
    });

    it('should handle unclosed code block (rest of text is code)', () => {
      const input = '# Title\n\n```\n# In code\n## Also code';
      const result = transformHeadingsInScope(input, 'increment', allLines(input));
      expect(result).toEqual({
        outcome: 'changed',
        text: '## Title\n\n```\n# In code\n## Also code',
      });
    });
  });

  describe('mixed levels', () => {
    it('should handle all heading levels incrementing', () => {
      const input = '# H1\n## H2\n### H3\n#### H4\n##### H5';
      const result = transformHeadingsInScope(input, 'increment', allLines(input));
      expect(result).toEqual({
        outcome: 'changed',
        text: '## H1\n### H2\n#### H3\n##### H4\n###### H5',
      });
    });

    it('should handle all heading levels decrementing', () => {
      const input = '## H2\n### H3\n#### H4\n##### H5\n###### H6';
      const result = transformHeadingsInScope(input, 'decrement', allLines(input));
      expect(result).toEqual({
        outcome: 'changed',
        text: '# H2\n## H3\n### H4\n#### H5\n##### H6',
      });
    });
  });

  describe('lines that look like headings but are not', () => {
    it('should not transform lines with # not followed by space', () => {
      const input = '#hashtag\n## Real heading';
      const result = transformHeadingsInScope(input, 'increment', allLines(input));
      expect(result).toEqual({ outcome: 'changed', text: '#hashtag\n### Real heading' });
    });
  });
});

describe('column-based recognition', () => {
  it('does not treat a line with four spaces then # as a heading', () => {
    const input = '    # Heading\n## Real';
    const result = transformHeadingsInScope(input, 'increment', allLines(input));
    expect(result).toEqual({ outcome: 'changed', text: '    # Heading\n### Real' });
  });

  it('treats a line with three spaces then # as a heading', () => {
    const input = '   # Heading';
    const result = transformHeadingsInScope(input, 'increment', allLines(input));
    expect(result).toEqual({ outcome: 'changed', text: '   ## Heading' });
  });

  it('does not treat a tab then # as a heading (tab expands to column 4)', () => {
    const input = '\t# Heading\n## Real';
    const result = transformHeadingsInScope(input, 'increment', allLines(input));
    expect(result).toEqual({ outcome: 'changed', text: '\t# Heading\n### Real' });
  });
});

describe('splitLines', () => {
  it('returns [] for empty string', () => {
    expect(splitLines('')).toEqual([]);
  });

  it('returns two entries with LF terminators', () => {
    expect(splitLines('# H\n## S\n')).toEqual([
      { content: '# H', terminator: '\n' },
      { content: '## S', terminator: '\n' },
    ]);
  });

  it('returns two entries with CRLF terminators', () => {
    expect(splitLines('# H\r\n## S\r\n')).toEqual([
      { content: '# H', terminator: '\r\n' },
      { content: '## S', terminator: '\r\n' },
    ]);
  });

  it('returns one entry with empty terminator for unterminated line', () => {
    expect(splitLines('# H')).toEqual([{ content: '# H', terminator: '' }]);
  });
});

describe('isAtLimit', () => {
  it('returns true for level 6 increment', () => {
    expect(isAtLimit(6, 'increment')).toBe(true);
  });

  it('returns true for level 1 decrement', () => {
    expect(isAtLimit(1, 'decrement')).toBe(true);
  });

  it('returns false for level 3 increment', () => {
    expect(isAtLimit(3, 'increment')).toBe(false);
  });
});

describe('transformHeadingsInScope', () => {
  it('whole-document scope: all headings shift and outcome is changed', () => {
    const input = '# Title\n\n## Section\n\n### Sub';
    const lines = splitLines(input);
    const scopeLines = new Set(lines.map((_, i) => i));
    const result = transformHeadingsInScope(input, 'increment', scopeLines);
    expect(result.outcome).toBe('changed');
    expect(result.text).toBe('## Title\n\n### Section\n\n#### Sub');
  });

  it('scope restricted to subset: only in-scope headings shift', () => {
    // Lines: 0='# Title', 1='', 2='## Section', 3='', 4='### Sub'
    const input = '# Title\n\n## Section\n\n### Sub';
    // Only lines 2-4 in scope
    const scopeLines = new Set([2, 3, 4]);
    const result = transformHeadingsInScope(input, 'increment', scopeLines);
    expect(result.outcome).toBe('changed');
    expect(result.text).toBe('# Title\n\n### Section\n\n#### Sub');
  });

  it('scope with no headings: outcome is no-op: no transformable heading in scope', () => {
    const input = '# Title\n\nJust text here';
    const scopeLines = new Set([1, 2]); // lines with '' and 'Just text here'
    const result = transformHeadingsInScope(input, 'increment', scopeLines);
    expect(result.outcome).toBe('no-op: no transformable heading in scope');
    expect(result.text).toBe(input);
  });

  it('all in-scope headings at H6 limit (increment): outcome is no-op: all in-scope headings at the limit', () => {
    const input = '###### A\n\n###### B';
    const scopeLines = new Set([0, 1, 2]);
    const result = transformHeadingsInScope(input, 'increment', scopeLines);
    expect(result.outcome).toBe('no-op: all in-scope headings at the limit');
    expect(result.text).toBe(input);
  });

  it('all in-scope headings at H1 limit (decrement): outcome is no-op: all in-scope headings at the limit', () => {
    const input = '# A\n\n# B';
    const scopeLines = new Set([0, 1, 2]);
    const result = transformHeadingsInScope(input, 'decrement', scopeLines);
    expect(result.outcome).toBe('no-op: all in-scope headings at the limit');
    expect(result.text).toBe(input);
  });

  it('heading inside fenced code block is not transformed', () => {
    const input = '# Title\n\n```\n## Inside code\n```\n\n## Real';
    const lines = splitLines(input);
    const scopeLines = new Set(lines.map((_, i) => i));
    const result = transformHeadingsInScope(input, 'increment', scopeLines);
    expect(result.outcome).toBe('changed');
    expect(result.text).toBe('## Title\n\n```\n## Inside code\n```\n\n### Real');
  });

  it('heading inside indented code block fence is not transformed', () => {
    // Three-space indented fence (per existing test pattern)
    const input = '# Title\n\n   ```\n   # In code\n   ```\n\n## Section';
    const lines = splitLines(input);
    const scopeLines = new Set(lines.map((_, i) => i));
    const result = transformHeadingsInScope(input, 'increment', scopeLines);
    expect(result.outcome).toBe('changed');
    expect(result.text).toBe('## Title\n\n   ```\n   # In code\n   ```\n\n### Section');
  });

  it('mixed scope: some headings at limit, some not — only non-limit headings shift, outcome is changed', () => {
    // H2 (not at limit) + H6 (at limit for increment) — H2 shifts, H6 stays
    const input = '## Section\n\n###### Deep';
    const scopeLines = new Set([0, 1, 2]);
    const result = transformHeadingsInScope(input, 'increment', scopeLines);
    expect(result.outcome).toBe('changed');
    expect(result.text).toBe('### Section\n\n###### Deep');
  });

  it('scope spanning lines 1-3 of five-heading document: only those headings shift', () => {
    // Lines: 0='# H1', 1='## H2', 2='### H3', 3='#### H4', 4='##### H5'
    const input = '# H1\n## H2\n### H3\n#### H4\n##### H5';
    const scopeLines = new Set([1, 2, 3]);
    const result = transformHeadingsInScope(input, 'increment', scopeLines);
    expect(result.outcome).toBe('changed');
    expect(result.text).toBe('# H1\n### H2\n#### H3\n##### H4\n##### H5');
  });

  it('multi-selection dedup: overlapping union produces same result as union set applied once', () => {
    // Two overlapping selections covering lines 0-2 and lines 1-3
    const input = '# H1\n## H2\n### H3\n#### H4';
    const sel1 = new Set([0, 1, 2]);
    const sel2 = new Set([1, 2, 3]);
    const union = new Set([...sel1, ...sel2]); // [0,1,2,3]
    const result = transformHeadingsInScope(input, 'increment', union);
    expect(result.outcome).toBe('changed');
    expect(result.text).toBe('## H1\n### H2\n#### H3\n##### H4');
  });
});

describe('SR-1 representative', () => {
  it('scope inside a code block: heading inside code block is not transformed', () => {
    // Fence opens before scope; scope lines 1-2 are inside the code block.
    // '## Inside' looks like a heading but is inside the fence.
    const input = '```\n## Inside\n```';
    // Lines: 0='```', 1='## Inside', 2='```'
    // All lines in scope — but line 1 is inside a code block
    const result = transformHeadingsInScope(input, 'increment', new Set([0, 1, 2]));
    // No real headings found — fence-state tracking prevents ## from being treated as heading
    expect(result.outcome).toBe('no-op: no transformable heading in scope');
    expect(result.text).toBe(input);
  });

  it('real heading above code block + fake heading inside: only real heading transforms', () => {
    // '# Title' is a real heading; '## Inside' is inside the fence.
    const input = '# Title\n```\n## Inside\n```';
    // Lines: 0='# Title', 1='```', 2='## Inside', 3='```'
    const result = transformHeadingsInScope(input, 'increment', allLines(input));
    expect(result.outcome).toBe('changed');
    // Only '# Title' shifts; '## Inside' is code and stays
    expect(result.text).toBe('## Title\n```\n## Inside\n```');
  });
});

describe('setext headings (non-corruption)', () => {
  // Setext headings do not match HEADING_RE — no code change required.
  // These tests confirm that setext-style headings are simply ignored (not corrupted).

  it('setext H1 followed by ATX heading: ATX shifts, setext not touched (increment)', () => {
    const input = 'Title\n=====\n\n## Section';
    const result = transformHeadingsInScope(input, 'increment', allLines(input));
    expect(result.outcome).toBe('changed');
    // Setext heading ('Title\n=====') is unchanged; ATX '## Section' becomes '### Section'
    expect(result.text).toBe('Title\n=====\n\n### Section');
  });

  it('setext H1 followed by ATX heading: ATX shifts, setext not touched (decrement)', () => {
    const input = 'Title\n=====\n\n## Section';
    const result = transformHeadingsInScope(input, 'decrement', allLines(input));
    expect(result.outcome).toBe('changed');
    expect(result.text).toBe('Title\n=====\n\n# Section');
  });

  it('document with only a setext heading: outcome is no-op: no transformable heading in scope', () => {
    const input = 'Title\n=====';
    const result = transformHeadingsInScope(input, 'increment', allLines(input));
    expect(result.outcome).toBe('no-op: no transformable heading in scope');
    expect(result.text).toBe(input);
  });
});
