import { toLocalDateString, today } from '../date';

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
