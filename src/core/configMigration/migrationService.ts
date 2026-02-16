import * as vscode from 'vscode';
import type { ConfigSectionRegistry } from './registry';
import type { ConfigSectionDefinition } from './types';
import type { Logger } from '../logger';
import { computeVersionCode } from '../../utils';

export class ConfigMigrationService {
  constructor(
    private readonly registry: ConfigSectionRegistry,
    private readonly logger: Logger
  ) {}

  public findMissingSections(
    currentConfig: Record<string, unknown>
  ): ConfigSectionDefinition[] {
    const allSections = this.registry.getAllSections();
    return allSections.filter((section) => !(section.key in currentConfig));
  }

  public async promptForSections(
    sections: readonly ConfigSectionDefinition[]
  ): Promise<ConfigSectionDefinition[]> {
    const accepted: ConfigSectionDefinition[] = [];

    for (const section of sections) {
      const action = await vscode.window.showInformationMessage(
        `ARIT Toolkit: Add ${section.label}? ${section.description}`,
        'Add'
      );
      if (action === 'Add') {
        accepted.push(section);
        this.logger.info(`User accepted config section: ${section.key}`);
      } else {
        this.logger.info(`User declined config section: ${section.key}`);
      }
    }

    return accepted;
  }

  public async migrate(
    currentConfig: Record<string, unknown>,
    configVersionCode: number | undefined,
    extensionVersion: string
  ): Promise<Record<string, unknown> | undefined> {
    const extensionVersionCode = computeVersionCode(extensionVersion);
    const missingSections = this.findMissingSections(currentConfig);
    if (missingSections.length === 0 && configVersionCode === extensionVersionCode) {
      this.logger.debug('Workspace config is up to date');
      return undefined;
    }
    this.logger.info('Workspace config needs migration');
    let accepted: ConfigSectionDefinition[] = [];
    if (missingSections.length > 0) {
      accepted = await this.promptForSections(missingSections);
    } else {
      const action = await vscode.window.showInformationMessage(
        `ARIT Toolkit: Update workspace config to version ${extensionVersion}?`,
        'Update'
      );
      if (action !== 'Update') {
        return undefined;
      }
    }
    return this.mergeIntoConfig(currentConfig, accepted, extensionVersion);
  }

  public mergeIntoConfig(
    existingConfig: Record<string, unknown>,
    acceptedSections: readonly ConfigSectionDefinition[],
    newVersion: string
  ): Record<string, unknown> {
    const merged = { ...existingConfig };

    for (const section of acceptedSections) {
      if (!(section.key in merged)) {
        merged[section.key] = section.defaultValue;
      }
    }

    merged.version = newVersion;
    merged.versionCode = computeVersionCode(newVersion);

    return merged;
  }
}
