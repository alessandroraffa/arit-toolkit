export function countWords(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  return words.length;
}
