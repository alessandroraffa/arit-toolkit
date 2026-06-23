/**
 * Consistency tests for the popularity ranking pipeline.
 *
 * These tests read the real committed artifact (popularityData.ts) and the
 * real README.md, and verify that all four generated README regions agree
 * with the artifact's resolvedOrder. No mock of popularityData is used.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { workspace, Uri } from '../../../mocks/vscode';
import type { Logger } from '../../../../../src/core/logger';

// Mock gitignorePrompt to prevent side effects
vi.mock('../../../../../src/features/agentSessionsArchiving/gitignorePrompt', () => ({
  checkAndPromptGitignore: vi.fn().mockResolvedValue(undefined),
}));

import {
  POPULARITY_DATA,
  DISCLAIMER,
  METHOD_POINTER,
} from '../../../../../src/features/agentSessionsArchiving/providers/popularityData';
import { POOL_SIZE_ACKNOWLEDGMENT } from '../../../../../src/features/agentSessionsArchiving/providers/popularityScoring';
import {
  getDefaultProviders,
  providerNameToCanonical,
} from '../../../../../src/features/agentSessionsArchiving/providers/index';

const README_PATH = path.resolve(__dirname, '../../../../..', 'README.md');
const readmeContent = fs.readFileSync(README_PATH, 'utf8');

function extractRegion(
  content: string,
  startDelimiter: string,
  endDelimiter: string
): string {
  const startIdx = content.indexOf(startDelimiter);
  const endIdx = content.indexOf(endDelimiter);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Delimiter pair not found: "${startDelimiter}" / "${endDelimiter}"`);
  }
  return content.substring(startIdx + startDelimiter.length, endIdx).trim();
}

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

function createMockContext(): import('vscode').ExtensionContext {
  const globalStorageUri = Uri.file('/global-storage/tangyr');
  const storageUri = Uri.file('/workspace-storage/tangyr');
  return {
    globalStorageUri,
    storageUri,
  } as unknown as import('vscode').ExtensionContext;
}

describe('popularityConsistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspace.fs.stat = vi.fn().mockRejectedValue(new Error('not found'));
    workspace.fs.readDirectory = vi.fn().mockResolvedValue([]);
  });

  describe('README TABLE region', () => {
    it('TABLE region order matches artifact resolvedOrder', () => {
      const tableRegion = extractRegion(
        readmeContent,
        '<!-- POPULARITY-TABLE:START -->',
        '<!-- POPULARITY-TABLE:END -->'
      );
      // Extract table row names: lines starting with "| " where first cell is not "Assistant" or separator
      const rowNames = tableRegion
        .split('\n')
        .filter(
          (line) =>
            line.startsWith('| ') &&
            !line.startsWith('| ---') &&
            !line.startsWith('| Assistant')
        )
        .map((line) => {
          const cells = line
            .split('|')
            .map((c) => c.trim())
            .filter((c) => c.length > 0);
          return cells[0] ?? '';
        })
        .filter((name) => name.length > 0);

      expect(rowNames).toEqual(Array.from(POPULARITY_DATA.resolvedOrder));
    });

    it('TABLE region disclaimer matches artifact', () => {
      const tableRegion = extractRegion(
        readmeContent,
        '<!-- POPULARITY-TABLE:START -->',
        '<!-- POPULARITY-TABLE:END -->'
      );
      expect(tableRegion).toContain(POPULARITY_DATA.disclaimer);
    });

    it('TABLE region method pointer matches artifact', () => {
      const tableRegion = extractRegion(
        readmeContent,
        '<!-- POPULARITY-TABLE:START -->',
        '<!-- POPULARITY-TABLE:END -->'
      );
      expect(tableRegion).toContain(POPULARITY_DATA.methodPointer);
    });

    it('TABLE region refresh period marker matches artifact', () => {
      const tableRegion = extractRegion(
        readmeContent,
        '<!-- POPULARITY-TABLE:START -->',
        '<!-- POPULARITY-TABLE:END -->'
      );
      expect(tableRegion).toContain(POPULARITY_DATA.refreshPeriod);
    });
  });

  describe('README INTRO region', () => {
    it('INTRO region contains all eight names in resolved order', () => {
      const introRegion = extractRegion(
        readmeContent,
        '<!-- POPULARITY-INTRO:START -->',
        '<!-- POPULARITY-INTRO:END -->'
      );
      const resolvedOrder = Array.from(POPULARITY_DATA.resolvedOrder);
      for (const name of resolvedOrder) {
        expect(introRegion).toContain(name);
      }
      // Also verify the names appear in the correct order
      let lastIdx = -1;
      for (const name of resolvedOrder) {
        const idx = introRegion.indexOf(name);
        expect(idx).toBeGreaterThan(lastIdx);
        lastIdx = idx;
      }
    });
  });

  describe('README FEATURES region', () => {
    it('FEATURES region contains all eight names in resolved order', () => {
      const featuresRegion = extractRegion(
        readmeContent,
        '<!-- POPULARITY-FEATURES:START -->',
        '<!-- POPULARITY-FEATURES:END -->'
      );
      const resolvedOrder = Array.from(POPULARITY_DATA.resolvedOrder);
      for (const name of resolvedOrder) {
        expect(featuresRegion).toContain(name);
      }
      // Also verify the names appear in the correct order
      let lastIdx = -1;
      for (const name of resolvedOrder) {
        const idx = featuresRegion.indexOf(name);
        expect(idx).toBeGreaterThan(lastIdx);
        lastIdx = idx;
      }
    });
  });

  describe('README COUNT region', () => {
    it('COUNT region contains "8"', () => {
      const countRegion = extractRegion(
        readmeContent,
        '<!-- POPULARITY-COUNT:START -->',
        '<!-- POPULARITY-COUNT:END -->'
      );
      expect(countRegion).toBe('8');
    });
  });

  describe('Runtime sort order', () => {
    it('runtime provider sort order matches artifact resolvedOrder', () => {
      const mockContext = createMockContext();
      const mockLogger = createMockLogger();
      const providers = getDefaultProviders(mockContext, mockLogger);
      const runtimeOrder = providers.map((p) => providerNameToCanonical(p.name));
      expect(runtimeOrder).toEqual(Array.from(POPULARITY_DATA.resolvedOrder));
    });
  });

  describe('Artifact integrity', () => {
    it('artifact disclaimer matches DISCLAIMER export', () => {
      expect(POPULARITY_DATA.disclaimer).toBe(DISCLAIMER);
    });

    it('artifact methodPointer matches METHOD_POINTER export', () => {
      expect(POPULARITY_DATA.methodPointer).toBe(METHOD_POINTER);
    });

    it('artifact poolSizeAcknowledgment matches POOL_SIZE_ACKNOWLEDGMENT from popularityScoring', () => {
      expect(POPULARITY_DATA.poolSizeAcknowledgment).toBe(POOL_SIZE_ACKNOWLEDGMENT);
    });
  });
});
