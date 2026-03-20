import { describe, it, expect } from 'vitest';
import {
  extractExistingTimestampPrefix,
  parseDateMsFromTimestamp,
  buildNewName,
} from '../../../src/utils/timestampPrefix';

describe('extractExistingTimestampPrefix', () => {
  it('returns the 8-character YYYYMMDD prefix when name starts with 8 digits followed by separator', () => {
    expect(extractExistingTimestampPrefix('20260205-notes.md', 'YYYYMMDD', '-')).toBe(
      '20260205'
    );
  });

  it('returns null for YYYYMMDD when the name starts with 8 digits not followed by the separator', () => {
    expect(
      extractExistingTimestampPrefix('20260205notes.md', 'YYYYMMDD', '-')
    ).toBeNull();
  });

  it('returns null for YYYYMMDD when the name starts with fewer than 8 digits', () => {
    expect(
      extractExistingTimestampPrefix('2026020-notes.md', 'YYYYMMDD', '-')
    ).toBeNull();
  });

  it('returns the 12-character prefix for YYYYMMDDHHmm', () => {
    expect(
      extractExistingTimestampPrefix('202602051430-notes.md', 'YYYYMMDDHHmm', '-')
    ).toBe('202602051430');
  });

  it('returns null for YYYYMMDDHHmm when the 13th character is not the separator', () => {
    expect(
      extractExistingTimestampPrefix('202602051430notes.md', 'YYYYMMDDHHmm', '-')
    ).toBeNull();
  });

  it('returns the 14-character prefix for YYYYMMDDHHmmss', () => {
    expect(
      extractExistingTimestampPrefix('20260205143022-notes.md', 'YYYYMMDDHHmmss', '-')
    ).toBe('20260205143022');
  });

  it('returns null for YYYYMMDDHHmmss when the 15th character is not the separator', () => {
    expect(
      extractExistingTimestampPrefix('20260205143022notes.md', 'YYYYMMDDHHmmss', '-')
    ).toBeNull();
  });

  it('returns the 24-character ISO prefix for ISO format', () => {
    expect(
      extractExistingTimestampPrefix('2026-02-05T14-30-22-123Z-notes.md', 'ISO', '-')
    ).toBe('2026-02-05T14-30-22-123Z');
  });

  it('returns null for ISO when the name does not match the ISO pattern', () => {
    expect(
      extractExistingTimestampPrefix('2026-02-05T14:30:22.123Z-notes.md', 'ISO', '-')
    ).toBeNull();
  });

  it('returns null for any format when the name is shorter than the expected timestamp length', () => {
    expect(extractExistingTimestampPrefix('2026', 'YYYYMMDD', '-')).toBeNull();
    expect(extractExistingTimestampPrefix('2026020514', 'YYYYMMDDHHmm', '-')).toBeNull();
    expect(
      extractExistingTimestampPrefix('202602051430', 'YYYYMMDDHHmmss', '-')
    ).toBeNull();
    expect(extractExistingTimestampPrefix('2026-02-05T14-30-22', 'ISO', '-')).toBeNull();
  });
});

describe('parseDateMsFromTimestamp', () => {
  it('returns Date.UTC(2026, 1, 5) for YYYYMMDD input "20260205"', () => {
    expect(parseDateMsFromTimestamp('20260205', 'YYYYMMDD')).toBe(Date.UTC(2026, 1, 5));
  });

  it('returns Date.UTC(2026, 1, 5) for YYYYMMDDHHmm input "202602051430" (date portion only)', () => {
    expect(parseDateMsFromTimestamp('202602051430', 'YYYYMMDDHHmm')).toBe(
      Date.UTC(2026, 1, 5)
    );
  });

  it('returns Date.UTC(2026, 1, 5) for YYYYMMDDHHmmss input "20260205143022"', () => {
    expect(parseDateMsFromTimestamp('20260205143022', 'YYYYMMDDHHmmss')).toBe(
      Date.UTC(2026, 1, 5)
    );
  });

  it('returns Date.UTC(2026, 1, 5) for ISO input "2026-02-05T14-30-22-123Z"', () => {
    expect(parseDateMsFromTimestamp('2026-02-05T14-30-22-123Z', 'ISO')).toBe(
      Date.UTC(2026, 1, 5)
    );
  });
});

describe('buildNewName', () => {
  it('replaces the existing timestamp when the date difference is exactly 0 days', () => {
    expect(
      buildNewName('202602051430-notes.md', '202602051500', 'YYYYMMDDHHmm', '-')
    ).toBe('202602051500-notes.md');
  });

  it('replaces the existing timestamp when the date difference is exactly 3 days', () => {
    // 2026-02-02 vs 2026-02-05: 3 days exactly, within threshold
    expect(
      buildNewName('202602021430-notes.md', '202602051430', 'YYYYMMDDHHmm', '-')
    ).toBe('202602051430-notes.md');
  });

  it('prepends a new timestamp when the date difference is exactly 4 days (greater than 3)', () => {
    // 2026-02-01 vs 2026-02-05: 4 days, exceeds threshold
    expect(
      buildNewName('202602011430-notes.md', '202602051430', 'YYYYMMDDHHmm', '-')
    ).toBe('202602051430-202602011430-notes.md');
  });

  it('prepends a new timestamp when the original name has no timestamp prefix', () => {
    expect(buildNewName('notes.md', '202602051430', 'YYYYMMDDHHmm', '-')).toBe(
      '202602051430-notes.md'
    );
  });

  it('replaces an existing YYYYMMDD prefix within 3 days', () => {
    // 2026-02-02 vs 2026-02-05: 3 days exactly, within threshold
    expect(buildNewName('20260202-notes.md', '20260205', 'YYYYMMDD', '-')).toBe(
      '20260205-notes.md'
    );
  });

  it('preserves the rest of the name after the existing timestamp and separator when replacing', () => {
    expect(
      buildNewName(
        '202602051430-my-project-notes.md',
        '202602051500',
        'YYYYMMDDHHmm',
        '-'
      )
    ).toBe('202602051500-my-project-notes.md');
  });

  it('handles an ISO format replacement', () => {
    expect(
      buildNewName(
        '2026-02-05T14-30-22-123Z-notes.md',
        '2026-02-05T15-00-00-000Z',
        'ISO',
        '-'
      )
    ).toBe('2026-02-05T15-00-00-000Z-notes.md');
  });
});
