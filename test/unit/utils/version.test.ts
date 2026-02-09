import { describe, it, expect } from 'vitest';
import { computeVersionCode } from '../../../src/utils/version';

describe('computeVersionCode', () => {
  it('should compute version code for 1.1.2', () => {
    expect(computeVersionCode('1.1.2')).toBe(1001001002);
  });

  it('should compute version code for 2.10.5', () => {
    expect(computeVersionCode('2.10.5')).toBe(1002010005);
  });

  it('should compute version code for 0.0.0', () => {
    expect(computeVersionCode('0.0.0')).toBe(1000000000);
  });

  it('should compute version code for 0.0.1', () => {
    expect(computeVersionCode('0.0.1')).toBe(1000000001);
  });

  it('should compute version code for 999.999.999', () => {
    expect(computeVersionCode('999.999.999')).toBe(1999999999);
  });

  it('should compute version code for 1.0.0', () => {
    expect(computeVersionCode('1.0.0')).toBe(1001000000);
  });

  it('should throw for invalid format with two segments', () => {
    expect(() => computeVersionCode('1.2')).toThrow('Invalid version format');
  });

  it('should throw for invalid format with one segment', () => {
    expect(() => computeVersionCode('1')).toThrow('Invalid version format');
  });

  it('should throw for non-numeric segments', () => {
    expect(() => computeVersionCode('a.b.c')).toThrow('Invalid version segments');
  });

  it('should throw for segments exceeding 999', () => {
    expect(() => computeVersionCode('1000.0.0')).toThrow('Invalid version segments');
  });

  it('should throw for negative segments', () => {
    expect(() => computeVersionCode('-1.0.0')).toThrow('Invalid version segments');
  });
});
