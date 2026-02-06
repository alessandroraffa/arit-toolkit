import { describe, it, expect } from 'vitest';
import {
  FEATURE_NAME,
  COMMAND_ID_TOGGLE,
  STATUS_BAR_PRIORITY,
  ICON_CODICON,
  STATUS_BAR_TEXT,
  STATUS_BAR_NAME,
} from '../../../../src/features/statusBarToggle/constants';

describe('statusBarToggle constants', () => {
  it('should have a non-empty feature name', () => {
    expect(FEATURE_NAME).toBe('Status Bar Toggle');
  });

  it('should have command id with arit prefix', () => {
    expect(COMMAND_ID_TOGGLE).toBe('arit.toggleEnabled');
    expect(COMMAND_ID_TOGGLE.startsWith('arit.')).toBe(true);
  });

  it('should have a numeric priority', () => {
    expect(typeof STATUS_BAR_PRIORITY).toBe('number');
    expect(STATUS_BAR_PRIORITY).toBe(100);
  });

  it('should have a codicon icon', () => {
    expect(ICON_CODICON).toBe('$(tools)');
  });

  it('should have status bar text', () => {
    expect(STATUS_BAR_TEXT).toBe('ARIT');
  });

  it('should have status bar name', () => {
    expect(STATUS_BAR_NAME).toBe('ARIT Toolkit');
  });
});
