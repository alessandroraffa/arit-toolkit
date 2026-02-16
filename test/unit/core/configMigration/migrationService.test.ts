import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window } from '../../mocks/vscode';
import { ConfigMigrationService } from '../../../../src/core/configMigration/migrationService';
import { ConfigSectionRegistry } from '../../../../src/core/configMigration/registry';
import type { ConfigSectionDefinition } from '../../../../src/core/configMigration/types';

describe('ConfigMigrationService', () => {
  let registry: ConfigSectionRegistry;
  let service: ConfigMigrationService;
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const sectionA: ConfigSectionDefinition = {
    key: 'featureA',
    label: 'Feature A',
    description: 'Description of Feature A',
    defaultValue: { enabled: true, path: '/default' },
    introducedAtVersionCode: 1001003000,
  };

  const sectionB: ConfigSectionDefinition = {
    key: 'featureB',
    label: 'Feature B',
    description: 'Description of Feature B',
    defaultValue: { active: false },
    introducedAtVersionCode: 1001004000,
  };

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

  describe('findMissingSections', () => {
    it('should return sections missing from config', () => {
      registry.register(sectionA);
      registry.register(sectionB);
      const config = { enabled: true, version: '1.2.0', versionCode: 1001002000 };

      const missing = service.findMissingSections(config);

      expect(missing).toHaveLength(2);
      expect(missing).toContain(sectionA);
      expect(missing).toContain(sectionB);
    });

    it('should not return sections already present in config', () => {
      registry.register(sectionA);
      const config = { enabled: true, featureA: { enabled: false } };

      const missing = service.findMissingSections(config);

      expect(missing).toHaveLength(0);
    });

    it('should return sections whose key is absent regardless of versionCode', () => {
      registry.register(sectionA); // introduced at 1001003000
      const config = { enabled: true, versionCode: 1001003000 };

      const missing = service.findMissingSections(config);

      expect(missing).toHaveLength(1);
      expect(missing[0]).toBe(sectionA);
    });

    it('should return all missing sections', () => {
      registry.register(sectionA);
      registry.register(sectionB);
      const config = { enabled: true };

      const missing = service.findMissingSections(config);

      expect(missing).toHaveLength(2);
    });

    it('should return empty array when no sections registered', () => {
      const config = { enabled: true };

      const missing = service.findMissingSections(config);

      expect(missing).toHaveLength(0);
    });
  });

  describe('promptForSections', () => {
    it('should return accepted sections', async () => {
      window.showInformationMessage = vi.fn().mockResolvedValue('Add');

      const result = await service.promptForSections([sectionA]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(sectionA);
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'ARIT Toolkit: Add Feature A? Description of Feature A',
        'Add'
      );
    });

    it('should exclude declined sections', async () => {
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);

      const result = await service.promptForSections([sectionA]);

      expect(result).toHaveLength(0);
    });

    it('should handle mixed accept and decline', async () => {
      window.showInformationMessage = vi
        .fn()
        .mockResolvedValueOnce('Add')
        .mockResolvedValueOnce(undefined);

      const result = await service.promptForSections([sectionA, sectionB]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(sectionA);
    });

    it('should return empty array for empty input', async () => {
      const result = await service.promptForSections([]);

      expect(result).toHaveLength(0);
      expect(window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('should log acceptance and decline', async () => {
      window.showInformationMessage = vi
        .fn()
        .mockResolvedValueOnce('Add')
        .mockResolvedValueOnce(undefined);

      await service.promptForSections([sectionA, sectionB]);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'User accepted config section: featureA'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User declined config section: featureB'
      );
    });
  });

  describe('mergeIntoConfig', () => {
    it('should add accepted sections with default values', () => {
      const config = { enabled: true };

      const merged = service.mergeIntoConfig(config, [sectionA], '1.3.0');

      expect(merged['featureA']).toEqual({ enabled: true, path: '/default' });
    });

    it('should not overwrite existing section values', () => {
      const config = { enabled: true, featureA: { enabled: false, path: '/custom' } };

      const merged = service.mergeIntoConfig(config, [sectionA], '1.3.0');

      expect(merged['featureA']).toEqual({ enabled: false, path: '/custom' });
    });

    it('should always update version and versionCode', () => {
      const config = { enabled: true, version: '1.2.0', versionCode: 1001002000 };

      const merged = service.mergeIntoConfig(config, [], '1.3.0');

      expect(merged['version']).toBe('1.3.0');
      expect(merged['versionCode']).toBe(1001003000);
    });

    it('should preserve all existing config keys', () => {
      const config = {
        enabled: true,
        version: '1.2.0',
        versionCode: 1001002000,
        customKey: 'preserved',
      };

      const merged = service.mergeIntoConfig(config, [sectionA], '1.3.0');

      expect(merged['customKey']).toBe('preserved');
      expect(merged['enabled']).toBe(true);
    });

    it('should not mutate the original config', () => {
      const config = { enabled: true };
      const original = { ...config };

      service.mergeIntoConfig(config, [sectionA], '1.3.0');

      expect(config).toEqual(original);
    });

    it('should handle multiple accepted sections', () => {
      const config = { enabled: true };

      const merged = service.mergeIntoConfig(config, [sectionA, sectionB], '1.4.0');

      expect(merged['featureA']).toEqual({ enabled: true, path: '/default' });
      expect(merged['featureB']).toEqual({ active: false });
      expect(merged['version']).toBe('1.4.0');
    });
  });

  describe('migrate', () => {
    it('should return undefined when config is up to date', async () => {
      const config = { enabled: true, version: '1.3.0', versionCode: 1001003000 };

      const result = await service.migrate(config, 1001003000, '1.3.0');

      expect(result).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith('Workspace config is up to date');
    });

    it('should prompt for missing sections and return merged config', async () => {
      registry.register(sectionA);
      window.showInformationMessage = vi.fn().mockResolvedValue('Add');
      const config = { enabled: true, version: '1.2.0', versionCode: 1001002000 };

      const result = await service.migrate(config, 1001002000, '1.3.0');

      expect(result).toBeDefined();
      expect(result!['featureA']).toEqual({ enabled: true, path: '/default' });
      expect(result!['version']).toBe('1.3.0');
      expect(result!['versionCode']).toBe(1001003000);
    });

    it('should return merged config even when user declines all sections', async () => {
      registry.register(sectionA);
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
      const config = { enabled: true, version: '1.2.0', versionCode: 1001002000 };

      const result = await service.migrate(config, 1001002000, '1.3.0');

      expect(result).toBeDefined();
      expect(result!['featureA']).toBeUndefined();
      expect(result!['version']).toBe('1.3.0');
    });

    it('should prompt version update when no missing sections but version differs', async () => {
      window.showInformationMessage = vi.fn().mockResolvedValue('Update');
      const config = { enabled: true, version: '1.2.0', versionCode: 1001002000 };

      const result = await service.migrate(config, 1001002000, '1.3.0');

      expect(result).toBeDefined();
      expect(result!['version']).toBe('1.3.0');
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'ARIT Toolkit: Update workspace config to version 1.3.0?',
        'Update'
      );
    });

    it('should return undefined when user declines version update', async () => {
      window.showInformationMessage = vi.fn().mockResolvedValue(undefined);
      const config = { enabled: true, version: '1.2.0', versionCode: 1001002000 };

      const result = await service.migrate(config, 1001002000, '1.3.0');

      expect(result).toBeUndefined();
    });

    it('should prompt for all sections when configVersionCode is undefined', async () => {
      registry.register(sectionA);
      registry.register(sectionB);
      window.showInformationMessage = vi.fn().mockResolvedValue('Add');
      const config = { enabled: true };

      const result = await service.migrate(config, undefined, '1.4.0');

      expect(result).toBeDefined();
      expect(result!['featureA']).toEqual({ enabled: true, path: '/default' });
      expect(result!['featureB']).toEqual({ active: false });
    });

    it('should re-prompt for previously declined sections on next activation', async () => {
      registry.register(sectionA);
      window.showInformationMessage = vi.fn().mockResolvedValue('Add');
      const config = { enabled: true, version: '1.3.0', versionCode: 1001003000 };

      const result = await service.migrate(config, 1001003000, '1.3.0');

      expect(result).toBeDefined();
      expect(result!['featureA']).toEqual({ enabled: true, path: '/default' });
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'ARIT Toolkit: Add Feature A? Description of Feature A',
        'Add'
      );
    });
  });
});
