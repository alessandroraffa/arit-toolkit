import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window } from '../mocks/vscode';

vi.mock('../../../src/core/git', () => ({
  isGitIgnored: vi.fn(),
  hasGitChanges: vi.fn(),
  gitStageAndCommit: vi.fn(),
}));

const { isGitIgnored, hasGitChanges, gitStageAndCommit } =
  await import('../../../src/core/git');
const { ConfigAutoCommitService } = await import('../../../src/core/configAutoCommit');

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('ConfigAutoCommitService', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
  });

  it('should not prompt when file is gitignored', async () => {
    vi.mocked(isGitIgnored).mockResolvedValue(true);

    const service = new ConfigAutoCommitService(
      '/workspace',
      '.arit-toolkit.jsonc',
      logger as any
    );
    await service.onConfigWritten();

    expect(window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('should not prompt when file has no git changes', async () => {
    vi.mocked(isGitIgnored).mockResolvedValue(false);
    vi.mocked(hasGitChanges).mockResolvedValue(false);

    const service = new ConfigAutoCommitService(
      '/workspace',
      '.arit-toolkit.jsonc',
      logger as any
    );
    await service.onConfigWritten();

    expect(hasGitChanges).toHaveBeenCalledWith('.arit-toolkit.jsonc', '/workspace');
    expect(window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('should prompt and commit when user clicks Commit', async () => {
    vi.mocked(isGitIgnored).mockResolvedValue(false);
    vi.mocked(hasGitChanges).mockResolvedValue(true);
    vi.mocked(window.showInformationMessage).mockResolvedValue('Commit' as any);
    vi.mocked(gitStageAndCommit).mockResolvedValue(undefined);

    const service = new ConfigAutoCommitService(
      '/workspace',
      '.arit-toolkit.jsonc',
      logger as any
    );
    await service.onConfigWritten();

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'ARIT Toolkit: Commit config change?',
      'Commit',
      'Skip'
    );
    expect(gitStageAndCommit).toHaveBeenCalledWith(
      '.arit-toolkit.jsonc',
      'chore: update arit-toolkit config',
      '/workspace'
    );
    expect(logger.info).toHaveBeenCalledWith('Config change committed');
  });

  it('should not commit when user clicks Skip', async () => {
    vi.mocked(isGitIgnored).mockResolvedValue(false);
    vi.mocked(hasGitChanges).mockResolvedValue(true);
    vi.mocked(window.showInformationMessage).mockResolvedValue('Skip' as any);

    const service = new ConfigAutoCommitService(
      '/workspace',
      '.arit-toolkit.jsonc',
      logger as any
    );
    await service.onConfigWritten();

    expect(gitStageAndCommit).not.toHaveBeenCalled();
  });

  it('should not commit when user dismisses notification', async () => {
    vi.mocked(isGitIgnored).mockResolvedValue(false);
    vi.mocked(hasGitChanges).mockResolvedValue(true);
    vi.mocked(window.showInformationMessage).mockResolvedValue(undefined as any);

    const service = new ConfigAutoCommitService(
      '/workspace',
      '.arit-toolkit.jsonc',
      logger as any
    );
    await service.onConfigWritten();

    expect(gitStageAndCommit).not.toHaveBeenCalled();
  });

  it('should log warning when commit fails', async () => {
    vi.mocked(isGitIgnored).mockResolvedValue(false);
    vi.mocked(hasGitChanges).mockResolvedValue(true);
    vi.mocked(window.showInformationMessage).mockResolvedValue('Commit' as any);
    vi.mocked(gitStageAndCommit).mockRejectedValue(new Error('commit failed'));

    const service = new ConfigAutoCommitService(
      '/workspace',
      '.arit-toolkit.jsonc',
      logger as any
    );
    await service.onConfigWritten();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to commit config change')
    );
  });

  it('should cache gitignore status and only check once', async () => {
    vi.mocked(isGitIgnored).mockResolvedValue(true);

    const service = new ConfigAutoCommitService(
      '/workspace',
      '.arit-toolkit.jsonc',
      logger as any
    );
    await service.onConfigWritten();
    await service.onConfigWritten();
    await service.onConfigWritten();

    expect(isGitIgnored).toHaveBeenCalledTimes(1);
  });
});
