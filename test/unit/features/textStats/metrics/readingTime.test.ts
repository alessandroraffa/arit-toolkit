import { describe, it, expect } from 'vitest';
import {
  calculateReadingTime,
  formatReadingTime,
} from '../../../../../src/features/textStats/metrics/readingTime';

describe('calculateReadingTime', () => {
  it('should return 0m 0s for zero words', () => {
    expect(calculateReadingTime(0, 200)).toEqual({ minutes: 0, seconds: 0 });
  });

  it('should return sub-minute time', () => {
    // 10 words at 200 wpm = 3 seconds (ceil(10/200*60) = ceil(3) = 3)
    expect(calculateReadingTime(10, 200)).toEqual({ minutes: 0, seconds: 3 });
  });

  it('should return exact minute', () => {
    // 200 words at 200 wpm = 60 seconds = 1m 0s
    expect(calculateReadingTime(200, 200)).toEqual({ minutes: 1, seconds: 0 });
  });

  it('should return minutes and seconds', () => {
    // 250 words at 200 wpm = ceil(250/200*60) = ceil(75) = 75s = 1m 15s
    expect(calculateReadingTime(250, 200)).toEqual({ minutes: 1, seconds: 15 });
  });

  it('should handle custom wpm', () => {
    // 100 words at 100 wpm = 60s = 1m 0s
    expect(calculateReadingTime(100, 100)).toEqual({ minutes: 1, seconds: 0 });
  });

  it('should ceil fractional seconds', () => {
    // 1 word at 200 wpm = ceil(1/200*60) = ceil(0.3) = 1s
    expect(calculateReadingTime(1, 200)).toEqual({ minutes: 0, seconds: 1 });
  });
});

describe('formatReadingTime', () => {
  it('should format zero time', () => {
    expect(formatReadingTime({ minutes: 0, seconds: 0 })).toBe('~0m 0s');
  });

  it('should format seconds only', () => {
    expect(formatReadingTime({ minutes: 0, seconds: 24 })).toBe('~0m 24s');
  });

  it('should format minutes and seconds', () => {
    expect(formatReadingTime({ minutes: 3, seconds: 24 })).toBe('~3m 24s');
  });

  it('should format exact minute', () => {
    expect(formatReadingTime({ minutes: 1, seconds: 0 })).toBe('~1m 0s');
  });
});
