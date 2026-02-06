import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window } from '../../mocks/vscode';
import { toggleEnabledCommand } from '../../../../src/features/statusBarToggle/command';

describe('toggleEnabledCommand', () => {
  let mockStateManager: {
    isToggleable: boolean;
    isEnabled: boolean;
    isSingleRoot: boolean;
    toggle: ReturnType<typeof vi.fn>;
  };
  let mockConfig: {
    timestampFormat: string;
    timestampSeparator: string;
  };
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
  let mockStatusBarItem: {
    text: string;
    tooltip: unknown;
    backgroundColor: unknown;
    command: string | undefined;
    name: string | undefined;
    show: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStateManager = {
      isToggleable: true,
      isEnabled: false,
      isSingleRoot: true,
      toggle: vi.fn().mockResolvedValue(true),
    };
    mockConfig = {
      timestampFormat: 'YYYYMMDDHHmm',
      timestampSeparator: '-',
    };
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
    };
    mockStatusBarItem = {
      text: '',
      tooltip: undefined,
      backgroundColor: undefined,
      command: undefined,
      name: undefined,
      show: vi.fn(),
    };
  });

  it('should call stateManager.toggle in single-root workspace', async () => {
    const command = toggleEnabledCommand({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateManager: mockStateManager as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: mockConfig as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: mockLogger as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      statusBarItem: mockStatusBarItem as any,
    });

    await command();

    expect(mockStateManager.toggle).toHaveBeenCalled();
  });

  it('should update status bar item after toggle', async () => {
    mockStateManager.toggle = vi.fn().mockImplementation(async () => {
      mockStateManager.isEnabled = true;
      return true;
    });

    const command = toggleEnabledCommand({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateManager: mockStateManager as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: mockConfig as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: mockLogger as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      statusBarItem: mockStatusBarItem as any,
    });

    await command();

    expect(mockStatusBarItem.text).toBe('$(tools) ARIT');
  });

  it('should log the new state', async () => {
    mockStateManager.toggle = vi.fn().mockImplementation(async () => {
      mockStateManager.isEnabled = true;
      return true;
    });

    const command = toggleEnabledCommand({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateManager: mockStateManager as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: mockConfig as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: mockLogger as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      statusBarItem: mockStatusBarItem as any,
    });

    await command();

    expect(mockLogger.info).toHaveBeenCalledWith(
      'ARIT Toolkit enabled for this workspace'
    );
  });

  it('should show info message in multi-root workspace', async () => {
    mockStateManager.isToggleable = false;

    const command = toggleEnabledCommand({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateManager: mockStateManager as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: mockConfig as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: mockLogger as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      statusBarItem: mockStatusBarItem as any,
    });

    await command();

    expect(mockStateManager.toggle).not.toHaveBeenCalled();
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'ARIT Toolkit: Toggle is not available in multi-directory workspaces.'
    );
  });
});
