export type TimestampFormat = 'YYYYMMDDHHmm' | 'YYYYMMDD' | 'YYYYMMDDHHmmss' | 'ISO';

export type LogLevel = 'off' | 'error' | 'warn' | 'info' | 'debug';

export type WorkspaceMode = 'single-root' | 'multi-root' | 'no-workspace';

export interface WorkspaceConfig {
  enabled: boolean;
  version?: string;
  versionCode?: number;
}

export interface AgentSessionsArchivingConfig {
  enabled: boolean;
  archivePath: string;
  intervalMinutes: number;
  ignoreSessionsBefore?: string;
}
