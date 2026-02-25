import type { MetricKey, TextStatsConfig } from '../../types';
import type { ReadingTime } from './metrics/readingTime';
import { formatReadingTime } from './metrics/readingTime';

export interface MetricsResult {
  readonly chars: number;
  readonly tokens: number | null;
  readonly words: number;
  readonly lines: number;
  readonly paragraphs: number;
  readonly readingTime: ReadingTime;
  readonly size: string;
}

type SegmentFormatter = (metrics: MetricsResult, config: TextStatsConfig) => string;

function sp(config: TextStatsConfig): string {
  return config.unitSpace ? ' ' : '';
}

const SEGMENT_FORMATTERS: Record<MetricKey, SegmentFormatter> = {
  chars: (m, c) => `${String(m.chars)}${sp(c)}c`,
  tokens: (m, c) => (m.tokens === null ? `—${sp(c)}t` : `${String(m.tokens)}${sp(c)}t`),
  words: (m, c) => `${String(m.words)}${sp(c)}w`,
  lines: (m, c) => `${String(m.lines)}${sp(c)}l`,
  paragraphs: (m, c) => `${String(m.paragraphs)}${sp(c)}p`,
  readTime: (m) => formatReadingTime(m.readingTime),
  size: (m) => m.size,
};

export function formatStatusBarText(
  metrics: MetricsResult,
  config: TextStatsConfig
): string {
  const segments = config.visibleMetrics.map((key) =>
    SEGMENT_FORMATTERS[key](metrics, config)
  );
  return segments.join(config.delimiter);
}

function whitespaceLabel(includeWhitespace: boolean): string {
  return includeWhitespace ? 'with whitespace' : 'without whitespace';
}

export function buildTooltipText(
  metrics: MetricsResult,
  config: TextStatsConfig
): string {
  const lines: string[] = [];
  const ws = whitespaceLabel(config.includeWhitespace);
  lines.push(`Characters: ${String(metrics.chars)} (${ws})`);
  const tokenStr =
    metrics.tokens === null ? '—' : `${String(metrics.tokens)} (${config.tokenizer})`;
  lines.push(`Tokens: ${tokenStr}`);
  lines.push(`Words: ${String(metrics.words)}`);
  lines.push(`Lines: ${String(metrics.lines)}`);
  lines.push(`Paragraphs: ${String(metrics.paragraphs)}`);
  const rt = formatReadingTime(metrics.readingTime);
  lines.push(`Reading time: ${rt} (${String(config.wpm)} wpm)`);
  lines.push(`Size: ${metrics.size}`);
  return lines.join('\n');
}
