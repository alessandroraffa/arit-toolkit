export type TimestampFormat = 'YYYYMMDDHHmm' | 'YYYYMMDD' | 'YYYYMMDDHHmmss' | 'ISO';

export type LogLevel = 'off' | 'error' | 'warn' | 'info' | 'debug';

export interface Feature {
  readonly id: string;
  readonly commandId: string;
  register(): void;
}
