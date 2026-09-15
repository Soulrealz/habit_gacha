# Midnight Rollover — Design

**Date:** 2026-09-15
**Status:** Approved design, pending implementation plan
**Scope:** Make `TodayScreen` notice when the local date changes while the app is open

---

## 1. The defect

`today()` is called fresh inside every service call, so **writes always land on the
correct date**. The staleness is purely on the read side: `TodayScreen` loads its logs
once per focus, and switching tabs does not remount a screen, so nothing re-reads them
when the calendar date moves.

The failure the user actually sees:

> 23:59 — Pull-ups reads `10 / 10 reps ✓`, balance `🎟 5`.
> 00:01 — the screen is unchanged; nothing has told it the day turned over.
> The user taps `+5`, expecting 15. `adjustHabitCount` calls `today()`, gets the **new**
> date, finds no row for it, and writes `count = 5`. `refresh()` reads the new date and
> the row snaps to `5 / 10 reps` with the ✓ gone.

The reset therefore appears to be **caused by the user's tap**, which is the worst
available framing: it reads as the app having eaten their work.

## 2. Scope

**`TodayScreen` only.**

`getBalance()` is `SUM(delta)` across the whole ledger with no date filter, so the ticket
balance never resets at midnight. `SummonScreen` shows that balance, the pity counter and
the last pull; `CollectionScreen` shows owned characters. None of that is date-scoped, so
neither screen can go stale this way.

What _does_ reset at midnight is the **daily ticket cap** — `awardTickets` counts only
today's positive rows. That is intended behaviour and good news for the user, but today
it happens silently.

Out of scope: any change to the ticket seam, the services, or the gacha vertical.

## 3. Approaches considered

| Approach                                                                             | Pros                                                                                                                  | Cons                                                                                                                                                       |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A timer to midnight + an `AppState` listener + the existing focus check (chosen)** | Covers all three ways the date can change under a mounted screen: app awake, app resumed, tab re-entered. No polling. | Three triggers to keep in one place; needs a hook to own them.                                                                                             |
| Timer alone                                                                          | Simplest to reason about.                                                                                             | A JS timer cannot be trusted across a locked phone, which is the **most common** case by far — the user closes the app at night and opens it next morning. |
| `AppState` alone                                                                     | Cheap; catches the common case.                                                                                       | Misses the app left open and awake across midnight, which is precisely the reported bug.                                                                   |
| Poll every N seconds                                                                 | Trivial.                                                                                                              | Wakes the JS thread forever to detect something that happens once a day.                                                                                   |
| Re-read on every tap                                                                 | No new machinery.                                                                                                     | This is essentially current behaviour — the reset still lands _after_ the tap, which is the part that reads as data loss.                                  |

## 4. Design

### 4.1 Pure arithmetic — `src/lib/date.ts`

```ts
msUntilNextLocalMidnight(now: Date): number
```

Returns the milliseconds from `now` to the next local midnight, computed by constructing
`new Date(year, month, day + 1, 0, 0, 0, 0)`. Using the `Date` constructor rather than
adding 24 hours is deliberate: it rolls months and years over correctly and lands on
_local_ midnight across a DST transition, where a day is 23 or 25 hours long.

The result is clamped to a minimum of 1 ms so a caller that re-arms a timer from it can
never spin. Keeping this a pure function is what makes DST and the last second before
midnight testable without timers.

### 4.2 The hook — `src/lib/useCurrentDate.ts`

```ts
useCurrentDate(): string   // 'YYYY-MM-DD', re-renders when the local date changes
```

Holds the current date in state and updates it from three triggers:

1. **A `setTimeout` armed for the next local midnight**, which re-arms itself after
   firing. Handles the app open and awake.
2. **An `AppState` listener** that re-checks on `active` and re-arms the timer. Handles
   the phone being asleep, where the timer may never fire.
3. **The caller's existing focus effect** needs no wiring — the hook already returns the
   right value whenever the screen re-renders.

Setting state to the same string is a no-op in React, so a check that finds no change
costs nothing. Both the timer and the subscription are torn down on unmount.

This lives in `src/lib/` beside `date.ts`, which the module map marks FOUNDATION. It has
one consumer today; it is placed there rather than in the habits vertical because it is
date infrastructure, not habit logic.

### 4.3 Screen behaviour — `src/screens/TodayScreen.tsx`

On a date change the screen re-reads its logs **before the user touches anything**, and
says why, reusing the notice banner that already exists:

> It's a new day — habits reset and your ticket cap is refreshed.

Refreshing silently was rejected: the user would still be looking at an unexplained reset,
just an earlier one. The cap refreshing is the good half of the news and is worth stating.

**Notice precedence.** The focus effect currently clears the notice on every focus, which
would wipe a rollover message when the user returns from another tab. A `rolloverPending`
ref guards it: the focus effect skips its clear while a rollover notice is showing, and
the next quick-add tap clears both the flag and the notice, since by then the user has
acted on the new day.

## 5. Deliberately not fixed

`adjustHabitCount` captures `logDate` once at the top. If midnight falls between that line
and the `awardTickets` call, the habit log lands on day N and its ticket on day N+1's cap.

The window is sub-millisecond and self-corrects the next day. Closing it means threading a
date parameter through `awardTickets`, which is the seam both verticals import — a
breaking change to shared interface for a fault nobody can realistically hit. Recorded
here instead.

## 6. Testing

- **`msUntilNextLocalMidnight`** — pure unit tests: a normal afternoon, one second before
  midnight, exactly midnight, month boundary, year boundary, leap day. Asserted by
  constructing the expected instant rather than hard-coding milliseconds, so the tests
  hold in any timezone the suite runs in.
- **`useCurrentDate`** — fake timers: does not change before midnight, changes when the
  timer fires, re-arms for the following day, updates on `AppState` `active` after the
  clock has moved, and clears its timer and subscription on unmount.
- **`TodayScreen`** — advance the clock across midnight with the screen mounted and assert
  the rows return to zero and the notice appears **with no tap**, that the tick is gone,
  that the balance is unchanged (it is not date-scoped), and that the next tap counts from
  zero rather than appearing to lose work.

## 7. Success criteria

1. With the screen mounted, crossing midnight resets the visible counts and shows the
   rollover notice without any user interaction.
2. Returning to a foregrounded app after midnight does the same.
3. The ticket balance is unchanged across the rollover.
4. A tap after the rollover behaves as a normal first log of the new day.
5. No change to any service, to the ticket seam, or to the gacha vertical.
