import { vi } from 'vitest';

export const mockOutputChannel = {
  appendLine: vi.fn(),
  show: vi.fn(),
  dispose: vi.fn(),
};

export const mockDisposable = {
  dispose: vi.fn(),
};

export const window = {
  createOutputChannel: vi.fn(() => mockOutputChannel),
  showErrorMessage: vi.fn(),
  showInputBox: vi.fn(),
  showTextDocument: vi.fn(),
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
  workspaceFolders: undefined,
  fs: {
    writeFile: vi.fn(),
    rename: vi.fn(),
  },
};

export const commands = {
  registerCommand: vi.fn(() => mockDisposable),
};

export const Uri = {
  file: vi.fn((path: string) => ({ fsPath: path })),
};

export function resetAllMocks(): void {
  vi.clearAllMocks();
}
