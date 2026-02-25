export interface ReadingTime {
  readonly minutes: number;
  readonly seconds: number;
}

export function calculateReadingTime(wordCount: number, wpm: number): ReadingTime {
  if (wordCount === 0) {
    return { minutes: 0, seconds: 0 };
  }
  const totalSeconds = Math.ceil((wordCount / wpm) * 60);
  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
  };
}

export function formatReadingTime(time: ReadingTime): string {
  return `~${String(time.minutes)}m ${String(time.seconds)}s`;
}
