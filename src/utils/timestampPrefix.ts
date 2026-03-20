import type { TimestampFormat } from '../types';
import { parseYYYYMMDD } from './timestamp';

export const PROXIMITY_THRESHOLD_MS: number = 3 * 24 * 60 * 60 * 1000;

export function extractExistingTimestampPrefix(
  name: string,
  format: TimestampFormat,
  separator: string
): string | null {
  switch (format) {
    case 'YYYYMMDD':
      if (/^\d{8}/.test(name) && name[8] === separator) {
        return name.slice(0, 8);
      }
      return null;
    case 'YYYYMMDDHHmm':
      if (/^\d{12}/.test(name) && name[12] === separator) {
        return name.slice(0, 12);
      }
      return null;
    case 'YYYYMMDDHHmmss':
      if (/^\d{14}/.test(name) && name[14] === separator) {
        return name.slice(0, 14);
      }
      return null;
    case 'ISO':
      if (
        /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/.test(name) &&
        name[24] === separator
      ) {
        return name.slice(0, 24);
      }
      return null;
    default: {
      const _exhaustiveCheck: never = format;
      return _exhaustiveCheck;
    }
  }
}

export function parseDateMsFromTimestamp(ts: string, format: TimestampFormat): number {
  switch (format) {
    case 'YYYYMMDD':
    case 'YYYYMMDDHHmm':
    case 'YYYYMMDDHHmmss':
      return parseYYYYMMDD(ts.slice(0, 8));
    case 'ISO':
      return Date.UTC(
        Number(ts.slice(0, 4)),
        Number(ts.slice(5, 7)) - 1,
        Number(ts.slice(8, 10))
      );
    default: {
      const _exhaustiveCheck: never = format;
      return _exhaustiveCheck;
    }
  }
}

export function buildNewName(
  originalName: string,
  correctTimestamp: string,
  format: TimestampFormat,
  separator: string
): string {
  const existingTs = extractExistingTimestampPrefix(originalName, format, separator);

  if (existingTs !== null) {
    const existingDateMs = parseDateMsFromTimestamp(existingTs, format);
    const correctDateMs = parseDateMsFromTimestamp(correctTimestamp, format);

    if (Math.abs(correctDateMs - existingDateMs) <= PROXIMITY_THRESHOLD_MS) {
      return `${correctTimestamp}${separator}${originalName.slice(existingTs.length + separator.length)}`;
    }
  }

  return `${correctTimestamp}${separator}${originalName}`;
}
