export { Logger } from './logger';
export { ConfigManager } from './configManager';
export { CommandRegistry } from './commandRegistry';
export type { CommandHandler } from './commandRegistry';
export { ExtensionStateManager } from './extensionStateManager';
export { ConfigAutoCommitService } from './configAutoCommit';
export { isGitIgnored, hasGitChanges, gitStageAndCommit } from './git';
export { ConfigSectionRegistry, ConfigMigrationService } from './configMigration';
export type { ConfigSectionDefinition } from './configMigration';
