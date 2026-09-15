# Open Items — read before trusting anything in `src/`

Last updated: 2026-09-16. This file is auto-loaded into every Claude session via
`CLAUDE.md`. Keep it short and current; delete items once they are genuinely done.

## Where the project actually stands

🎉 **The app has been run.** 2026-09-15, by the repo owner, on a physical Android phone
via Expo Go. It was the first launch in the project's history, and the core loop worked.

Confirmed by hand on device:

- It gets past the spinner — so `expo-sqlite` loads and the migrations apply.
- The tabs render and navigate.
- Quick-add `+` and `−` work on the Today screen.
- Summoning works, and duplicates occur.
- The daily ticket cap binds — you cannot earn unlimited tickets in a day.

The follow-up checks — cold-restart persistence, rapid-tap concurrency and midnight
rollover — were cleared in the same session. Everything here was previously only
statically verified; it no longer needs that caveat.

## ✅ Device checks: all clear

Cleared by the repo owner on 2026-09-15, same session as the first run:

1. **State survives a cold restart** — counts, ✓ marks, balance and collection all
   persisted. This also proves the migrations applied cleanly, which nothing else can.
2. **Concurrency under rapid taps** — no wrong counts, no double pulls, no silent no-ops.
   The write queue held on real SQLite, having only ever been measured against
   `node:sqlite` before this.
3. **Midnight rollover** — reported fine. Worth one more look after an actual midnight
   with the app left open, since that is the only way the timer path proves itself; the
   `AppState` path is what a next-morning reopen exercises.

`docs/status/DEVICE-RUN-CHECKLIST.md` remains the ordered script for re-running the full
pass after significant changes.

### ✅ Resolved: every write now goes through `withWriteTransaction`

**Rule for all new code:** never call `db.withTransactionAsync` or
`db.withExclusiveTransactionAsync` directly. Always `withWriteTransaction` from
`src/services/db`, and every query inside the callback must use the `txn` handle it
gives you, not the outer `db` — `txn` is a separate connection holding the write lock,
so a stray `db` call inside the callback deadlocks.

`withWriteTransaction` serialises every write in the app through one in-process promise
chain and retries a transient lock error with bounded backoff. The app is one process
with one JS thread, so that chain is a real mutex: our own writes can no longer overlap
at all.

**An earlier version of this file prescribed a one-line fix — `PRAGMA busy_timeout` in
`initDatabase()` — and that was wrong.** Two reasons, both measured rather than reasoned
about:

1. **`busy_timeout` does not help the read-then-write upgrade**, which is the pattern
   every service here uses. A stale snapshot fails with `SQLITE_BUSY_SNAPSHOT`, and
   SQLite deliberately skips the busy handler for it, because waiting could never make
   the upgrade succeed. Measured at 0 ms to failure with and without the pragma.
2. **It is per-connection**, and the connections expo opens inside
   `withExclusiveTransactionAsync` are created fresh with no pragmas — so it would never
   have reached the transactions it was meant to protect.

The pragma is still set on the main connection, where it genuinely helps the one case it
is designed for: plain write-lock contention with no open snapshot (measured: waits
2.2 s instead of failing in 3 ms).

Scale of what this was costing, from a probe reproducing the app's exact shape — 8
concurrent read-then-writes against a daily cap of 5:

|        | calls that threw | final balance |
| ------ | ---------------- | ------------- |
| Before | 7 of 8           | **1**         |
| After  | 0 of 8           | **5** ✅      |

Consequences worth knowing:

- The spec (`core-loop-design.md` §concurrency) says a second concurrent caller "reads 0
  and returns false". It never did — it threw. Callers still need an error path, and
  both screens have one.
- The habits vertical's local JS queue around `adjustHabitCount` has been **removed**, as
  the foundation queue subsumes it and also covers what it could not: a habit tap racing
  a summon.
- Retries are only attempted for lock errors, and only for transactions that expo has
  already rolled back, so nothing double-applies.

## Next steps

**v1 is built and the loop works on a real phone.** Both verticals, the write
serialisation, the screen tests, the midnight-rollover fix and CI are all on `master`,
passing 144/144 tests, `tsc --noEmit`, `expo lint`, `expo-doctor` 21/21 and an Android
export — and the core loop has now been played by hand.

The spec says v1 exists to prove exactly one thing: **that the loop is satisfying.** That
question is now answerable from evidence rather than from a bundle.

What v2 turns on is no longer whether the machinery works. It is what the pulls are
_for_ — see "Design questions" below.

Decisions taken while building each, with the alternatives weighed:

- `docs/status/2026-09-15-habits-vertical-decisions.md`
- `docs/status/2026-09-15-gacha-vertical-decisions.md`
- `docs/status/2026-09-15-write-serialisation-decisions.md`
- `docs/status/2026-09-15-screen-tests-decisions.md`
- `docs/status/2026-09-15-midnight-rollover-decisions.md`

**`docs/next-steps.md` is the forward-looking plan** — read that for what to do next and
why, in order. This file is the status record.

**CI now guards the foundation.** `.github/workflows/ci.yml` runs the typecheck, lint,
`jest --ci` and an Android bundle on every push and PR to `master`. Every step was
verified locally, but **the workflow has never run on GitHub** — the first PR will be its
first execution.

The verticals are designed to share no files. Stay inside your plan's stated file
boundary — the "Global Constraints" section of each plan lists exactly what it owns.
Anything both verticals need belongs in the foundation, which means it needs a
conversation with the other developer first, not a unilateral edit.

**The first device run surfaced exactly one defect, and it was cosmetic** — the tick
mark, since fixed. The foundation came up clean on first launch. If a later run dies at
the spinner or the error screen, still suspect `expo-sqlite` loading or migrations before
you suspect your vertical.

## Character ranks — built, never run on a device

Built 2026-09-16 (7 tasks, spec + plan under `docs/superpowers/specs/economy/` and
`docs/superpowers/plans/economy/`): duplicate pulls now raise a character's rank (0–5),
derived from `owned_characters.copies`. Ranks 1–3 reveal lore, rank 4 unlocks a border,
rank 5 swaps in alternate artwork. 201/201 tests passing, `tsc --noEmit` and `expo lint`
clean. See `docs/decisions.md`, entry of the same date, for what was decided and rejected
(shards, per-character border toggle, storing rank instead of deriving it).

**None of this has ever run on a device.** Everything above is unit-tested only, same
caveat as every other item in this file before the 2026-09-15 run. Specific gaps worth
naming rather than assuming closed:

- **The `settings` table (migration 1 in `src/services/db/schema.ts`) is verified by
  inspection only.** No automated test in this repo exercises the actual SQL — not the
  table definition, not the `ON CONFLICT` upsert in `src/services/settings/`, not the
  migration's validity against real SQLite. Every service test mocks the db module because
  `expo-sqlite` cannot run under jest. This is the same limitation every prior migration
  here has had; it just hasn't been written down until now.
- **Collection → Detail navigation is unverified at runtime.** `src/navigation/CollectionStack.tsx`
  is never mounted by any test. Its correctness rests entirely on TypeScript agreeing that
  `CollectionStackParamList['CharacterDetail']` matches `CharacterDetailScreen`'s `route`
  prop. Tapping a character in the collection grid could fail at runtime and no test in
  this repo would notice. Closing it needs an integration test mounting
  `NavigationContainer`, which nothing here currently does.
- **The rank border toggle, the grid's rank pips, and the character detail screen's
  lore/border/alt-art rendering have only ever been exercised through mocked settings and
  mocked config.** `docs/status/DEVICE-RUN-CHECKLIST.md` has been extended with the steps to
  actually look at them.
- **Installing `@react-navigation/native-stack` (for the Collection → Detail push)
  transitively upgraded `@react-navigation/core` 7.21.13 → 7.22.1 and
  `@react-navigation/native` 7.3.18 → 7.4.1.** That is the navigation core **all four
  tabs** run through, including Today, Summon and How it works — the three this feature
  never touched. No test in this repo mounts a real navigator, and `tsc --noEmit`,
  `expo lint` and `jest` cannot catch a runtime navigation regression from a transitive
  bump like this. `npx expo-doctor` reports 20/21 — its one failure is `expo` 57.0.22 vs
  an expected ~57.0.23, which is unrelated external patch drift this branch did not
  cause (the lockfile diff never touches `expo` itself). Exercise the untouched tabs, not
  just Collection, on the device run for this reason.

## Design questions raised by the first device run

All of these came out of playing the loop on 2026-09-15. None is a bug in the machinery;
they are the questions v1 deliberately deferred, now arriving on schedule.

### The tick mark does not come back off (small, fix first)

Complete a habit, tap `−` back below the target, and the ✓ stays while the count drops.

**Cause.** `completed_at` is doing two jobs at once: it is both "this habit is done" (what
the tick renders from) and "today's ticket has already been paid" (the award-once guard).
`TodayScreen` renders the tick from `Boolean(log.completedAt)`, and the column is
deliberately never cleared so the ticket cannot be farmed by crossing the target twice.

**Fix.** Separate the two meanings, which needs **no migration and no schema change**:

- `completed_at` keeps only its award-once job. Nothing about the economy changes.
- The tick renders from live progress — `count >= target` — so it appears and disappears
  with the count.

The ticket stays paid, because it may already have been spent. That asymmetry is correct
and worth stating in the UI rather than hiding: **progress is editable, earnings are
final.**

### ✅ What duplicates are worth, and what the collection is ultimately for — resolved

Both were the same question and were designed together, 2026-09-16: pulling a character
you already own now raises its rank (0–5), read from `owned_characters.copies` rather than
a new counter. Rank 1–3 reveals lore, rank 4 a border, rank 5 alternate artwork — so the
collection is now a thing worth over-pulling into, not just a completion checklist. See
"Character ranks — built, never run on a device" above, and `docs/decisions.md`.

### Streaks — now unblocked

Wanted: consecutive days logged in, and/or consecutive days the ticket cap was maxed.

Was deliberately out of scope for v1, and not independent of the question resolved above: a
streak that pays tickets multiplies the economy, so its design depends on what tickets
ultimately buy. That is now decided (rank progress), so streaks is next — see
`docs/next-steps.md` §3.

### ✅ A screen explaining the rules — built

`HowItWorksScreen`, a fourth tab, added 2026-09-15 and extended 2026-09-16 with a
"Duplicates and ranks" section. Ticket cap, pull rates, the pity guarantee, and now the
copies-per-rank ladders — every number read from `getGachaConfig()` / `getRankThresholds()`
at render time and tested against values the app has never shipped so it cannot drift. A
`__DEV__` banner says the displayed rates are not the
real economy. Unverified on a device: the fourth tab's effect on the tab bar.

## Decisions made under uncertainty — revisit if you disagree

- **Dev config overrides rates only, not `dailyTicketCap`.** The two vertical plans
  originally contradicted each other here: the gacha walkthrough wanted a raised dev cap,
  the habits walkthrough needed the 5/day cap to actually bind. The spec authorises a
  rate override only, so the cap now stays at 5 in dev. Consequence: if you need more
  than five pulls in one sitting while testing gacha, raise `dailyTicketCap` in
  `src/config/gacha.ts` as a local uncommitted edit and revert before your PR.
- **`app.json` gained a `plugins: ["expo-sqlite"]` entry.** Automatic and required; do
  not remove it.
- **Two functions were deliberately not built** because nothing consumes them:
  `getAwardedToday()` and a `clampAward` re-export from the tickets barrel. If you find
  you need either, add it rather than assuming it was an oversight.

## Known-minor

Nothing outstanding. All previously listed items are done (2026-09-15): the
`clampAward(10, 0, 5)` case is covered, both redundant `.gitkeep` files are deleted,
`expo-status-bar` is uninstalled, and **midnight rollover is fixed** — `TodayScreen` now
watches the local date via `useCurrentDate` and re-reads with a notice when it changes.
See `docs/status/2026-09-15-midnight-rollover-decisions.md`.

## Where the detail lives

- Authoritative design: `docs/superpowers/specs/core-loop/September_2026/2026-09-12-core-loop-design.md`
- Foundation plan as executed: `docs/superpowers/plans/core-loop/September_2026/2026-09-12-foundation.md`
- Character ranks design: `docs/superpowers/specs/economy/September_2026/2026-09-15-economy-design.md`
- Character ranks plan as executed: `docs/superpowers/plans/economy/September_2026/2026-09-16-character-ranks.md`
- Architecture state and open technical decisions: `docs/architecture.md`
- Decision log: `docs/decisions.md`
- **Forward plan: `docs/next-steps.md`**
