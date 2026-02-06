import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window, MarkdownString, ThemeColor } from '../../mocks/vscode';
import {
  createStatusBarItem,
  updateStatusBarItem,
} from '../../../../src/features/statusBarToggle/statusBarItem';

describe('statusBarItem', () => {
  let mockStateManager: {
    isEnabled: boolean;
    isSingleRoot: boolean;
    workspaceMode: string;
  };
  let mockConfig: {
    timestampFormat: string;
    timestampSeparator: string;
  };
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStateManager = {
      isEnabled: true,
      isSingleRoot: true,
      workspaceMode: 'single-root',
    };
    mockConfig = {
      timestampFormat: 'YYYYMMDDHHmm',
      timestampSeparator: '-',
    };
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
    };
  });

  describe('createStatusBarItem', () => {
    it('should create item with correct alignment and priority', () => {
      createStatusBarItem(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockStateManager as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockConfig as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLogger as any
      );

      expect(window.createStatusBarItem).toHaveBeenCalledWith(2, 100);
    });

    it('should set command to toggle command', () => {
      const item = createStatusBarItem(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockStateManager as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockConfig as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLogger as any
      );

      expect(item.command).toBe('arit.toggleEnabled');
    });

    it('should call show on creation', () => {
      const item = createStatusBarItem(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockStateManager as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockConfig as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLogger as any
      );

      expect(item.show).toHaveBeenCalled();
    });

    it('should set name to ARIT Toolkit', () => {
      const item = createStatusBarItem(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockStateManager as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockConfig as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLogger as any
      );

      expect(item.name).toBe('ARIT Toolkit');
    });
  });

  describe('updateStatusBarItem - single-root enabled', () => {
    it('should set correct text', () => {
      const item = createStatusBarItem(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockStateManager as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockConfig as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLogger as any
      );
      mockStateManager.isEnabled = true;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateStatusBarItem(item, mockStateManager as any, mockConfig as any);

      expect(item.text).toBe('$(tools) ARIT');
    });

    it('should have no warning background when enabled', () => {
      const item = createStatusBarItem(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockStateManager as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockConfig as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLogger as any
      );
      mockStateManager.isEnabled = true;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateStatusBarItem(item, mockStateManager as any, mockConfig as any);

      expect(item.backgroundColor).toBeUndefined();
    });

    it('should have tooltip with enabled status', () => {
      const item = createStatusBarItem(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockStateManager as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockConfig as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLogger as any
      );
      mockStateManager.isEnabled = true;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateStatusBarItem(item, mockStateManager as any, mockConfig as any);

      const tooltip = item.tooltip as InstanceType<typeof MarkdownString>;
      expect(tooltip.value).toContain('Enabled');
      expect(tooltip.value).toContain('Click to disable');
    });
  });

  describe('updateStatusBarItem - single-root disabled', () => {
    it('should have warning background when disabled', () => {
      mockStateManager.isEnabled = false;
      const item = createStatusBarItem(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockStateManager as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockConfig as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLogger as any
      );

      expect(item.backgroundColor).toBeInstanceOf(ThemeColor);
    });

    it('should have tooltip with disabled status', () => {
      mockStateManager.isEnabled = false;
      const item = createStatusBarItem(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockStateManager as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockConfig as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLogger as any
      );

      const tooltip = item.tooltip as InstanceType<typeof MarkdownString>;
      expect(tooltip.value).toContain('Disabled');
      expect(tooltip.value).toContain('Click to enable');
    });
  });

  describe('updateStatusBarItem - multi-root', () => {
    it('should have warning background', () => {
      mockStateManager.isSingleRoot = false;
      mockStateManager.workspaceMode = 'multi-root';
      const item = createStatusBarItem(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockStateManager as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockConfig as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLogger as any
      );

      expect(item.backgroundColor).toBeInstanceOf(ThemeColor);
    });

    it('should have tooltip about multi-directory limitation', () => {
      mockStateManager.isSingleRoot = false;
      mockStateManager.workspaceMode = 'multi-root';
      const item = createStatusBarItem(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockStateManager as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockConfig as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLogger as any
      );

      const tooltip = item.tooltip as InstanceType<typeof MarkdownString>;
      expect(tooltip.value).toContain('multi-directory workspace');
    });
  });

  describe('tooltip configuration values', () => {
    it('should reflect current timestamp format', () => {
      mockConfig.timestampFormat = 'ISO';
      const item = createStatusBarItem(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockStateManager as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockConfig as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLogger as any
      );

      const tooltip = item.tooltip as InstanceType<typeof MarkdownString>;
      expect(tooltip.value).toContain('ISO');
    });

    it('should reflect current separator', () => {
      mockConfig.timestampSeparator = '_';
      const item = createStatusBarItem(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockStateManager as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockConfig as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockLogger as any
      );

      const tooltip = item.tooltip as InstanceType<typeof MarkdownString>;
      expect(tooltip.value).toContain('_');
    });
  });
});
