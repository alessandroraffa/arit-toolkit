import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window } from '../../mocks/vscode';
import {
  toggleEnabledCommand,
  checkupCommand,
  buildCheckupMessage,
} from '../../../../src/features/statusBarToggle/command';

describe('toggleEnabledCommand', () => {
  let mockStateManager: {
    isToggleable: boolean;
    isEnabled: boolean;
    isSingleRoot: boolean;
    toggle: ReturnType<typeof vi.fn>;
    getConfigSection: ReturnType<typeof vi.fn>;
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
      getConfigSection: vi.fn().mockReturnValue(undefined),
      registeredServices: [],
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
      stateManager: mockStateManager as any,

      logger: mockLogger as any,

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
      stateManager: mockStateManager as any,

      logger: mockLogger as any,

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
      stateManager: mockStateManager as any,

      logger: mockLogger as any,

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
      stateManager: mockStateManager as any,

      logger: mockLogger as any,

      statusBarItem: mockStatusBarItem as any,
    });

    await command();

    expect(mockStateManager.toggle).not.toHaveBeenCalled();
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'ARIT Toolkit: Toggle is not available in multi-directory workspaces.'
    );
  });
});

describe('checkupCommand', () => {
  let mockStateManager: {
    isEnabled: boolean;
    isSingleRoot: boolean;
    checkup: ReturnType<typeof vi.fn>;
    getConfigSection: ReturnType<typeof vi.fn>;
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
      isEnabled: true,
      isSingleRoot: true,
      checkup: vi
        .fn()
        .mockResolvedValue({ configUpdated: false, commitResult: 'no-changes' }),
      getConfigSection: vi.fn().mockReturnValue(undefined),
      registeredServices: [],
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

  it('should call stateManager.checkup', async () => {
    const command = checkupCommand({
      stateManager: mockStateManager as any,
      logger: mockLogger as any,
      statusBarItem: mockStatusBarItem as any,
    });

    await command();

    expect(mockStateManager.checkup).toHaveBeenCalled();
  });

  it('should update status bar item after checkup', async () => {
    const command = checkupCommand({
      stateManager: mockStateManager as any,
      logger: mockLogger as any,
      statusBarItem: mockStatusBarItem as any,
    });

    await command();

    expect(mockStatusBarItem.text).toBe('$(tools) ARIT');
  });

  it('should show summary message', async () => {
    const command = checkupCommand({
      stateManager: mockStateManager as any,
      logger: mockLogger as any,
      statusBarItem: mockStatusBarItem as any,
    });

    await command();

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'ARIT Toolkit: Config is up to date.'
    );
  });

  it('should log checkup action', async () => {
    const command = checkupCommand({
      stateManager: mockStateManager as any,
      logger: mockLogger as any,
      statusBarItem: mockStatusBarItem as any,
    });

    await command();

    expect(mockLogger.info).toHaveBeenCalledWith('ARIT Toolkit checkup completed');
  });
});

describe('buildCheckupMessage', () => {
  it('should return up to date when no changes', () => {
    expect(
      buildCheckupMessage({ configUpdated: false, commitResult: 'no-changes' })
    ).toBe('ARIT Toolkit: Config is up to date.');
  });

  it('should return up to date for git-ignored', () => {
    expect(
      buildCheckupMessage({ configUpdated: false, commitResult: 'git-ignored' })
    ).toBe('ARIT Toolkit: Config is up to date.');
  });

  it('should mention config updated and committed', () => {
    expect(buildCheckupMessage({ configUpdated: true, commitResult: 'committed' })).toBe(
      'ARIT Toolkit: Config updated. changes committed.'
    );
  });

  it('should mention config updated with uncommitted changes', () => {
    expect(buildCheckupMessage({ configUpdated: true, commitResult: 'skipped' })).toBe(
      'ARIT Toolkit: Config updated. file has uncommitted changes.'
    );
  });

  it('should mention config updated when git-ignored', () => {
    expect(
      buildCheckupMessage({ configUpdated: true, commitResult: 'git-ignored' })
    ).toBe('ARIT Toolkit: Config updated.');
  });

  it('should mention commit failed', () => {
    expect(buildCheckupMessage({ configUpdated: true, commitResult: 'failed' })).toBe(
      'ARIT Toolkit: Config updated. commit failed — check output log.'
    );
  });
});
