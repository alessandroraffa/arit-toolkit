import { describe, it, expect } from 'vitest';
import { formatSize } from '../../../../../src/features/textStats/metrics/size';

describe('formatSize', () => {
  it('should return "0 KB" for 0 bytes', () => {
    expect(formatSize(0)).toBe('0 KB');
  });

  it('should return "0.1 KB" for very small non-zero bytes', () => {
    expect(formatSize(1)).toBe('0.1 KB');
    expect(formatSize(50)).toBe('0.1 KB');
  });

  it('should format bytes in KB range', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(4812)).toBe('4.7 KB');
  });

  it('should format large KB values', () => {
    // 1023 KB = 1023 * 1024 = 1047552 bytes
    expect(formatSize(1047552)).toBe('1023.0 KB');
  });

  it('should switch to MB at 1024 KB threshold', () => {
    // 1024 KB = 1024 * 1024 = 1048576 bytes
    expect(formatSize(1048576)).toBe('1.0 MB');
  });

  it('should format MB with one decimal', () => {
    // 2.5 MB = 2.5 * 1024 * 1024
    expect(formatSize(2621440)).toBe('2.5 MB');
  });

  it('should show minimum 0.1 KB for small files', () => {
    // 100 bytes < 102.4 bytes (0.1 KB)
    expect(formatSize(100)).toBe('0.1 KB');
  });

  it('should correctly round KB values', () => {
    // 512 bytes = 0.5 KB
    expect(formatSize(512)).toBe('0.5 KB');
  });
});
