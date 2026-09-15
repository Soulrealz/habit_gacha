# Midnight rollover — decisions taken during implementation

Date: 2026-09-15. Built from
`docs/superpowers/specs/midnight-rollover/September_2026/2026-09-15-midnight-rollover-design.md`
via `docs/superpowers/plans/midnight-rollover/September_2026/2026-09-15-midnight-rollover.md`.

This was the last known defect in the codebase, carried over from the habits vertical.

---

## 1. The scope was smaller than previously recorded

Earlier status notes said "the screens keep rendering yesterday's logs". Reading the code
before designing corrected that in two ways, and both narrowed the work:

- **Writes were never wrong.** `today()` is called fresh inside every service call, so
  `adjustHabitCount` and `awardTickets` always target the correct date. Only the read side
  went stale.
- **Only `TodayScreen` is affected.** `getBalance()` is `SUM(delta)` over the whole ledger
  with no date filter, so the ticket balance never resets at midnight, and neither
  `SummonScreen` nor `CollectionScreen` renders anything date-scoped.

That also meant the fix is **not** the shared cross-vertical seam it was assumed to be.
It is one screen plus one hook.

The user-visible failure was nastier than "counts look stale", though, which is why it was
worth fixing rather than documenting: the reset did not appear at midnight. It appeared
**after the user's next tap**, because that tap was the first thing to re-read the new
date. It read as the app eating their work.

## 2. Detection — three triggers, not one

| Option                                                                       | Pros                                                                          | Cons                                                                                                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Midnight timer + `AppState` listener + the existing focus check (chosen)** | Covers all three ways the date can change under a mounted screen. No polling. | Three triggers to keep coherent, which is why they live in one hook rather than in the screen.              |
| Timer alone                                                                  | Simplest.                                                                     | A JS timer cannot be trusted across a locked phone — and that is the **most common** case, not an edge one. |
| `AppState` alone                                                             | Cheap, covers the common case.                                                | Misses the app left open and awake across midnight, which is precisely the reported bug.                    |
| Poll every N seconds                                                         | Trivial.                                                                      | Wakes the JS thread forever to detect something that happens once a day.                                    |
| Re-read on every tap                                                         | No new machinery.                                                             | This is current behaviour. The reset still lands after the tap, which is the part that reads as data loss.  |

## 3. Refresh **and** explain, rather than refreshing silently

A silent refresh still leaves the user looking at an unexplained reset — just an earlier
one. The notice reuses the banner the screen already has:

> It's a new day — habits reset and your ticket cap is refreshed.

The cap refreshing is the good half of the news and worth saying out loud, since nothing
else in the app ever mentions it.

**Notice precedence** needed a decision. The focus effect clears the notice on every
focus, which would wipe a rollover message the moment the user returned from another tab.
A `rolloverPending` ref guards it: the focus effect skips its clear while a rollover
notice is showing, and the next quick-add tap clears both, since by then the user has
acted on the new day.

## 4. Deliberately not fixed

`adjustHabitCount` captures `logDate` once at the top, so if midnight falls between that
line and the `awardTickets` call, the habit log lands on day N and its ticket on day N+1's
cap. The window is sub-millisecond and self-corrects the next day; closing it means
threading a date parameter through `awardTickets`, the seam both verticals import. A
breaking change to shared interface is not worth a fault nobody can realistically hit.

## 5. A test-infrastructure bug this surfaced

Adding the hook made `npx jest` **hang** rather than fail. The cause was mine and worth
recording, because the symptom is so misleading: the hook arms a real `setTimeout` for the
next midnight, and a timer pending hours out keeps the jest worker alive after every test
has already passed. The suite printed green and then sat there.

`--forceExit` would have hidden it. Instead `src/test-utils/render.tsx` now tracks every
renderer it creates and unmounts them in a module-level `afterEach`, which runs the hook's
cleanup and clears the timer. Registering it in the shared helper rather than per file
means a future screen test cannot forget it.

## 6. Two process notes

- **The design step was mandated and it paid for itself.** `CLAUDE.md` requires new
  behaviour to go through a design step. Doing it caught the two scope errors in §1 before
  any code was written — the fix would otherwise have been built as a shared foundation
  hook consumed by three screens, two of which do not need it.
- **I initially classified this as architectural and said so**, on the assumption that
  both verticals needed a shared date watch. Reading the code disproved that. The spec was
  still written, because the project requires a recorded design step and `src/lib/` is
  foundation-owned, but the implementation is bounded: three files.

---

## Verified

- `npx jest` — **139/139 passing**, 14 suites (18 new: 8 for `msUntilNextLocalMidnight`,
  7 for `useCurrentDate`, 3 for the screen rollover).
- `npx tsc --noEmit` — clean. `npx expo lint` — clean, exit 0.
- `npx expo export --platform android` — exit 0.
- The suite exits on its own, with no `--forceExit`.

The date tests construct their expected instants with the `Date` constructor rather than
hard-coding milliseconds, so they hold in any timezone the suite runs in, and they cover
DST-adjacent behaviour, month, year and leap-day boundaries.

**Still never run on a device.** The `AppState` path in particular has only ever been
exercised against a mocked listener; a real foreground transition is device behaviour.
