export interface ConfigSectionDefinition {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly defaultValue: unknown;
  readonly introducedAtVersionCode: number;
  /**
   * Optional value-migration transform applied by ConfigMigrationService.mergeIntoConfig
   * to an existing section value before stamping the version. Called only when the section
   * key is already present in the config being merged. Use this for field-level rewrites
   * that must happen unconditionally on every migration pass (e.g. changing a default path).
   * The transform must be idempotent.
   */
  readonly migrateValue?: (existing: unknown) => unknown;
}
