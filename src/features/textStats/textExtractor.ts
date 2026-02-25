import { countSelectionLines } from './metrics/lines';

export interface SelectionData {
  readonly text: string;
  readonly isEmpty: boolean;
}

export interface SelectionLineData {
  readonly startLine: number;
  readonly endLine: number;
  readonly endCharacter: number;
}

/**
 * Extract the relevant text from selections or full document.
 * Returns full document text if all selections are empty (cursor-only).
 */
export function extractSelectionText(
  fullText: string,
  selections: readonly SelectionData[]
): string {
  const nonEmpty = selections.filter((s) => !s.isEmpty);
  if (nonEmpty.length === 0) {
    return fullText;
  }
  return nonEmpty.map((s) => s.text).join('');
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
