import { describe, it, expect } from 'vitest';
import {
  transformHeadings,
  splitLines,
  isAtLimit,
} from '../../../../src/features/markdownHeadings/headingTransform';

describe('transformHeadings', () => {
  describe('increment', () => {
    it('should increment all headings by one level', () => {
      const input = '# Title\n\nSome text\n\n## Section\n\n### Subsection';
      const result = transformHeadings(input, 'increment');

      expect(result).toEqual({
        success: true,
        text: '## Title\n\nSome text\n\n### Section\n\n#### Subsection',
      });
    });

    it('should handle h6 headings by aborting', () => {
      const input = '## Section\n\n###### Deep heading';
      const result = transformHeadings(input, 'increment');

      expect(result).toEqual({
        success: false,
        error: 'Cannot increment: one or more headings are already at level 6 (maximum).',
      });
    });

    it('should not modify headings inside fenced code blocks', () => {
      const input =
        '# Title\n\n```\n# This is a comment\n## Not a heading\n```\n\n## Section';
      const result = transformHeadings(input, 'increment');

      expect(result).toEqual({
        success: true,
        text: '## Title\n\n```\n# This is a comment\n## Not a heading\n```\n\n### Section',
      });
    });

    it('should not modify headings inside fenced code blocks with language', () => {
      const input = '# Title\n\n```markdown\n# Heading in code\n```\n\n## Section';
      const result = transformHeadings(input, 'increment');

      expect(result).toEqual({
        success: true,
        text: '## Title\n\n```markdown\n# Heading in code\n```\n\n### Section',
      });
    });

    it('should handle text with no headings', () => {
      const input = 'Just some text\nwithout any headings.';
      const result = transformHeadings(input, 'increment');

      expect(result).toEqual({ success: true, text: input });
    });

    it('should handle empty string', () => {
      const result = transformHeadings('', 'increment');
      expect(result).toEqual({ success: true, text: '' });
    });

    it('should handle headings with extra spaces after hashes', () => {
      const input = '#  Title with spaces';
      const result = transformHeadings(input, 'increment');

      expect(result).toEqual({
        success: true,
        text: '##  Title with spaces',
      });
    });
  });

  describe('decrement', () => {
    it('should decrement all headings by one level', () => {
      const input = '## Title\n\n### Section\n\n#### Subsection';
      const result = transformHeadings(input, 'decrement');

      expect(result).toEqual({
        success: true,
        text: '# Title\n\n## Section\n\n### Subsection',
      });
    });

    it('should abort when any heading is already h1', () => {
      const input = '# Title\n\n## Section';
      const result = transformHeadings(input, 'decrement');

      expect(result).toEqual({
        success: false,
        error: 'Cannot decrement: one or more headings are already at level 1 (minimum).',
      });
    });

    it('should not modify headings inside fenced code blocks', () => {
      const input = '## Title\n\n```\n# Code comment\n```\n\n### Section';
      const result = transformHeadings(input, 'decrement');

      expect(result).toEqual({
        success: true,
        text: '# Title\n\n```\n# Code comment\n```\n\n## Section',
      });
    });

    it('should handle text with no headings', () => {
      const input = 'No headings here.';
      const result = transformHeadings(input, 'decrement');

      expect(result).toEqual({ success: true, text: input });
    });
  });

  describe('code block edge cases', () => {
    it('should handle nested code blocks (triple backticks)', () => {
      const input = '# Title\n\n````\n```\n# Nested\n```\n````\n\n## Section';
      const result = transformHeadings(input, 'increment');

      expect(result).toEqual({
        success: true,
        text: '## Title\n\n````\n```\n# Nested\n```\n````\n\n### Section',
      });
    });

    it('should handle indented code block fences', () => {
      const input = '# Title\n\n   ```\n   # In code\n   ```\n\n## Section';
      const result = transformHeadings(input, 'increment');

      expect(result).toEqual({
        success: true,
        text: '## Title\n\n   ```\n   # In code\n   ```\n\n### Section',
      });
    });

    it('should handle tilde code blocks', () => {
      const input = '# Title\n\n~~~\n# In code\n~~~\n\n## Section';
      const result = transformHeadings(input, 'increment');

      expect(result).toEqual({
        success: true,
        text: '## Title\n\n~~~\n# In code\n~~~\n\n### Section',
      });
    });

    it('should handle unclosed code block (rest of text is code)', () => {
      const input = '# Title\n\n```\n# In code\n## Also code';
      const result = transformHeadings(input, 'increment');

      expect(result).toEqual({
        success: true,
        text: '## Title\n\n```\n# In code\n## Also code',
      });
    });
  });

  describe('mixed levels', () => {
    it('should handle all heading levels incrementing', () => {
      const input = '# H1\n## H2\n### H3\n#### H4\n##### H5';
      const result = transformHeadings(input, 'increment');

      expect(result).toEqual({
        success: true,
        text: '## H1\n### H2\n#### H3\n##### H4\n###### H5',
      });
    });

    it('should handle all heading levels decrementing', () => {
      const input = '## H2\n### H3\n#### H4\n##### H5\n###### H6';
      const result = transformHeadings(input, 'decrement');

      expect(result).toEqual({
        success: true,
        text: '# H2\n## H3\n### H4\n#### H5\n##### H6',
      });
    });
  });

  describe('lines that look like headings but are not', () => {
    it('should not transform lines with # not followed by space', () => {
      const input = '#hashtag\n## Real heading';
      const result = transformHeadings(input, 'increment');

      expect(result).toEqual({
        success: true,
        text: '#hashtag\n### Real heading',
      });
    });
  });
});

describe('column-based recognition', () => {
  it('does not treat a line with four spaces then # as a heading', () => {
    const input = '    # Heading\n## Real';
    const result = transformHeadings(input, 'increment');
    expect(result).toEqual({ success: true, text: '    # Heading\n### Real' });
  });

  it('treats a line with three spaces then # as a heading', () => {
    const input = '   # Heading';
    const result = transformHeadings(input, 'increment');
    expect(result).toEqual({ success: true, text: '   ## Heading' });
  });

  it('does not treat a tab then # as a heading (tab expands to column 4)', () => {
    const input = '\t# Heading\n## Real';
    const result = transformHeadings(input, 'increment');
    expect(result).toEqual({ success: true, text: '\t# Heading\n### Real' });
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
