import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateTimestamp } from '../../../src/utils/timestamp';

describe('generateTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-05T14:30:22.123Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should generate YYYYMMDDHHmm format', () => {
    expect(generateTimestamp('YYYYMMDDHHmm')).toBe('202602051430');
  });

  it('should generate YYYYMMDD format', () => {
    expect(generateTimestamp('YYYYMMDD')).toBe('20260205');
  });

  it('should generate YYYYMMDDHHmmss format', () => {
    expect(generateTimestamp('YYYYMMDDHHmmss')).toBe('20260205143022');
  });

  it('should generate ISO format', () => {
    expect(generateTimestamp('ISO')).toBe('2026-02-05T14-30-22-123Z');
  });

  it('should pad single digit months correctly', () => {
    vi.setSystemTime(new Date('2026-01-05T14:30:22.000Z'));
    expect(generateTimestamp('YYYYMMDD')).toBe('20260105');
  });

  it('should pad single digit days correctly', () => {
    vi.setSystemTime(new Date('2026-02-01T14:30:22.000Z'));
    expect(generateTimestamp('YYYYMMDD')).toBe('20260201');
  });

  it('should pad single digit hours correctly', () => {
    vi.setSystemTime(new Date('2026-02-05T05:30:22.000Z'));
    expect(generateTimestamp('YYYYMMDDHHmm')).toBe('202602050530');
  });

  it('should pad single digit minutes correctly', () => {
    vi.setSystemTime(new Date('2026-02-05T14:05:22.000Z'));
    expect(generateTimestamp('YYYYMMDDHHmm')).toBe('202602051405');
  });

  it('should use UTC time', () => {
    // This test ensures we're using UTC, not local time
    const result = generateTimestamp('YYYYMMDDHHmm');
    expect(result).toBe('202602051430');
  });

  describe('with custom date parameter', () => {
    it('should use provided date instead of current time', () => {
      const customDate = new Date('2020-06-15T09:45:30.000Z');
      expect(generateTimestamp('YYYYMMDDHHmm', customDate)).toBe('202006150945');
    });

    it('should generate YYYYMMDD format with custom date', () => {
      const customDate = new Date('2019-12-25T00:00:00.000Z');
      expect(generateTimestamp('YYYYMMDD', customDate)).toBe('20191225');
    });

    it('should generate YYYYMMDDHHmmss format with custom date', () => {
      const customDate = new Date('2021-03-10T23:59:59.000Z');
      expect(generateTimestamp('YYYYMMDDHHmmss', customDate)).toBe('20210310235959');
    });

    it('should generate ISO format with custom date', () => {
      const customDate = new Date('2022-07-04T12:00:00.500Z');
      expect(generateTimestamp('ISO', customDate)).toBe('2022-07-04T12-00-00-500Z');
    });
  });
});
