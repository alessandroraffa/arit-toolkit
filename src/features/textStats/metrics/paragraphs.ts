export function countParagraphs(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const blocks = text.split(/\n{2,}/);
  return blocks.filter((b) => b.trim().length > 0).length;
}
