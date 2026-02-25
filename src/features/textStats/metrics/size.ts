const BYTES_PER_KB = 1024;
const KB_PER_MB = 1024;
const MIN_KB_DISPLAY = 0.1;

export function formatSize(bytes: number): string {
  if (bytes === 0) {
    return '0 KB';
  }
  const kb = bytes / BYTES_PER_KB;
  if (kb >= KB_PER_MB) {
    const mb = kb / KB_PER_MB;
    return `${mb.toFixed(1)} MB`;
  }
  const rounded = Math.max(MIN_KB_DISPLAY, parseFloat(kb.toFixed(1)));
  return `${rounded.toFixed(1)} KB`;
}
