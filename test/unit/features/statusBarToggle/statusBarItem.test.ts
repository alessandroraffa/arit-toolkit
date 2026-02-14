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
    getConfigSection: ReturnType<typeof vi.fn>;
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
      getConfigSection: vi.fn().mockReturnValue(undefined),
    };
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
    };
  });

  describe('createStatusBarItem', () => {
    it('should create item with correct alignment and priority', () => {
      createStatusBarItem(
        mockStateManager as any,

        mockLogger as any
      );

      expect(window.createStatusBarItem).toHaveBeenCalledWith(2, 100);
    });

    it('should set command to toggle command', () => {
      const item = createStatusBarItem(
        mockStateManager as any,

        mockLogger as any
      );

      expect(item.command).toBe('arit.toggleEnabled');
    });

    it('should call show on creation', () => {
      const item = createStatusBarItem(
        mockStateManager as any,

        mockLogger as any
      );

      expect(item.show).toHaveBeenCalled();
    });

    it('should set name to ARIT Toolkit', () => {
      const item = createStatusBarItem(
        mockStateManager as any,

        mockLogger as any
      );

      expect(item.name).toBe('ARIT Toolkit');
    });
  });

  describe('updateStatusBarItem - single-root enabled', () => {
    it('should set correct text', () => {
      const item = createStatusBarItem(
        mockStateManager as any,

        mockLogger as any
      );
      mockStateManager.isEnabled = true;

      updateStatusBarItem(item, mockStateManager as any);

      expect(item.text).toBe('$(tools) ARIT');
    });

    it('should have no warning background when enabled', () => {
      const item = createStatusBarItem(
        mockStateManager as any,

        mockLogger as any
      );
      mockStateManager.isEnabled = true;

      updateStatusBarItem(item, mockStateManager as any);

      expect(item.backgroundColor).toBeUndefined();
    });

    it('should have tooltip with enabled status', () => {
      const item = createStatusBarItem(
        mockStateManager as any,

        mockLogger as any
      );
      mockStateManager.isEnabled = true;

      updateStatusBarItem(item, mockStateManager as any);

      const tooltip = item.tooltip as InstanceType<typeof MarkdownString>;
      expect(tooltip.value).toContain('Enabled');
      expect(tooltip.value).toContain('Click to disable');
    });

    it('should not include Features or Configuration sections', () => {
      const item = createStatusBarItem(
        mockStateManager as any,

        mockLogger as any
      );
      mockStateManager.isEnabled = true;

      updateStatusBarItem(item, mockStateManager as any);

      const tooltip = item.tooltip as InstanceType<typeof MarkdownString>;
      expect(tooltip.value).not.toContain('Features:');
      expect(tooltip.value).not.toContain('Configuration:');
      expect(tooltip.value).not.toContain('Timestamped File Creator');
      expect(tooltip.value).not.toContain('Prefix Creation Timestamp');
      expect(tooltip.value).not.toContain('Timestamp Format');
      expect(tooltip.value).not.toContain('Separator');
    });
  });

  describe('updateStatusBarItem - single-root disabled', () => {
    it('should have dimmed foreground when disabled', () => {
      mockStateManager.isEnabled = false;
      const item = createStatusBarItem(
        mockStateManager as any,

        mockLogger as any
      );

      expect(item.backgroundColor).toBeUndefined();
      expect(item.color).toBeInstanceOf(ThemeColor);
    });

    it('should have tooltip with disabled status', () => {
      mockStateManager.isEnabled = false;
      const item = createStatusBarItem(
        mockStateManager as any,

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
        mockStateManager as any,

        mockLogger as any
      );

      expect(item.backgroundColor).toBeInstanceOf(ThemeColor);
    });

    it('should have tooltip about multi-directory limitation', () => {
      mockStateManager.isSingleRoot = false;
      mockStateManager.workspaceMode = 'multi-root';
      const item = createStatusBarItem(
        mockStateManager as any,

        mockLogger as any
      );

      const tooltip = item.tooltip as InstanceType<typeof MarkdownString>;
      expect(tooltip.value).toContain('multi-directory workspace');
    });
  });

  describe('tooltip background services', () => {
    it('should show archiving status when config exists', () => {
      mockStateManager.getConfigSection.mockReturnValue({ enabled: true });
      const item = createStatusBarItem(
        mockStateManager as any,

        mockLogger as any
      );

      const tooltip = item.tooltip as InstanceType<typeof MarkdownString>;
      expect(tooltip.value).toContain('Background Services:');
      expect(tooltip.value).toContain('Agent Sessions Archiving');
    });

    it('should not show Features or Configuration sections', () => {
      const item = createStatusBarItem(
        mockStateManager as any,

        mockLogger as any
      );

      const tooltip = item.tooltip as InstanceType<typeof MarkdownString>;
      expect(tooltip.value).not.toContain('Features:');
      expect(tooltip.value).not.toContain('Configuration:');
    });
  });
});
