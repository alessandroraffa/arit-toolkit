import type { ConfigSectionDefinition } from './types';

export class ConfigSectionRegistry {
  private readonly sections: ConfigSectionDefinition[] = [];

  public register(section: ConfigSectionDefinition): void {
    this.sections.push(section);
  }

  public getSectionsAfter(versionCode: number): ConfigSectionDefinition[] {
    return this.sections.filter((s) => s.introducedAtVersionCode > versionCode);
  }

  public getAllSections(): readonly ConfigSectionDefinition[] {
    return this.sections;
  }
}
