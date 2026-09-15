export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function today(): string {
  return toLocalDateString(new Date());
}

// Built with the Date constructor rather than by adding 24 hours: this rolls months and
// years over correctly, and lands on *local* midnight across a DST transition, where a
// day is 23 or 25 hours long.
//
// Clamped to at least 1ms because callers re-arm a timer from this value, and a zero or
// negative delay would spin.
export function msUntilNextLocalMidnight(now: Date): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1, midnight.getTime() - now.getTime());
}
