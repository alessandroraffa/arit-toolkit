import type { TimestampFormat } from '../types';

export function generateTimestamp(format: TimestampFormat, date?: Date): string {
  const targetDate = date ?? new Date();

  switch (format) {
    case 'YYYYMMDD':
      return formatDate(targetDate);
    case 'YYYYMMDDHHmm':
      return `${formatDate(targetDate)}${formatTime(targetDate, false)}`;
    case 'YYYYMMDDHHmmss':
      return `${formatDate(targetDate)}${formatTime(targetDate, true)}`;
    case 'ISO':
      return targetDate.toISOString().replace(/[:.]/g, '-');
    default: {
      const _exhaustiveCheck: never = format;
      return _exhaustiveCheck;
    }
  }
}

export function parseYYYYMMDD(dateStr: string): number {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(4, 6)) - 1;
  const day = Number(dateStr.slice(6, 8));
  return Date.UTC(year, month, day);
}

function formatDate(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatTime(date: Date, includeSeconds: boolean): string {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');

  if (includeSeconds) {
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${hours}${minutes}${seconds}`;
  }

  return `${hours}${minutes}`;
}
