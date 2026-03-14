import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window, workspace } from '../../mocks/vscode';
import {
  createIncrementCommand,
  createDecrementCommand,
} from '../../../../src/features/markdownHeadings/command';

vi.mock('vscode', () => import('../../mocks/vscode'));

describe('markdownHeadings commands', () => {
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = { debug: vi.fn(), info: vi.fn(), error: vi.fn() };
    window.activeTextEditor = undefined;
  });

  describe('createIncrementCommand', () => {
    describe('from editor (no uri)', () => {
      it('should show error if no active editor', async () => {
        const command = createIncrementCommand(mockLogger);
        await command();

        expect(window.showErrorMessage).toHaveBeenCalledWith(
          'ARIT: No active editor found.'
        );
      });

      it('should show error if active editor is not markdown', async () => {
        window.activeTextEditor = createMockEditor('hello', 'typescript');
        const command = createIncrementCommand(mockLogger);
        await command();

        expect(window.showErrorMessage).toHaveBeenCalledWith(
          'ARIT: This command only works on Markdown files.'
        );
      });

      it('should transform entire document when no selection', async () => {
        const editor = createMockEditor('# Title\n\n## Section', 'markdown');
        window.activeTextEditor = editor;

        const command = createIncrementCommand(mockLogger);
        await command();

        expect(editor.edit).toHaveBeenCalled();
        const editCallback = vi.mocked(editor.edit).mock.calls[0]?.[0];
        const mockBuilder = { replace: vi.fn() };
        editCallback?.(mockBuilder as never);

        expect(mockBuilder.replace).toHaveBeenCalledWith(
          expect.anything(),
          '## Title\n\n### Section'
        );
      });

      it('should transform only selection when selection exists', async () => {
        const fullText = '# Title\n\n## Section\n\n### Subsection';
        const editor = createMockEditor(fullText, 'markdown', {
          start: { line: 2, character: 0 },
          end: { line: 4, character: 14 },
          isEmpty: false,
        });
        window.activeTextEditor = editor;

        const command = createIncrementCommand(mockLogger);
        await command();

        expect(editor.edit).toHaveBeenCalled();
        const editCallback = vi.mocked(editor.edit).mock.calls[0]?.[0];
        const mockBuilder = { replace: vi.fn() };
        editCallback?.(mockBuilder as never);

        expect(mockBuilder.replace).toHaveBeenCalledWith(
          expect.anything(),
          '### Section\n\n#### Subsection'
        );
      });

      it('should show error when transform fails (h6 limit)', async () => {
        const editor = createMockEditor('###### Deep', 'markdown');
        window.activeTextEditor = editor;

        const command = createIncrementCommand(mockLogger);
        await command();

        expect(window.showWarningMessage).toHaveBeenCalledWith(
          'ARIT: Cannot increment: one or more headings are already at level 6 (maximum).'
        );
        expect(editor.edit).not.toHaveBeenCalled();
      });
    });

    describe('from explorer (with uri)', () => {
      it('should read file, transform, and write back', async () => {
        const fileContent = '# Title\n\n## Section';
        const encoded = new TextEncoder().encode(fileContent);
        workspace.fs.readFile = vi.fn().mockResolvedValue(encoded);
        workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
        const uri = { fsPath: '/workspace/doc.md' };

        const command = createIncrementCommand(mockLogger);
        await command(uri as never);

        expect(workspace.fs.readFile).toHaveBeenCalledWith(uri);
        expect(workspace.fs.writeFile).toHaveBeenCalledWith(uri, expect.any(Uint8Array));
        const writtenBytes = vi.mocked(workspace.fs.writeFile).mock
          .calls[0]?.[1] as Uint8Array;
        const writtenText = new TextDecoder().decode(writtenBytes);
        expect(writtenText).toBe('## Title\n\n### Section');
      });

      it('should show error when transform fails from explorer', async () => {
        const fileContent = '###### Deep';
        const encoded = new TextEncoder().encode(fileContent);
        workspace.fs.readFile = vi.fn().mockResolvedValue(encoded);

        const uri = { fsPath: '/workspace/doc.md' };
        const command = createIncrementCommand(mockLogger);
        await command(uri as never);

        expect(window.showWarningMessage).toHaveBeenCalledWith(
          'ARIT: Cannot increment: one or more headings are already at level 6 (maximum).'
        );
        expect(workspace.fs.writeFile).not.toHaveBeenCalled();
      });

      it('should show error for non-markdown files from explorer', async () => {
        const uri = { fsPath: '/workspace/doc.txt' };
        const command = createIncrementCommand(mockLogger);
        await command(uri as never);

        expect(window.showErrorMessage).toHaveBeenCalledWith(
          'ARIT: This command only works on Markdown files.'
        );
      });
    });
  });

  describe('createDecrementCommand', () => {
    it('should decrement headings in editor', async () => {
      const editor = createMockEditor('## Title\n\n### Section', 'markdown');
      window.activeTextEditor = editor;

      const command = createDecrementCommand(mockLogger);
      await command();

      expect(editor.edit).toHaveBeenCalled();
      const editCallback = vi.mocked(editor.edit).mock.calls[0]?.[0];
      const mockBuilder = { replace: vi.fn() };
      editCallback?.(mockBuilder as never);

      expect(mockBuilder.replace).toHaveBeenCalledWith(
        expect.anything(),
        '# Title\n\n## Section'
      );
    });

    it('should show error when transform fails (h1 limit)', async () => {
      const editor = createMockEditor('# Title', 'markdown');
      window.activeTextEditor = editor;

      const command = createDecrementCommand(mockLogger);
      await command();

      expect(window.showWarningMessage).toHaveBeenCalledWith(
        'ARIT: Cannot decrement: one or more headings are already at level 1 (minimum).'
      );
    });

    it('should decrement from explorer', async () => {
      const fileContent = '## Title\n\n### Section';
      const encoded = new TextEncoder().encode(fileContent);
      workspace.fs.readFile = vi.fn().mockResolvedValue(encoded);
      workspace.fs.writeFile = vi.fn().mockResolvedValue(undefined);
      const uri = { fsPath: '/workspace/doc.md' };

      const command = createDecrementCommand(mockLogger);
      await command(uri as never);

      const writtenBytes = vi.mocked(workspace.fs.writeFile).mock
        .calls[0]?.[1] as Uint8Array;
      const writtenText = new TextDecoder().decode(writtenBytes);
      expect(writtenText).toBe('# Title\n\n## Section');
    });
  });
});

function createMockEditor(
  text: string,
  languageId: string,
  selection?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
    isEmpty: boolean;
  }
): {
  document: {
    getText: ReturnType<typeof vi.fn>;
    languageId: string;
    lineAt: ReturnType<typeof vi.fn>;
    lineCount: number;
  };
  selection: {
    start: { line: number; character: number };
    end: { line: number; character: number };
    isEmpty: boolean;
  };
  edit: ReturnType<typeof vi.fn>;
} {
  const lines = text.split('\n');

  const defaultSelection = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
    isEmpty: true,
  };

  const sel = selection ?? defaultSelection;

  return {
    document: {
      getText: vi.fn(
        (range?: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        }) => {
          if (!range) {
            return text;
          }
          const resultLines: string[] = [];
          for (let i = range.start.line; i <= range.end.line; i++) {
            const line = lines[i] ?? '';
            if (i === range.start.line && i === range.end.line) {
              resultLines.push(line.slice(range.start.character, range.end.character));
            } else if (i === range.start.line) {
              resultLines.push(line.slice(range.start.character));
            } else if (i === range.end.line) {
              resultLines.push(line.slice(0, range.end.character));
            } else {
              resultLines.push(line);
            }
          }
          return resultLines.join('\n');
        }
      ),
      languageId,
      lineAt: vi.fn((lineNum: number) => ({
        range: {
          start: { line: lineNum, character: 0 },
          end: { line: lineNum, character: (lines[lineNum] ?? '').length },
        },
      })),
      lineCount: lines.length,
    },
    selection: sel,
    edit: vi.fn().mockResolvedValue(true),
  };
}
