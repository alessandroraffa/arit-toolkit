import { describe, it, expect } from 'vitest';
import {
  FEATURE_NAME,
  COMMAND_ID_INCREMENT,
  COMMAND_ID_DECREMENT,
} from '../../../../src/features/markdownHeadings/constants';

describe('markdownHeadings constants', () => {
  it('should export FEATURE_NAME', () => {
    expect(FEATURE_NAME).toBe('Markdown Headings');
  });

  it('should export COMMAND_ID_INCREMENT with correct prefix', () => {
    expect(COMMAND_ID_INCREMENT).toBe('arit.markdownHeadings.increment');
    expect(COMMAND_ID_INCREMENT).toMatch(/^arit\./);
  });

  it('should export COMMAND_ID_DECREMENT with correct prefix', () => {
    expect(COMMAND_ID_DECREMENT).toBe('arit.markdownHeadings.decrement');
    expect(COMMAND_ID_DECREMENT).toMatch(/^arit\./);
  });

  it('should have unique command IDs', () => {
    expect(COMMAND_ID_INCREMENT).not.toBe(COMMAND_ID_DECREMENT);
  });
});
