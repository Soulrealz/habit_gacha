import { msUntilNextLocalMidnight, toLocalDateString, today } from '../date';

describe('toLocalDateString', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(toLocalDateString(new Date(2026, 8, 12))).toBe('2026-09-12');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('uses local calendar components, not UTC', () => {
    expect(toLocalDateString(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
  });
});

describe('today', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('msUntilNextLocalMidnight', () => {
  // Expected values are constructed, never hard-coded, so these hold in any timezone.
  function expected(now: Date): number {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

  it('counts the remaining milliseconds on an ordinary afternoon', () => {
    const now = new Date(2026, 8, 15, 14, 30, 0, 0);
    expect(msUntilNextLocalMidnight(now)).toBe(expected(now));
  });

  it('returns one second one second before midnight', () => {
    const now = new Date(2026, 8, 15, 23, 59, 59, 0);
    expect(msUntilNextLocalMidnight(now)).toBe(1000);
  });

  it('returns a full day when called exactly at midnight', () => {
    const now = new Date(2026, 8, 15, 0, 0, 0, 0);
    expect(msUntilNextLocalMidnight(now)).toBe(expected(now));
    expect(msUntilNextLocalMidnight(now)).toBeGreaterThan(0);
  });

  it('crosses a month boundary', () => {
    const now = new Date(2026, 8, 30, 23, 0, 0, 0);
    const result = msUntilNextLocalMidnight(now);
    expect(new Date(now.getTime() + result)).toEqual(new Date(2026, 9, 1, 0, 0, 0, 0));
  });

  it('crosses a year boundary', () => {
    const now = new Date(2026, 11, 31, 22, 0, 0, 0);
    const result = msUntilNextLocalMidnight(now);
    expect(new Date(now.getTime() + result)).toEqual(new Date(2027, 0, 1, 0, 0, 0, 0));
  });

  it('crosses a leap day', () => {
    const now = new Date(2028, 1, 28, 12, 0, 0, 0);
    const result = msUntilNextLocalMidnight(now);
    expect(new Date(now.getTime() + result)).toEqual(new Date(2028, 1, 29, 0, 0, 0, 0));
  });

  it('always lands on the next local date, never the same one', () => {
    const now = new Date(2026, 8, 15, 23, 59, 59, 999);
    const landing = new Date(now.getTime() + msUntilNextLocalMidnight(now));
    expect(toLocalDateString(landing)).not.toBe(toLocalDateString(now));
  });

  it('never returns a value that would spin a timer', () => {
    expect(msUntilNextLocalMidnight(new Date())).toBeGreaterThan(0);
  });
});
