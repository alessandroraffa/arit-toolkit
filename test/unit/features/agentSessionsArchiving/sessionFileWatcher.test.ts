import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { workspace, Uri } from '../../mocks/vscode';
import { SessionFileWatcher } from '../../../../src/features/agentSessionsArchiving/sessionFileWatcher';
import type { SessionProvider } from '../../../../src/features/agentSessionsArchiving/types';

function createProvider(
  patterns?: { baseUri: unknown; glob: string }[]
): SessionProvider {
  const provider: SessionProvider = {
    name: 'test',
    displayName: 'Test',
    findSessions: vi.fn().mockResolvedValue([]),
  };
  if (patterns) {
    provider.getWatchPatterns = vi.fn().mockReturnValue(patterns);
  }
  return provider;
}

describe('SessionFileWatcher', () => {
  let onChanged: ReturnType<typeof vi.fn>;
  let changeHandler: (() => void) | undefined;
  let createHandler: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    onChanged = vi.fn();
    changeHandler = undefined;
    createHandler = undefined;

    const mockWatcher = {
      onDidChange: vi.fn((cb: () => void) => {
        changeHandler = cb;
        return { dispose: vi.fn() };
      }),
      onDidCreate: vi.fn((cb: () => void) => {
        createHandler = cb;
        return { dispose: vi.fn() };
      }),
      dispose: vi.fn(),
    };
    workspace.createFileSystemWatcher = vi.fn(() => mockWatcher);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create watchers for providers with watch patterns', () => {
    const patterns = [{ baseUri: Uri.file('/sessions'), glob: '*.json' }];
    const provider = createProvider(patterns);
    const watcher = new SessionFileWatcher([provider], onChanged);

    watcher.start('/workspace');

    expect(workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
    watcher.dispose();
  });

  it('should skip providers without getWatchPatterns', () => {
    const provider = createProvider();
    const watcher = new SessionFileWatcher([provider], onChanged);

    watcher.start('/workspace');

    expect(workspace.createFileSystemWatcher).not.toHaveBeenCalled();
    watcher.dispose();
  });

  it('should debounce rapid file changes', () => {
    const patterns = [{ baseUri: Uri.file('/sessions'), glob: '*.json' }];
    const provider = createProvider(patterns);
    const watcher = new SessionFileWatcher([provider], onChanged);

    watcher.start('/workspace');
    changeHandler?.();
    changeHandler?.();
    changeHandler?.();

    expect(onChanged).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    expect(onChanged).toHaveBeenCalledTimes(1);

    watcher.dispose();
  });

  it('should fire callback on file create events', () => {
    const patterns = [{ baseUri: Uri.file('/sessions'), glob: '*.json' }];
    const provider = createProvider(patterns);
    const watcher = new SessionFileWatcher([provider], onChanged);

    watcher.start('/workspace');
    createHandler?.();

    vi.advanceTimersByTime(10_000);
    expect(onChanged).toHaveBeenCalledTimes(1);

    watcher.dispose();
  });

  it('should dispose watchers on stop', () => {
    const mockWatcher = {
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    };
    workspace.createFileSystemWatcher = vi.fn(() => mockWatcher);

    const patterns = [{ baseUri: Uri.file('/sessions'), glob: '*.json' }];
    const provider = createProvider(patterns);
    const watcher = new SessionFileWatcher([provider], onChanged);

    watcher.start('/workspace');
    watcher.stop();

    expect(mockWatcher.dispose).toHaveBeenCalled();
  });

  it('should pass workspaceRootPath to getWatchPatterns', () => {
    const patterns = [{ baseUri: Uri.file('/sessions'), glob: '*.json' }];
    const provider = createProvider(patterns);
    const watcher = new SessionFileWatcher([provider], onChanged);

    watcher.start('/my/workspace');

    expect(provider.getWatchPatterns).toHaveBeenCalledWith('/my/workspace');
    watcher.dispose();
  });

  it('should clear pending debounce on stop', () => {
    const patterns = [{ baseUri: Uri.file('/sessions'), glob: '*.json' }];
    const provider = createProvider(patterns);
    const watcher = new SessionFileWatcher([provider], onChanged);

    watcher.start('/workspace');
    changeHandler?.();
    watcher.stop();

    vi.advanceTimersByTime(10_000);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('should handle multiple providers', () => {
    const p1 = createProvider([{ baseUri: Uri.file('/a'), glob: '*.json' }]);
    const p2 = createProvider([{ baseUri: Uri.file('/b'), glob: '*.jsonl' }]);
    const p3 = createProvider();
    const watcher = new SessionFileWatcher([p1, p2, p3], onChanged);

    watcher.start('/workspace');

    expect(workspace.createFileSystemWatcher).toHaveBeenCalledTimes(2);
    watcher.dispose();
  });
});
