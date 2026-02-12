import { vi } from 'vitest';

export const mockOutputChannel = {
  appendLine: vi.fn(),
  show: vi.fn(),
  dispose: vi.fn(),
};

export const mockDisposable = {
  dispose: vi.fn(),
};

export const mockFileSystemWatcher = {
  onDidChange: vi.fn(() => mockDisposable),
  onDidCreate: vi.fn(() => mockDisposable),
  onDidDelete: vi.fn(() => mockDisposable),
  dispose: vi.fn(),
};

export const mockStatusBarItem = {
  text: '',
  tooltip: undefined as unknown,
  command: undefined as string | undefined,
  backgroundColor: undefined as unknown,
  name: undefined as string | undefined,
  show: vi.fn(),
  hide: vi.fn(),
  dispose: vi.fn(),
};

export const window = {
  createOutputChannel: vi.fn(() => mockOutputChannel),
  showErrorMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  showInputBox: vi.fn(),
  showTextDocument: vi.fn(),
  createStatusBarItem: vi.fn(() => ({ ...mockStatusBarItem })),
};

export const workspace = {
  getConfiguration: vi.fn(() => ({
    get: vi.fn((key: string) => {
      const defaults: Record<string, unknown> = {
        timestampFormat: 'YYYYMMDDHHmm',
        timestampSeparator: '-',
        logLevel: 'info',
      };
      return defaults[key];
    }),
  })),
  onDidChangeConfiguration: vi.fn(() => mockDisposable),
  workspaceFolders: undefined as Array<{ uri: { fsPath: string } }> | undefined,
  fs: {
    writeFile: vi.fn(),
    readFile: vi.fn(),
    rename: vi.fn(),
    createDirectory: vi.fn(),
    stat: vi.fn(),
    copy: vi.fn(),
    delete: vi.fn(),
    readDirectory: vi.fn(),
  },
  createFileSystemWatcher: vi.fn(() => mockFileSystemWatcher),
};

export const commands = {
  registerCommand: vi.fn(() => mockDisposable),
};

export const Uri = {
  file: vi.fn((path: string) => ({ fsPath: path })),
  joinPath: vi.fn((base: { fsPath: string }, ...pathSegments: string[]) => ({
    fsPath: `${base.fsPath}/${pathSegments.join('/')}`,
  })),
};

export class EventEmitter {
  private readonly handlers: Array<(data: unknown) => void> = [];

  public readonly event = (handler: (data: unknown) => void): { dispose: () => void } => {
    this.handlers.push(handler);
    return {
      dispose: (): void => {
        const index = this.handlers.indexOf(handler);
        if (index >= 0) {
          this.handlers.splice(index, 1);
        }
      },
    };
  };

  public fire(data?: unknown): void {
    for (const handler of this.handlers) {
      handler(data);
    }
  }

  public dispose(): void {
    this.handlers.length = 0;
  }
}

export class RelativePattern {
  constructor(
    public readonly base: unknown,
    public readonly pattern: string
  ) {}
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

export class MarkdownString {
  public value: string;
  public isTrusted: boolean = false;
  public supportThemeIcons: boolean = false;

  constructor(value: string = '', supportThemeIcons: boolean = false) {
    this.value = value;
    this.supportThemeIcons = supportThemeIcons;
  }

  appendMarkdown(value: string): MarkdownString {
    this.value += value;
    return this;
  }
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export function resetAllMocks(): void {
  vi.clearAllMocks();
}
