import * as vscode from 'vscode';
import type { TokenizerModel } from '../../types';

interface TokenizerOption {
  readonly label: string;
  readonly description: string;
}

const TOKENIZER_OPTIONS: readonly { model: TokenizerModel; covers: string }[] = [
  { model: 'o200k', covers: 'GPT-4o, GPT-4o mini' },
  { model: 'cl100k', covers: 'GPT-4, GPT-4 Turbo, GPT-3.5 Turbo' },
  { model: 'claude', covers: 'Claude model family' },
];

export function createToggleCommand(
  getVisible: () => boolean,
  onToggle: (visible: boolean) => void
): () => Promise<void> {
  return (): Promise<void> => {
    onToggle(!getVisible());
    return Promise.resolve();
  };
}

export function createChangeTokenizerCommand(
  getCurrentModel: () => TokenizerModel,
  onModelChange: (model: TokenizerModel) => void
): () => Promise<void> {
  return async (): Promise<void> => {
    const current = getCurrentModel();
    const items: TokenizerOption[] = TOKENIZER_OPTIONS.map((opt) => ({
      label: opt.model,
      description: opt.model === current ? `${opt.covers} (current)` : opt.covers,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select tokenizer model',
    });
    if (picked) {
      onModelChange(picked.label as TokenizerModel);
    }
  };
}
