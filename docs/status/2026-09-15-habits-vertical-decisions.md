# Habits vertical — decisions taken during implementation

Date: 2026-09-15. Built by a Claude Code session from
`docs/superpowers/plans/core-loop/September_2026/2026-09-12-habits-vertical.md`,
with two review agents (code review; Expo SDK 57 API verification against the
versioned docs, as `AGENTS.md` requires).

This records the judgement calls made without a human in the loop, so they can be
overturned cheaply rather than re-litigated. Anything that survives review should
graduate into `docs/decisions.md`.

---

## 1. Which open item to take up

| Option                       | Pros                                                                                                                                                                                          | Cons                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Habits vertical (chosen)** | Unblocked by the foundation merge. Produces the ticket supply the gacha vertical consumes, so it is the half that makes the other half demonstrable. Plan is specified down to file contents. | Ends in a device walkthrough that cannot run here, so it lands "statically verified" like the foundation did.                        |
| Gacha vertical               | Equally unblocked; more visually interesting.                                                                                                                                                 | It _spends_ tickets. With no habit loop there is no natural way to earn them, so its walkthrough would need hand-seeded ledger rows. |
| The four device checks       | Highest-value item in the file — everything downstream rests on them.                                                                                                                         | Impossible on this machine: no Android SDK, emulator, or device. Attempting it would produce a fake pass.                            |

**Consequence:** the seven-step device walkthrough (plan Task 5, Step 3) is **not
done**. It is the one gate this work has not cleared.

## 2. No commits, no branch

The plan ends every task with `git commit`; `CLAUDE.md` requires a
`feat/habit-tracking` branch off `master`.

| Option                                             | Pros                                                                              | Cons                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Leave uncommitted in the working tree (chosen)** | Matches the repo owner's standing preference — they make every commit themselves. | Diverges from the plan text and the branch convention; the owner must create the branch before committing. |
| Branch + commit per task as written                | Faithful to the plan; clean history.                                              | Overrides an explicit standing preference; `git checkout -b` is itself a mutating command.                 |

**Action required from you:** create `feat/habit-tracking` and commit there, not on
`master`. Nothing is staged.

## 3. 🔴 `withExclusiveTransactionAsync` does not serialise — the one real finding

Both review agents landed on this independently, and it was then confirmed by reading
`node_modules/expo-sqlite/build/SQLiteDatabase.js:155`. The function opens a new
connection and issues a **deferred** `BEGIN`, not `BEGIN EXCLUSIVE`, and does not queue
callers. With no `busy_timeout` set anywhere, the losing caller of two overlapping
writes gets `SQLITE_BUSY` — "database is locked" — immediately.

This contradicts the spec, which assumes the second caller reads stale data and returns
`false`. It throws instead. Two fast taps on the same quick-add button are exactly that
race, and as the plan's code was written the rejection would have been an unhandled
promise rejection: the tap silently does nothing.

The nastiest variant: the habit transaction **commits** (`completed_at` stamped) and
then `awardTickets` throws. The award-once rule then blocks any retry and the ticket is
gone permanently.

| Option                                                                                            | Pros                                                                                                                                                | Cons                                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JS promise queue in `src/services/habits/index.ts` + error handling in `TodayScreen` (chosen)** | Fixes the realistic case — the same user double-tapping one button. Stays entirely inside this vertical's owned files. Fails visibly, not silently. | Only covers callers inside this module. A habit tap racing the Summon tab's `spendTicket` still collides.                                          |
| `PRAGMA busy_timeout = 5000` in `initDatabase()`                                                  | The actual durable fix; one line; covers every caller across both verticals.                                                                        | `src/services/db/` is foundation, shared with the other developer. `OPEN-ITEMS.md` says shared changes need a conversation, not a unilateral edit. |
| Do neither, note it for the device run                                                            | Zero risk of a wrong fix.                                                                                                                           | Ships a known crash path into the first device test, obscuring whatever else that run surfaces.                                                    |

**Taken: the first. The second is written up in `OPEN-ITEMS.md` as a red item for the
other developer**, because it is genuinely theirs to agree to. It should be applied —
the JS queue is a local workaround, not the fix.

## 4. Other review findings acted on

- **Stale-refresh race** — two `refresh()` calls could resolve out of order and paint an
  older snapshot over a newer one. Fixed with a monotonic generation counter
  (`useRef`), which also guards set-state after the screen blurs.
- **`notice` was never cleared** — a completion message would stay pinned for the rest
  of the session, still on screen while logging an unrelated habit. Now cleared on each
  tap and on focus.
- **Partial cap clipping reported as a clean award** — `capReached` compared the granted
  amount against `0`. Harmless today because every habit is worth exactly 1 ticket, but
  a silent trap the moment a multi-ticket habit is added. Now compares granted against
  requested, and the notice says "(daily cap reached)" on a partial clip.
- **`clampCount` now rounds.** `habit_logs.count` is an INTEGER column and the plan
  states no fractional counts, but nothing enforced it. A test pins it, and a second
  test pins that every catalog `target` and `quickAdd` value is an integer.
- **The `completed_at` ternary was the last untested logic**, and it sat inside the
  transaction where the native module made it untestable. Extracted as a pure
  `resolveAdjust()` in `completion.ts` with seven tests, including the farm-prevention
  case: cross the target, drop below, cross again, no second award.
- **Dev-config pin.** `habits.test.ts` asserts the catalog out-rewards the cap using
  `GACHA_CONFIG`, but runtime reads `getGachaConfig()`. A new test asserts
  `DEV_GACHA_CONFIG.dailyTicketCap === GACHA_CONFIG.dailyTicketCap`, so the decision
  recorded in `OPEN-ITEMS.md` (dev overrides rates only, never the cap) cannot be
  silently reversed without a red test.

## 5. Findings deliberately **not** acted on

- **Midnight rollover.** If the app sits open across midnight, the screen keeps
  rendering yesterday's logs while taps write to the new date, so counts appear to reset
  mid-session. Real, but fixing it properly means an `AppState` listener and a date
  watch — new behaviour the spec does not describe. It belongs in a design step, not
  smuggled in here.
- **A one-line test gap in `src/services/tickets/__tests__/cap.test.ts`**
  (`clampAward(10, 0, 5) → 5`, already listed as known-minor). It was written, then
  reverted: that file is foundation, not this vertical's, and the boundary rule is worth
  more than the one-liner. Left for whoever owns the foundation next.

## 6. Deviations from the plan's literal code

- `HabitRow` reads `habit.quickAdd[0] ?? 1` rather than `habit.quickAdd[0]`, removing a
  crash path if a habit is ever added with an empty `quickAdd`.
- `HabitRow` gained an optional `disabled` prop so the screen can grey out quick-add
  while a write is in flight.
- `AdjustResult` gained `ticketsRequested` (see §4, partial clipping).
- Comments were added explaining _why_ `withExclusiveTransactionAsync` is mandatory but
  insufficient, why `awardTickets` runs after the commit, and why the screen uses
  `useFocusEffect`. These are the kind of thing a later reader "simplifies" away.

## 7. Docs touched outside the vertical's file boundary

The `src/` boundary is clean — no gacha-owned or foundation file is modified.
`docs/architecture.md` and `docs/status/OPEN-ITEMS.md` were updated anyway:
architecture.md still described the foundation as uncommitted on `feat/foundation`,
which stopped being true at PR #1, and `CLAUDE.md` asks for it to be kept current. Docs
cannot merge-conflict destructively, but expect a textual conflict if the other
developer is editing them right now.

---

## Verified, and not

Verified on this machine:

- `npx jest` — **33/33 passing**, 4 suites (23 of them new).
- `npx tsc --noEmit` — clean.
- `npx expo lint` — clean, exit 0.
- `npx expo export --platform android` — valid 2 MB Hermes bundle, exit 0.
- Every `expo-sqlite` and React Navigation API used was checked against the SDK 57
  versioned docs and the installed typings. All correct, including variadic bind
  params, the `Transaction` handle extending `SQLiteDatabase`, the non-async
  `useFocusEffect` callback, and `ON CONFLICT ... DO UPDATE` (bundled SQLite is 3.50.3;
  upsert needs ≥ 3.24).

**Not verified — nobody has run this app.** Unchanged from the foundation's status:

1. Everything in `src/services/habits/index.ts` that touches SQLite. The rules beneath
   it are fully unit-tested; the SQL and the transaction are not.
2. The seven-step device walkthrough — where award-once, no-clawback, cap clipping, and
   persistence across a cold restart actually get proven.
3. Concurrency under rapid quick-add taps — now with a JS queue that has never executed,
   guarding against a `SQLITE_BUSY` that has never been observed.
