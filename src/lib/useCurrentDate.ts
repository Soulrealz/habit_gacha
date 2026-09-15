import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { msUntilNextLocalMidnight, today } from './date';

/**
 * The current local date as 'YYYY-MM-DD', re-rendering the caller when it changes.
 *
 * Three triggers, because the date can change under a mounted screen three ways:
 *
 * 1. A timer armed for the next local midnight, re-armed after each firing — the app
 *    open and awake.
 * 2. An AppState listener — the phone asleep, where the timer may never fire. This is
 *    the common case: most users close the app at night and open it in the morning.
 * 3. Any other re-render — a caller's focus effect needs no wiring, since this hook
 *    already returns the right value.
 *
 * Setting state to the same string is a no-op in React, so a check that finds no change
 * costs nothing.
 */
export function useCurrentDate(): string {
  const [date, setDate] = useState<string>(today);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    function arm(): void {
      if (cancelled) {
        return;
      }
      timer = setTimeout(() => {
        setDate(today());
        arm();
      }, msUntilNextLocalMidnight(new Date()));
    }

    arm();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || cancelled) {
        return;
      }
      setDate(today());
      // Re-armed from the current clock: the old timer was scheduled against a midnight
      // that may already be in the past.
      clearTimeout(timer);
      arm();
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return date;
}
