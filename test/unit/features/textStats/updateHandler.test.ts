import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window, workspace } from '../../mocks/vscode';
import type { TextStatsConfig } from '../../../../src/types';
import type { UpdateDeps } from '../../../../src/features/textStats/updateHandler';
import { performUpdate } from '../../../../src/features/textStats/updateHandler';

// Mock js-tiktoken
vi.mock('js-tiktoken', () => {
  const mockEncode = vi.fn((text: string) => text.split(/\s+/).filter(Boolean));
  return {
    getEncoding: vi.fn(() => ({ encode: mockEncode })),
  };
});

// Mock @anthropic-ai/tokenizer
vi.mock('@anthropic-ai/tokenizer', () => ({
  countTokens: vi.fn((text: string) => text.split(/\s+/).filter(Boolean).length),
}));

const defaultConfig: TextStatsConfig = {
  enabled: true,
  delimiter: ' | ',
  unitSpace: true,
  wpm: 200,
  tokenizer: 'o200k',
  includeWhitespace: true,
  tokenSizeLimit: 500_000,
  visibleMetrics: ['chars', 'tokens', 'words', 'lines', 'paragraphs', 'readTime', 'size'],
};

function createMockDeps(): UpdateDeps {
  return {
    item: {
      text: '',
      tooltip: undefined,
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    } as unknown as import('vscode').StatusBarItem,
    controller: {
      computeMetrics: vi.fn().mockResolvedValue({
        chars: 11,
        tokens: 2,
        words: 2,
        paragraphs: 1,
        readingTime: { minutes: 0, seconds: 1 },
      }),
      scheduleUpdate: vi.fn(),
      dispose: vi.fn(),
    } as unknown as import('../../../../src/features/textStats/controller').TextStatsController,
    logger: {
      warn: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as import('../../../../src/core/logger').Logger,
  };
}

function setActiveEditor(editor: unknown): void {
  (window as Record<string, unknown>).activeTextEditor = editor;
}

function createMockEditor(text: string, hasSelection: boolean): unknown {
  const sel = hasSelection
    ? { isEmpty: false, start: { line: 0 }, end: { line: 0, character: text.length } }
    : { isEmpty: true, start: { line: 0 }, end: { line: 0, character: 0 } };
  return {
    document: {
      getText: vi.fn().mockReturnValue(text),
      lineCount: 1,
      uri: { fsPath: '/test.txt' },
    },
    selections: [sel],
  };
}

describe('performUpdate', () => {
  let deps: UpdateDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
  });

  it('should hide item when no active editor', async () => {
    setActiveEditor(undefined);
    await performUpdate(deps, defaultConfig);
    expect(deps.item.hide).toHaveBeenCalled();
  });

  it('should compute and display metrics for full document', async () => {
    setActiveEditor(createMockEditor('hello world', false));
    vi.mocked(workspace.fs.stat).mockResolvedValue({ size: 42 } as never);

    await performUpdate(deps, defaultConfig);

    expect(deps.controller.computeMetrics).toHaveBeenCalledWith(
      'hello world',
      defaultConfig
    );
    expect(deps.item.show).toHaveBeenCalled();
  });

  it('should log warning on error', async () => {
    const errorEditor = {
      document: {
        getText: vi.fn().mockImplementation(() => {
          throw new Error('boom');
        }),
        lineCount: 1,
        uri: { fsPath: '/test.txt' },
      },
      selections: [{ isEmpty: true }],
    };
    setActiveEditor(errorEditor);

    await performUpdate(deps, defaultConfig);

    expect(deps.logger.warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('should handle selection mode', async () => {
    setActiveEditor(createMockEditor('hello', true));

    await performUpdate(deps, defaultConfig);

    expect(deps.controller.computeMetrics).toHaveBeenCalled();
    expect(deps.item.show).toHaveBeenCalled();
  });
});
