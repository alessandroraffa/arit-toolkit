export interface ConfigSectionDefinition {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly defaultValue: unknown;
  readonly introducedAtVersionCode: number;
}
