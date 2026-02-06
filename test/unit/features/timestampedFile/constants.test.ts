import { describe, it, expect } from 'vitest';
import {
  COMMAND_ID_CREATE,
  COMMAND_ID_PREFIX,
  FEATURE_NAME,
} from '../../../../src/features/timestampedFile/constants';

describe('timestampedFile constants', () => {
  describe('COMMAND_ID_CREATE', () => {
    it('should be the correct command id for creating files', () => {
      expect(COMMAND_ID_CREATE).toBe('arit.createTimestampedFile');
    });

    it('should start with arit prefix', () => {
      expect(COMMAND_ID_CREATE).toMatch(/^arit\./);
    });
  });

  describe('COMMAND_ID_PREFIX', () => {
    it('should be the correct command id for prefixing files', () => {
      expect(COMMAND_ID_PREFIX).toBe('arit.prefixTimestampToFile');
    });

    it('should start with arit prefix', () => {
      expect(COMMAND_ID_PREFIX).toMatch(/^arit\./);
    });
  });

  describe('FEATURE_NAME', () => {
    it('should be the correct feature name', () => {
      expect(FEATURE_NAME).toBe('Timestamped File');
    });

    it('should not be empty', () => {
      expect(FEATURE_NAME.length).toBeGreaterThan(0);
    });
  });
});
