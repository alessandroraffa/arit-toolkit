import { countSelectionLines } from './metrics/lines';
import { inferGapSeparator } from './gapSeparator';

export interface SelectionData {
  readonly text: string;
  readonly isEmpty: boolean;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface SelectionLineData {
  readonly startLine: number;
  readonly endLine: number;
  readonly endCharacter: number;
}

/**
 * Extract the relevant text from selections or full document.
 * Returns full document text if all selections are empty (cursor-only).
 * For multiple selections, joins them with context-aware separators
 * that preserve paragraph and word boundaries.
 */
export function extractSelectionText(
  fullText: string,
  selections: readonly SelectionData[]
): string {
  const nonEmpty = selections.filter((s) => !s.isEmpty);
  if (nonEmpty.length === 0) {
    return fullText;
  }
  const sorted = [...nonEmpty].sort((a, b) => a.startOffset - b.startOffset);
  const parts: string[] = [];
  let prev: SelectionData | undefined;
  for (const curr of sorted) {
    if (prev) {
      const gap =
        curr.startOffset > prev.endOffset
          ? fullText.slice(prev.endOffset, curr.startOffset)
          : '';
      parts.push(inferGapSeparator(gap));
    }
    parts.push(curr.text);
    prev = curr;
  }
  return parts.join('');
}

/**
 * Aggregate line counts across multiple selections.
 */
export function aggregateSelectionLines(
  selections: readonly SelectionLineData[]
): number {
  let total = 0;
  for (const sel of selections) {
    total += countSelectionLines(sel.startLine, sel.endLine, sel.endCharacter);
  }
  return total;
}
