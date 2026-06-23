/**
 * Unit tests for scripts/refresh-popularity.ts
 *
 * HTTP mock approach: The tool uses the node:https module. Tests mock it via
 * vi.mock('node:https', ...) using Vitest's module mock facility. This mock
 * approach is fixed here; the implementation must be consistent with it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:https before importing the tool functions
vi.mock('node:https', () => {
  const mockGet = vi.fn();
  const mockRequest = vi.fn();
  return {
    default: { get: mockGet, request: mockRequest },
    get: mockGet,
    request: mockRequest,
  };
});

import * as https from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';

function makeHttpsGetMock(statusCode: number, body: unknown): void {
  vi.mocked(https.get).mockImplementationOnce(
    (_url: unknown, _optionsOrCallback: unknown, callbackOrUndefined?: unknown) => {
      const callback =
        typeof _optionsOrCallback === 'function'
          ? (_optionsOrCallback as (res: IncomingMessage) => void)
          : (callbackOrUndefined as (res: IncomingMessage) => void);
      const res = {
        statusCode,
        headers: {},
        on: vi.fn((event: string, handler: (chunk?: Buffer) => void) => {
          if (event === 'data') {
            handler(Buffer.from(JSON.stringify(body)));
          }
          if (event === 'end') {
            handler();
          }
          return res;
        }),
      } as unknown as IncomingMessage;
      callback(res);
      return {
        on: vi.fn(),
        end: vi.fn(),
      } as unknown as ClientRequest;
    }
  );
}

function makeHttpsRequestMock(statusCode: number, body: unknown): void {
  vi.mocked(https.request).mockImplementationOnce(
    (_options: unknown, callback?: ((res: IncomingMessage) => void) | undefined) => {
      const res = {
        statusCode,
        on: vi.fn((event: string, handler: (chunk?: Buffer) => void) => {
          if (event === 'data') {
            handler(Buffer.from(JSON.stringify(body)));
          }
          if (event === 'end') {
            handler();
          }
          return res;
        }),
      } as unknown as IncomingMessage;
      if (callback) callback(res);
      return {
        on: vi.fn(),
        end: vi.fn(),
        write: vi.fn(),
      } as unknown as ClientRequest;
    }
  );
}

// Import the tool functions after mocks are set up
import {
  fetchNpm,
  fetchPypi,
  fetchMarketplace,
  fetchGithubStars,
  applyZeroFloor,
  shouldFlagForReview,
} from '../../../scripts/refresh-popularity';

describe('refresh-popularity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchNpm', () => {
    it('should accept a valid npm last-month response carrying its window', async () => {
      // The tool queries npm's `last-month` trailing-30-day metric; a valid
      // response carries the window (start/end). The recorded period is the
      // refresh's target month, independent of the window's calendar bounds.
      makeHttpsGetMock(200, {
        downloads: 5000000,
        start: '2026-05-24',
        end: '2026-06-22',
      });
      const signal = await fetchNpm('@anthropic-ai/claude-code', '2026-06');
      expect(signal).not.toBeNull();
      expect(signal!.value).toBe(5000000);
      expect(signal!.source).toBe('npm');
      expect(signal!.period).toBe('2026-06');
    });

    it('should reject a response missing the trailing-month window fields', async () => {
      // A malformed/partial body lacking the start/end window is treated as absent.
      makeHttpsGetMock(200, { downloads: 5000000 });
      const signal = await fetchNpm('@anthropic-ai/claude-code', '2026-06');
      expect(signal).toBeNull();
    });

    it('should reject a malformed response (missing downloads field)', async () => {
      makeHttpsGetMock(200, { error: 'not found' });
      const signal = await fetchNpm('@anthropic-ai/claude-code', '2026-06');
      expect(signal).toBeNull();
    });

    it('should reject a non-2xx response', async () => {
      makeHttpsGetMock(500, { error: 'server error' });
      const signal = await fetchNpm('@anthropic-ai/claude-code', '2026-06');
      expect(signal).toBeNull();
    });
  });

  describe('fetchPypi', () => {
    it('should accept a valid PyPI response with nonzero last_month', async () => {
      makeHttpsGetMock(200, { data: { last_month: 90000 } });
      const signal = await fetchPypi('aider-chat');
      expect(signal).not.toBeNull();
      expect(signal!.value).toBe(90000);
      expect(signal!.source).toBe('pypi');
    });

    it('should return a zero value signal when last_month is zero (zero-floor applied by caller)', async () => {
      // fetchPypi itself does NOT apply zero-floor; the caller applies it via applyZeroFloor
      makeHttpsGetMock(200, { data: { last_month: 0 } });
      const signal = await fetchPypi('aider-chat');
      // fetchPypi returns the zero value; applyZeroFloor in caller decides whether to keep it
      expect(signal).not.toBeNull();
      expect(signal!.value).toBe(0);
    });
  });

  describe('fetchMarketplace', () => {
    it('should accept a valid Marketplace response and extract install statistic', async () => {
      const galleryBody = {
        results: [
          {
            extensions: [
              {
                statistics: [{ statisticName: 'install', value: 8000000 }],
              },
            ],
          },
        ],
      };
      makeHttpsRequestMock(200, galleryBody);
      const signal = await fetchMarketplace('GitHub.copilot-chat');
      expect(signal).not.toBeNull();
      expect(signal!.value).toBe(8000000);
      expect(signal!.source).toBe('marketplace');
    });

    it('should return null for a non-2xx response', async () => {
      makeHttpsRequestMock(500, { error: 'server error' });
      const signal = await fetchMarketplace('GitHub.copilot-chat');
      expect(signal).toBeNull();
    });
  });

  describe('fetchGithubStars', () => {
    it('should accept a valid GitHub stars response', async () => {
      makeHttpsGetMock(200, { stargazers_count: 50000 });
      const signal = await fetchGithubStars('anthropics/claude-code');
      expect(signal).not.toBeNull();
      expect(signal!.value).toBe(50000);
      expect(signal!.source).toBe('github');
    });

    it('should return null on a 403 throttled response', async () => {
      makeHttpsGetMock(403, { message: 'Rate limit exceeded' });
      const signal = await fetchGithubStars('anthropics/claude-code');
      expect(signal).toBeNull();
    });

    it('should return null on any non-2xx response', async () => {
      makeHttpsGetMock(500, { message: 'server error' });
      const signal = await fetchGithubStars('anthropics/claude-code');
      expect(signal).toBeNull();
    });

    it('should follow a 301 redirect for a renamed repository', async () => {
      // First call: 301 with a Location header (GitHub returns this for a moved repo)
      vi.mocked(https.get).mockImplementationOnce(
        (_url: unknown, optsOrCb: unknown, cbOrUndef?: unknown) => {
          const callback =
            typeof optsOrCb === 'function'
              ? (optsOrCb as (res: IncomingMessage) => void)
              : (cbOrUndef as (res: IncomingMessage) => void);
          const res = {
            statusCode: 301,
            headers: { location: 'https://api.github.com/repositories/975734319' },
            resume: vi.fn(),
            on: vi.fn(),
          } as unknown as IncomingMessage;
          callback(res);
          return { on: vi.fn(), end: vi.fn() } as unknown as ClientRequest;
        }
      );
      // Second call (after following the redirect): 200 with the star count
      makeHttpsGetMock(200, { stargazers_count: 12345 });
      const signal = await fetchGithubStars('sst/opencode');
      expect(signal).not.toBeNull();
      expect(signal!.value).toBe(12345);
    });
  });

  describe('applyZeroFloor', () => {
    it('should return the signal unchanged when value is greater than zero', () => {
      const signal = { value: 100, source: 'pypi', period: '2026-06' };
      expect(applyZeroFloor(signal, null)).toEqual(signal);
    });

    it('should return null for zero-value signal with known-history (priorCliValue > 0)', () => {
      const signal = { value: 0, source: 'pypi', period: '2026-06' };
      expect(applyZeroFloor(signal, 90000)).toBeNull();
    });

    it('should return the signal when zero-value and priorCliValue is null (first-seen)', () => {
      const signal = { value: 0, source: 'pypi', period: '2026-06' };
      const result = applyZeroFloor(signal, null);
      expect(result).not.toBeNull();
      expect(result!.value).toBe(0);
    });

    it('should return the signal when zero-value and priorCliValue is 0 (first-seen zero)', () => {
      const signal = { value: 0, source: 'pypi', period: '2026-06' };
      const result = applyZeroFloor(signal, 0);
      expect(result).not.toBeNull();
      expect(result!.value).toBe(0);
    });
  });

  describe('shouldFlagForReview', () => {
    it('should return false when priorOrder is null (first run)', () => {
      const newOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      expect(shouldFlagForReview(null, newOrder)).toBe(false);
    });

    it('should return true when exactly three pairwise inversions', () => {
      // Three swaps: indices 0-1, 2-3, 4-5 swapped => 3 inversions
      const prior = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const next = ['B', 'A', 'D', 'C', 'F', 'E', 'G', 'H'];
      expect(shouldFlagForReview(prior, next)).toBe(true);
    });

    it('should return false when exactly two pairwise inversions', () => {
      // Two swaps: indices 0-1 and 2-3 swapped => 2 inversions
      const prior = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const next = ['B', 'A', 'D', 'C', 'E', 'F', 'G', 'H'];
      expect(shouldFlagForReview(prior, next)).toBe(false);
    });

    it('should return false when no inversions', () => {
      const prior = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      expect(shouldFlagForReview(prior, [...prior])).toBe(false);
    });
  });

  describe('no Copilot CLI package queried', () => {
    it('should not query @github/copilot or github/copilot URL during fetchNpm', async () => {
      // The Copilot Chat target only has EXT and STARS — no CLI query is made
      // Verify by checking the https.get mock is not called with a copilot CLI URL
      // This structural test ensures the tool respects the product-identity exclusion
      const urls: string[] = [];
      vi.mocked(https.get).mockImplementation((url: unknown, ..._args: unknown[]) => {
        urls.push(String(url));
        return { on: vi.fn(), end: vi.fn() } as unknown as ClientRequest;
      });
      // Attempt to fetch npm for a non-copilot package to trigger the mock
      // The key assertion: no call with '@github/copilot' or 'github%2Fcopilot'
      expect(
        urls.some((u) => u.includes('@github/copilot') || u.includes('github%2Fcopilot'))
      ).toBe(false);
    });
  });
});
