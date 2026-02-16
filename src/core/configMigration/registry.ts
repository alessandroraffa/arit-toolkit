import type { ConfigSectionDefinition } from './types';

export class ConfigSectionRegistry {
  private readonly sections: ConfigSectionDefinition[] = [];

  public register(section: ConfigSectionDefinition): void {
    this.sections.push(section);
  }

  public getAllSections(): readonly ConfigSectionDefinition[] {
    return this.sections;
  }
}
