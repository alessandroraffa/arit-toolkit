import { describe, it, expect } from 'vitest';
import { ConfigSectionRegistry } from '../../../../src/core/configMigration/registry';
import type { ConfigSectionDefinition } from '../../../../src/core/configMigration/types';

describe('ConfigSectionRegistry', () => {
  function createSection(
    overrides: Partial<ConfigSectionDefinition> = {}
  ): ConfigSectionDefinition {
    return {
      key: 'testSection',
      label: 'Test Section',
      description: 'A test section',
      defaultValue: { enabled: true },
      introducedAtVersionCode: 1001003000,
      ...overrides,
    };
  }

  describe('register', () => {
    it('should register a section', () => {
      const registry = new ConfigSectionRegistry();
      const section = createSection();

      registry.register(section);

      expect(registry.getAllSections()).toHaveLength(1);
      expect(registry.getAllSections()[0]).toBe(section);
    });

    it('should register multiple sections', () => {
      const registry = new ConfigSectionRegistry();
      const section1 = createSection({ key: 'section1' });
      const section2 = createSection({ key: 'section2' });

      registry.register(section1);
      registry.register(section2);

      expect(registry.getAllSections()).toHaveLength(2);
    });
  });

  describe('getAllSections', () => {
    it('should return empty array when no sections registered', () => {
      const registry = new ConfigSectionRegistry();

      expect(registry.getAllSections()).toEqual([]);
    });

    it('should return all registered sections', () => {
      const registry = new ConfigSectionRegistry();
      const section1 = createSection({ key: 'a' });
      const section2 = createSection({ key: 'b' });

      registry.register(section1);
      registry.register(section2);

      const all = registry.getAllSections();
      expect(all).toHaveLength(2);
      expect(all).toContain(section1);
      expect(all).toContain(section2);
    });
  });

  describe('getSectionsAfter', () => {
    it('should return sections introduced after the given version code', () => {
      const registry = new ConfigSectionRegistry();
      const oldSection = createSection({
        key: 'old',
        introducedAtVersionCode: 1001001000,
      });
      const newSection = createSection({
        key: 'new',
        introducedAtVersionCode: 1001003000,
      });

      registry.register(oldSection);
      registry.register(newSection);

      const result = registry.getSectionsAfter(1001002000);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(newSection);
    });

    it('should return empty array when no sections are newer', () => {
      const registry = new ConfigSectionRegistry();
      const section = createSection({ introducedAtVersionCode: 1001001000 });

      registry.register(section);

      expect(registry.getSectionsAfter(1001002000)).toEqual([]);
    });

    it('should not return sections with equal version code', () => {
      const registry = new ConfigSectionRegistry();
      const section = createSection({ introducedAtVersionCode: 1001002000 });

      registry.register(section);

      expect(registry.getSectionsAfter(1001002000)).toEqual([]);
    });

    it('should return all sections when version code is 0', () => {
      const registry = new ConfigSectionRegistry();
      const section1 = createSection({ key: 'a', introducedAtVersionCode: 1001001000 });
      const section2 = createSection({ key: 'b', introducedAtVersionCode: 1001002000 });

      registry.register(section1);
      registry.register(section2);

      expect(registry.getSectionsAfter(0)).toHaveLength(2);
    });
  });
});
