export function countCharacters(text: string, includeWhitespace: boolean): number {
  if (includeWhitespace) {
    return text.length;
  }
  return text.replace(/\s/g, '').length;
}
