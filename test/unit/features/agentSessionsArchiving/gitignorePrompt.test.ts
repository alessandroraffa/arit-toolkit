import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window, workspace, Uri } from '../../mocks/vscode';
import type { AgentSessionsArchivingConfig } from '../../../../src/types';

const { mockIsGitRepository, mockIsGitIgnored } = vi.hoisted(() => ({
  mockIsGitRepository: vi.fn(),
  mockIsGitIgnored: vi.fn(),
}));

vi.mock('../../../../src/core/git', () => ({
  isGitRepository: mockIsGitRepository,
  isGitIgnored: mockIsGitIgnored,
}));

vi.mock('vscode', () => ({
  window,
  workspace,
  Uri,
}));

const { checkAndPromptGitignore, writeGitignoreEntry } =
  await import('../../../../src/features/agentSessionsArchiving/gitignorePrompt');

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Parameters<typeof checkAndPromptGitignore>[3];

const workspaceRootUri = Uri.file('/workspace');

const baseConfig: AgentSessionsArchivingConfig = {
  enabled: true,
  archivePath: 'docs/archive/agent-sessions',
  intervalMinutes: 5,
};

describe('checkAndPromptGitignore', () => {
  let mockUpdateConfig: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateConfig = vi.fn().mockResolvedValue(undefined);
  });

  it('should return without prompting when workspace is not a git repository', async () => {
    mockIsGitRepository.mockResolvedValue(false);

    await checkAndPromptGitignore(
      baseConfig.archivePath,
      workspaceRootUri,
      baseConfig,
      logger,
      mockUpdateConfig
    );

    expect(window.showInformationMessage).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it('should return without prompting when decision is already recorded as ignored', async () => {
    mockIsGitRepository.mockResolvedValue(true);
    const config: AgentSessionsArchivingConfig = {
      ...baseConfig,
      gitignoreDecisions: { 'docs/archive/agent-sessions': 'ignored' },
    };

    await checkAndPromptGitignore(
      config.archivePath,
      workspaceRootUri,
      config,
      logger,
      mockUpdateConfig
    );

    expect(window.showInformationMessage).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it('should return without prompting when decision is already recorded as declined', async () => {
    mockIsGitRepository.mockResolvedValue(true);
    const config: AgentSessionsArchivingConfig = {
      ...baseConfig,
      gitignoreDecisions: { 'docs/archive/agent-sessions': 'declined' },
    };

    await checkAndPromptGitignore(
      config.archivePath,
      workspaceRootUri,
      config,
      logger,
      mockUpdateConfig
    );

    expect(window.showInformationMessage).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it('should record decision as ignored without prompting when path is already git-ignored', async () => {
    mockIsGitRepository.mockResolvedValue(true);
    mockIsGitIgnored.mockResolvedValue(true);

    await checkAndPromptGitignore(
      baseConfig.archivePath,
      workspaceRootUri,
      baseConfig,
      logger,
      mockUpdateConfig
    );

    expect(window.showInformationMessage).not.toHaveBeenCalled();
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        gitignoreDecisions: expect.objectContaining({
          'docs/archive/agent-sessions': 'ignored',
        }),
      })
    );
  });

  it('should write .gitignore entry and record decision when user accepts', async () => {
    mockIsGitRepository.mockResolvedValue(true);
    mockIsGitIgnored.mockResolvedValue(false);
    vi.mocked(window.showInformationMessage).mockResolvedValue(
      'Add to .gitignore' as never
    );
    vi.mocked(workspace.fs.readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(workspace.fs.writeFile).mockResolvedValue(undefined);

    await checkAndPromptGitignore(
      baseConfig.archivePath,
      workspaceRootUri,
      baseConfig,
      logger,
      mockUpdateConfig
    );

    expect(workspace.fs.writeFile).toHaveBeenCalledTimes(1);
    const writeCall = vi.mocked(workspace.fs.writeFile).mock.calls[0];
    expect(writeCall).toBeDefined();
    const writtenBytes = writeCall![1] as Uint8Array;
    const writtenText = new TextDecoder().decode(writtenBytes);
    expect(writtenText).toBe(
      '# Managed by Tangyr Workbench (agent sessions archive)\ndocs/archive/agent-sessions/\n'
    );
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        gitignoreDecisions: expect.objectContaining({
          'docs/archive/agent-sessions': 'ignored',
        }),
      })
    );
  });

  it('should record decision as declined when user explicitly clicks Skip', async () => {
    mockIsGitRepository.mockResolvedValue(true);
    mockIsGitIgnored.mockResolvedValue(false);
    vi.mocked(window.showInformationMessage).mockResolvedValue('Skip' as never);

    await checkAndPromptGitignore(
      baseConfig.archivePath,
      workspaceRootUri,
      baseConfig,
      logger,
      mockUpdateConfig
    );

    expect(workspace.fs.writeFile).not.toHaveBeenCalled();
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        gitignoreDecisions: expect.objectContaining({
          'docs/archive/agent-sessions': 'declined',
        }),
      })
    );
  });

  it('should NOT record any decision when the prompt dialog is dismissed (X-close / ESC)', async () => {
    mockIsGitRepository.mockResolvedValue(true);
    mockIsGitIgnored.mockResolvedValue(false);
    vi.mocked(window.showInformationMessage).mockResolvedValue(undefined as never);

    await checkAndPromptGitignore(
      baseConfig.archivePath,
      workspaceRootUri,
      baseConfig,
      logger,
      mockUpdateConfig
    );

    expect(workspace.fs.writeFile).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it('should not call updateConfig when writeFile fails', async () => {
    mockIsGitRepository.mockResolvedValue(true);
    mockIsGitIgnored.mockResolvedValue(false);
    vi.mocked(window.showInformationMessage).mockResolvedValue(
      'Add to .gitignore' as never
    );
    vi.mocked(workspace.fs.readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(workspace.fs.writeFile).mockRejectedValue(new Error('disk full'));

    await checkAndPromptGitignore(
      baseConfig.archivePath,
      workspaceRootUri,
      baseConfig,
      logger,
      mockUpdateConfig
    );

    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});

describe('writeGitignoreEntry (direct)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws synchronously on invalid archivePath (defensive validator)', async () => {
    await expect(
      writeGitignoreEntry('docs/archive\nbad', workspaceRootUri, logger)
    ).rejects.toThrow(/^Invalid archivePath:/);

    expect(workspace.fs.readFile).not.toHaveBeenCalled();
    expect(workspace.fs.writeFile).not.toHaveBeenCalled();
  });
});
