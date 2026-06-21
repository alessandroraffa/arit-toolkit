/**
 * Tests for the per-section migrateValue value-migration mechanism.
 * WS-0021 Task 3.1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigMigrationService } from '../../../../src/core/configMigration/migrationService';
import { ConfigSectionRegistry } from '../../../../src/core/configMigration/registry';
import type { ConfigSectionDefinition } from '../../../../src/core/configMigration/types';

describe('ConfigMigrationService — migrateValue', () => {
  let registry: ConfigSectionRegistry;
  let service: ConfigMigrationService;
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const HISTORICAL_DEFAULT = 'docs/archive/agent-sessions';
  const NEW_DEFAULT = '.tangyr/agent-sessions';

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ConfigSectionRegistry();
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };
    service = new ConfigMigrationService(registry, mockLogger as any);
  });

  function makeArchivingSection(
    migrateValue?: (existing: unknown) => unknown
  ): ConfigSectionDefinition {
    return {
      key: 'agentSessionsArchiving',
      label: 'Agent Sessions Archiving',
      description: 'Periodically archive AI coding assistant chat sessions',
      defaultValue: {
        enabled: true,
        archivePath: NEW_DEFAULT,
        intervalMinutes: 5,
      },
      introducedAtVersionCode: 1001003000,
      ...(migrateValue !== undefined ? { migrateValue } : {}),
    };
  }

  function archivePathMigrate(existing: unknown): unknown {
    if (existing === null || existing === undefined || typeof existing !== 'object') {
      return existing;
    }
    const section = existing as Record<string, unknown>;
    const current = section.archivePath;
    if (!current || current === HISTORICAL_DEFAULT) {
      return { ...section, archivePath: NEW_DEFAULT };
    }
    return section;
  }

  it('migrateValue rewrites historical default archivePath to new default', () => {
    registry.register(makeArchivingSection(archivePathMigrate));

    const existing = {
      enabled: true,
      version: '2.0.0',
      versionCode: 1002000000,
      agentSessionsArchiving: {
        enabled: true,
        archivePath: HISTORICAL_DEFAULT,
        intervalMinutes: 5,
      },
    };

    const merged = service.mergeIntoConfig(existing, [], '2.1.0');

    expect(
      (merged['agentSessionsArchiving'] as Record<string, unknown>)['archivePath']
    ).toBe(NEW_DEFAULT);
  });

  it('migrateValue rewrites absent archivePath to new default', () => {
    registry.register(makeArchivingSection(archivePathMigrate));

    const existing = {
      enabled: true,
      version: '2.0.0',
      versionCode: 1002000000,
      agentSessionsArchiving: {
        enabled: true,
        intervalMinutes: 5,
      },
    };

    const merged = service.mergeIntoConfig(existing, [], '2.1.0');

    expect(
      (merged['agentSessionsArchiving'] as Record<string, unknown>)['archivePath']
    ).toBe(NEW_DEFAULT);
  });

  it('migrateValue preserves a custom archivePath that is not the historical default', () => {
    registry.register(makeArchivingSection(archivePathMigrate));

    const existing = {
      enabled: true,
      version: '2.0.0',
      versionCode: 1002000000,
      agentSessionsArchiving: {
        enabled: true,
        archivePath: 'my/custom/path',
        intervalMinutes: 5,
      },
    };

    const merged = service.mergeIntoConfig(existing, [], '2.1.0');

    expect(
      (merged['agentSessionsArchiving'] as Record<string, unknown>)['archivePath']
    ).toBe('my/custom/path');
  });

  it('migrateValue is idempotent: new default → unchanged', () => {
    registry.register(makeArchivingSection(archivePathMigrate));

    const existing = {
      enabled: true,
      version: '2.1.0',
      versionCode: 1002001000,
      agentSessionsArchiving: {
        enabled: true,
        archivePath: NEW_DEFAULT,
        intervalMinutes: 5,
      },
    };

    const merged = service.mergeIntoConfig(existing, [], '2.1.0');

    expect(
      (merged['agentSessionsArchiving'] as Record<string, unknown>)['archivePath']
    ).toBe(NEW_DEFAULT);
  });

  it('migrateValue is applied by mergeIntoConfig for registered sections', () => {
    const migrateValue = vi.fn((v: unknown) => v);
    registry.register(makeArchivingSection(migrateValue));

    const existing = {
      enabled: true,
      agentSessionsArchiving: { enabled: true, archivePath: HISTORICAL_DEFAULT },
    };

    service.mergeIntoConfig(existing, [], '2.1.0');

    expect(migrateValue).toHaveBeenCalledExactlyOnceWith({
      enabled: true,
      archivePath: HISTORICAL_DEFAULT,
    });
  });

  it('migrateValue is NOT applied for sections not present in merged config', () => {
    const migrateValue = vi.fn((v: unknown) => v);
    registry.register(makeArchivingSection(migrateValue));

    // agentSessionsArchiving key absent from existing config
    const existing = {
      enabled: true,
      version: '1.0.0',
      versionCode: 1001000000,
    };

    service.mergeIntoConfig(existing, [], '2.1.0');

    expect(migrateValue).not.toHaveBeenCalled();
  });

  it('section without migrateValue is unaffected', () => {
    const section: ConfigSectionDefinition = {
      key: 'someFeature',
      label: 'Some Feature',
      description: 'desc',
      defaultValue: { val: 'default' },
      introducedAtVersionCode: 1001000000,
      // no migrateValue
    };
    registry.register(section);

    const existing = {
      enabled: true,
      someFeature: { val: 'preserved' },
    };

    const merged = service.mergeIntoConfig(existing, [], '2.1.0');

    expect((merged['someFeature'] as Record<string, unknown>)['val']).toBe('preserved');
  });
});
