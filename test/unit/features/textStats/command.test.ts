import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window } from '../../mocks/vscode';
import {
  createToggleCommand,
  createChangeTokenizerCommand,
} from '../../../../src/features/textStats/command';
import type { TokenizerModel } from '../../../../src/types';

describe('createToggleCommand', () => {
  let isVisible: boolean;
  let onToggle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    isVisible = true;
    onToggle = vi.fn();
  });

  it('should call onToggle with false when currently visible', async () => {
    const cmd = createToggleCommand(() => isVisible, onToggle);
    await cmd();
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('should call onToggle with true when currently hidden', async () => {
    isVisible = false;
    const cmd = createToggleCommand(() => isVisible, onToggle);
    await cmd();
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe('createChangeTokenizerCommand', () => {
  let currentModel: TokenizerModel;
  let onModelChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    currentModel = 'o200k';
    onModelChange = vi.fn();
  });

  it('should show quick pick with tokenizer options', async () => {
    vi.mocked(window.showQuickPick).mockResolvedValue({ label: 'cl100k' } as any);
    const cmd = createChangeTokenizerCommand(() => currentModel, onModelChange);
    await cmd();
    expect(window.showQuickPick).toHaveBeenCalledTimes(1);
  });

  it('should call onModelChange with selected model', async () => {
    vi.mocked(window.showQuickPick).mockResolvedValue({
      label: 'cl100k',
      description: expect.any(String),
    } as any);
    const cmd = createChangeTokenizerCommand(() => currentModel, onModelChange);
    await cmd();
    expect(onModelChange).toHaveBeenCalledWith('cl100k');
  });

  it('should not call onModelChange when user cancels', async () => {
    vi.mocked(window.showQuickPick).mockResolvedValue(undefined);
    const cmd = createChangeTokenizerCommand(() => currentModel, onModelChange);
    await cmd();
    expect(onModelChange).not.toHaveBeenCalled();
  });

  it('should mark current model in quick pick items', async () => {
    vi.mocked(window.showQuickPick).mockResolvedValue(undefined);
    const cmd = createChangeTokenizerCommand(() => currentModel, onModelChange);
    await cmd();
    const items = vi.mocked(window.showQuickPick).mock.calls[0]?.[0] as Array<{
      label: string;
      description: string;
    }>;
    const current = items.find((i) => i.label === 'o200k');
    expect(current?.description).toContain('current');
  });
});
