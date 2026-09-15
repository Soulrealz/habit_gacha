# Midnight Rollover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `TodayScreen` notice when the local calendar date changes while the app is open, so the day's counts reset visibly and with an explanation instead of appearing to vanish after the user's next tap.

**Architecture:** Pure midnight arithmetic in `src/lib/date.ts`, a `useCurrentDate` hook in `src/lib/` that watches for the date changing via a self-re-arming timer plus an `AppState` listener, and a `TodayScreen` effect that re-reads and posts a notice when the returned date changes.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, Jest via `jest-expo`, `react-test-renderer` 19.2.3.

**Spec:** `docs/superpowers/specs/midnight-rollover/September_2026/2026-09-15-midnight-rollover-design.md`

## Global Constraints

- **Do not commit.** The repo owner makes every commit themselves. Leave all work in the working tree; run no `git add`, `git commit`, `git checkout`, `git stash`, or `git reset`. Read-only git is fine. This overrides the commit step any task template implies.
- This change touches exactly three source files: `src/lib/date.ts`, `src/lib/useCurrentDate.ts` (new), `src/screens/TodayScreen.tsx`. Do not modify any service, `src/services/tickets/` above all — the ticket seam is shared with the gacha vertical.
- All dates come from `src/lib/date.ts`. Never call `toISOString().slice(0, 10)`.
- Named exports only. Strict TypeScript; no `any`; explicit types on public signatures.
- Formatting is Prettier-owned — run `npx prettier --write .`. Lint with `npx expo lint`.
- Tests must pass in **any** timezone. Never hard-code a millisecond count or a UTC offset; build expected instants with the `Date` constructor.

---

### Task 1: Midnight arithmetic

**Files:**

- Modify: `src/lib/date.ts`
- Test: `src/lib/__tests__/date.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `msUntilNextLocalMidnight(now: Date): number`.

Kept pure and separate from the hook so the genuinely fiddly parts — DST, the last second before midnight, month and year boundaries — are testable without timers or a mounted component.

Note the clamp to a minimum of 1. A caller re-arms a timer from this value, and a zero or negative delay would spin.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/date.test.ts`:

```ts
import { msUntilNextLocalMidnight, toLocalDateString, today } from '../date';

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
```

Replace the existing import line at the top of the file with the one above — the file already imports `toLocalDateString` and `today`.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/lib
```

Expected: FAIL — `msUntilNextLocalMidnight is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/date.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/lib
```

Expected: PASS — 4 existing tests plus 8 new ones.

- [ ] **Step 5: Verify nothing else broke**

```bash
npx tsc --noEmit
npx expo lint
```

Expected: both silent. **Do not commit** (see Global Constraints).

---

### Task 2: The date-watching hook

**Files:**

- Create: `src/lib/useCurrentDate.ts`
- Test: `src/lib/__tests__/useCurrentDate.test.tsx`

**Interfaces:**

- Consumes: `today()` and `msUntilNextLocalMidnight()` from `src/lib/date` (Task 1).
- Produces: `useCurrentDate(): string` — the local date as `'YYYY-MM-DD'`, re-rendering the caller when it changes.

Three triggers, because the date can change under a mounted screen three ways. The timer covers the app open and awake. The `AppState` listener covers the phone having been asleep, where a JS timer cannot be trusted to have fired — and that is the common case, since most users close the app at night and open it in the morning. The caller's existing focus effect needs no wiring: the hook already returns the right value on any re-render.

Setting state to the same string is a no-op in React, so a check that finds no change is free.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/useCurrentDate.test.tsx`:

```tsx
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { AppState } from 'react-native';
import { useCurrentDate } from '../useCurrentDate';

function Probe() {
  return <Text>{useCurrentDate()}</Text>;
}

function shown(renderer: ReactTestRenderer): string {
  return renderer.root.findByType(Text).props.children as string;
}

function render(): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Probe />);
  });
  return renderer;
}

describe('useCurrentDate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 15, 23, 59, 50, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('starts on the current local date', () => {
    expect(shown(render())).toBe('2026-09-15');
  });

  it('does not change before midnight', () => {
    const renderer = render();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(shown(renderer)).toBe('2026-09-15');
  });

  it('changes when the clock passes midnight', () => {
    const renderer = render();
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(shown(renderer)).toBe('2026-09-16');
  });

  it('re-arms for the following midnight', () => {
    const renderer = render();
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(shown(renderer)).toBe('2026-09-16');

    act(() => {
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    });
    expect(shown(renderer)).toBe('2026-09-17');
  });

  it('catches up when the app returns to the foreground', () => {
    let handler: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      listener: (state: string) => void,
    ) => {
      handler = listener;
      return { remove: jest.fn() };
    }) as never);

    const renderer = render();
    expect(shown(renderer)).toBe('2026-09-15');

    // The phone was asleep: the clock moved but no timer fired.
    jest.setSystemTime(new Date(2026, 8, 16, 8, 0, 0, 0));
    act(() => {
      handler?.('active');
    });

    expect(shown(renderer)).toBe('2026-09-16');
  });

  it('ignores a background transition', () => {
    let handler: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      listener: (state: string) => void,
    ) => {
      handler = listener;
      return { remove: jest.fn() };
    }) as never);

    const renderer = render();
    jest.setSystemTime(new Date(2026, 8, 16, 8, 0, 0, 0));
    act(() => {
      handler?.('background');
    });

    expect(shown(renderer)).toBe('2026-09-15');
  });

  it('clears its timer and subscription on unmount', () => {
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({ remove })) as never);

    const renderer = render();
    act(() => {
      renderer.unmount();
    });

    expect(remove).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/lib/__tests__/useCurrentDate.test.tsx
```

Expected: FAIL — "Cannot find module '../useCurrentDate'".

- [ ] **Step 3: Write the hook**

Create `src/lib/useCurrentDate.ts`:

```ts
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
 * 3. Any other re-render — the caller's focus effect needs no wiring, since this hook
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
      // Re-armed from the current clock: the old timer was scheduled against a
      // midnight that may already be in the past.
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/lib/__tests__/useCurrentDate.test.tsx
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Verify the whole suite and the types**

```bash
npx jest
npx tsc --noEmit
npx expo lint
```

Expected: all clean. **Do not commit.**

---

### Task 3: Rolling over on screen

**Files:**

- Modify: `src/screens/TodayScreen.tsx`
- Test: `src/screens/__tests__/TodayScreen.test.tsx`

**Interfaces:**

- Consumes: `useCurrentDate()` from `src/lib/useCurrentDate` (Task 2).
- Produces: no new exports. `TodayScreen` keeps its name and signature so `src/navigation/index.tsx` needs no edit.

The screen re-reads **before the user touches anything** and says why, reusing the notice banner that already exists.

The notice-precedence problem is the part to get right. The focus effect currently clears the notice on every focus, which would wipe a rollover message the moment the user came back from another tab. A `rolloverPending` ref guards it: the focus effect skips its clear while a rollover notice is showing, and the next quick-add tap clears both the flag and the notice, since by then the user has acted on the new day.

- [ ] **Step 1: Write the failing tests**

Append to `src/screens/__tests__/TodayScreen.test.tsx`. The file already mocks `@react-navigation/native`, `../../services/habits` and `../../services/tickets`, and already defines `store`, `add`, and `press` — reuse them.

```tsx
describe('Today screen midnight rollover', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 15, 23, 59, 50, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resets the visible counts and explains why, with no tap', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);
    await press(renderer, add(10));
    expect(textContent(renderer)).toContain('10 / 10 reps');
    expect(textContent(renderer)).toContain('Pull-ups ✓');

    // The day turns over while the screen sits open. The store is keyed by habit id in
    // this fake, so clearing it is what "a new log_date" means here.
    store.counts = {};
    store.completedAt = {};

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await settle();

    const text = textContent(renderer);
    expect(text).toContain('0 / 10 reps');
    expect(text).not.toContain('Pull-ups ✓');
    expect(text).toContain('It’s a new day');
  });

  it('leaves the ticket balance alone, because it is not date-scoped', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);
    await press(renderer, add(10));
    expect(textContent(renderer)).toContain('🎟 1');

    store.counts = {};
    store.completedAt = {};

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await settle();

    expect(textContent(renderer)).toContain('🎟 1');
  });

  it('counts the next tap from zero instead of appearing to lose work', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);
    await press(renderer, add(10));

    store.counts = {};
    store.completedAt = {};

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await settle();

    await press(renderer, add(5));

    const text = textContent(renderer);
    expect(text).toContain('5 / 10 reps');
    expect(text).not.toContain('It’s a new day');
  });
});
```

Add `act` and `settle` to the existing import from `../../test-utils/render`, and import `act` from `react-test-renderer`:

```tsx
import { act } from 'react-test-renderer';
import { press, renderAndSettle, settle, textContent } from '../../test-utils/render';
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/screens/__tests__/TodayScreen.test.tsx
```

Expected: FAIL — the counts still read `10 / 10 reps` and no notice appears, because nothing watches the date yet.

- [ ] **Step 3: Wire the hook into the screen**

In `src/screens/TodayScreen.tsx`:

Add to the imports:

```tsx
import { useEffect } from 'react';
import { useCurrentDate } from '../lib/useCurrentDate';
```

(`useEffect` joins the existing `import { useCallback, useRef, useState } from 'react';` — make it `import { useCallback, useEffect, useRef, useState } from 'react';` rather than adding a second react import.)

Add this constant above the component:

```tsx
const ROLLOVER_NOTICE = 'It’s a new day — habits reset and your ticket cap is refreshed.';
```

Inside the component, after the `generation` ref:

```tsx
const currentDate = useCurrentDate();
const lastSeenDate = useRef(currentDate);
// Set while a rollover notice is showing, so the focus effect does not wipe it when
// the user comes back from another tab.
const rolloverPending = useRef(false);
```

After the existing `useFocusEffect` block, add:

```tsx
// Re-reads before the user touches anything. Without this the stale counts survive
// until the next tap, and the reset then looks like the tap destroyed their work.
useEffect(() => {
  if (lastSeenDate.current === currentDate) {
    return;
  }
  lastSeenDate.current = currentDate;
  rolloverPending.current = true;
  setNotice({ text: ROLLOVER_NOTICE, tone: 'info' });
  refresh().catch(() => {
    setNotice({ text: 'Could not load today’s habits.', tone: 'error' });
  });
}, [currentDate, refresh]);
```

Change the focus effect's clear from `setNotice(null);` to:

```tsx
if (!rolloverPending.current) {
  setNotice(null);
}
```

In `handleAdd`, replace the existing `setNotice(null);` near the top with:

```tsx
rolloverPending.current = false;
setNotice(null);
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/screens/__tests__/TodayScreen.test.tsx
```

Expected: PASS — the 6 existing walkthrough tests, the failure-handling test, and the 3 new rollover tests.

- [ ] **Step 5: Verify everything**

```bash
npx jest
npx tsc --noEmit
npx expo lint
npx expo export --platform android --output-dir "$TEMP/hg-rollover-check"
```

Expected: all clean, export exit 0. **Do not commit.**

---

### Task 4: Record the outcome

**Files:**

- Modify: `docs/status/OPEN-ITEMS.md`
- Modify: `docs/decisions.md`
- Modify: `docs/architecture.md`

No code. The project's convention is that a resolved item leaves the open list and a design decision lands in the log.

- [ ] **Step 1: Close the item in `OPEN-ITEMS.md`**

Remove the "Midnight rollover" bullet from the `## Known-minor` section and the numbered "Midnight rollover" entry from `## Next steps`, renumbering what follows. Do not touch the four unconfirmed device checks — they remain open.

- [ ] **Step 2: Add the decision to `docs/decisions.md`**

Newest at top, matching the existing entry format:

```markdown
### 2026-09-15 — The Today screen watches the local date

- **Decision**: `useCurrentDate` in `src/lib/` watches for the local date changing via a
  self-re-arming midnight timer plus an `AppState` listener, and `TodayScreen` re-reads
  and posts a notice when it changes.
- **Why**: `today()` is called fresh on every write, so writes were always correct — but
  the screen never re-read, so crossing midnight left stale counts on screen until the
  next tap. The reset then appeared to be _caused by the tap_, which reads as the app
  eating the user's work.
- **Decision**: Refresh **and** explain, rather than refreshing silently. A silent reset
  is still an unexplained reset; the cap refreshing is the good half of the news.
- **Scope**: `TodayScreen` only. `getBalance()` is `SUM(delta)` with no date filter, so
  the balance never resets and neither gacha screen renders date-scoped data.
- **Not fixed**: `adjustHabitCount` captures `logDate` once, so midnight falling between
  that line and `awardTickets` puts the log on day N and the ticket on day N+1. Closing
  it means a breaking change to the shared ticket seam for a sub-millisecond window.
- **Status**: Written and unit-tested; **never run on a device.**
```

- [ ] **Step 3: Update `docs/architecture.md`**

In the "Current state" section, note that the Today screen now watches the local date. Leave the "never run on a device" caveat exactly as it stands.

- [ ] **Step 4: Verify the docs are formatted**

```bash
npx prettier --write docs/
npx jest
```

Expected: tests still pass. **Do not commit** — hand the working tree to the repo owner.

---

## Done when

- `npx jest` passes, including the 8 new date tests, 7 hook tests, and 3 rollover tests.
- `npx tsc --noEmit` and `npx expo lint` are both silent.
- `npx expo export --platform android` exits 0.
- Crossing midnight with the screen mounted resets the visible counts and shows the notice
  **with no user interaction**; the ticket balance is unchanged; the next tap counts from
  zero.
- No file outside `src/lib/date.ts`, `src/lib/useCurrentDate.ts`, `src/screens/TodayScreen.tsx`,
  their tests, and the three docs has been modified.
- Everything is left uncommitted for the repo owner.
