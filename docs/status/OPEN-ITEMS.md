# Open Items — read before trusting anything in `src/`

Last updated: 2026-09-15. This file is auto-loaded into every Claude session via
`CLAUDE.md`. Keep it short and current; delete items once they are genuinely done.

## Where the project actually stands

The foundation layer is **merged into `master`** (PR #1): the SQLite schema and migration
runner, shared types, tunable config, the ticket ledger, and a three-tab navigation
shell. It typechecks, lints, passes 10/10 unit tests, and produces a valid Android
bundle.

But **it has still never been run.** No human or agent has launched this app. Merged is
not the same as verified — do not describe the foundation as "working", "tested", or
"verified" to anyone. It is written, statically checked, and merged.

## ⚠️ Still unconfirmed — nobody has run this app

The machine this was built on has no Android SDK, emulator, or device. Each of these is
unverified and could be broken. You do not have to clear them before starting a vertical,
but you will hit them the moment you first launch the app:

1. **The native `expo-sqlite` module actually loads.** A successful Metro bundle does
   not prove this. If it fails, `initDatabase()` rejects and the app shows its error
   screen instead of content.
2. **The database initialises and migrations apply.** Launch, confirm you get past the
   spinner, then fully close and reopen — state must survive.
3. **The three bottom tabs render and navigate.**
4. **Concurrency under rapid taps.** This one matters most — see below.

### Why item 4 deserves real attention

The original implementation used `db.withTransactionAsync`, believing it serialised
concurrent callers. It does not. Expo's own source documents it as _"not exclusive and
can be interrupted by other async queries"_ — it is a bare `BEGIN`/`COMMIT` on a shared
connection. With overlapping calls, the second caller's `BEGIN` is rejected, its error
handler's `ROLLBACK` aborts the **first** caller's transaction, and that caller's write
then commits unprotected.

`withExclusiveTransactionAsync` was the first fix. It was necessary but **not
sufficient** — it does not serialise callers either. It opens a new connection per call
and issues a plain **deferred** `BEGIN`, so two overlapping read-then-writes both take a
read snapshot and the loser's upgrade to a write fails with "database is locked".

**That is now fixed properly (2026-09-15) — see `withWriteTransaction` below.** The fix
has still never executed on a device, so item 4 stays open: when you first run the app,
deliberately spam the quick-add and summon buttons and confirm the ticket balance never
goes wrong.

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

**Both verticals are written** (2026-09-15), plus the write-serialisation fix above, the
screen tests, and the midnight-rollover fix. Everything through the screen tests is
committed on `master`; the rollover fix sits **uncommitted in the working tree**.
Together they pass 139/139 tests, `tsc --noEmit`, `expo lint`, and an Android export.

**Nothing has been run on a device.** Both plans end in a device walkthrough, and
**11 of those 15 steps are now covered by screen tests** that drive the real screens
against in-memory storage, with the real rules (`resolveAdjust`, `clampAward`, `rollOne`)
underneath. What is left needs hardware:

- Habits (Task 5, Step 3): steps 1–6 ✅ tested. **Step 7, cold restart** — device only.
- Gacha (Task 6, Step 3): steps 1–6 and 8 ✅ tested. **Step 7, cold restart** — device only.

Do not read that as "mostly verified". The screen tests cannot touch the four checks
above — the native module loading, migrations applying, state surviving a restart, or
real SQLite concurrency. They are a complement to the device pass, not a substitute.

Decisions taken while building each, with the alternatives weighed:

- `docs/status/2026-09-15-habits-vertical-decisions.md`
- `docs/status/2026-09-15-gacha-vertical-decisions.md`
- `docs/status/2026-09-15-write-serialisation-decisions.md`
- `docs/status/2026-09-15-screen-tests-decisions.md`
- `docs/status/2026-09-15-midnight-rollover-decisions.md`

That leaves, and **both need something this machine does not have** — a device, or art:

1. **The first device run.** It exercises the whole core loop — earn a ticket on Today,
   spend it on Summon, see it in Collection — clearing the four checks above and the two
   cold-restart steps at once. Still the highest-value item by a distance.
2. Real character art. All nine sprites in `assets/characters/` are copies of
   `splash-icon.png`, sitting at their final paths so dropping real PNGs over them
   needs no code change.

The verticals are designed to share no files. Stay inside your plan's stated file
boundary — the "Global Constraints" section of each plan lists exactly what it owns.
Anything both verticals need belongs in the foundation, which means it needs a
conversation with the other developer first, not a unilateral edit.

**Expect the first device run to surface foundation bugs, not just your own.** Each
vertical plan ends in a device walkthrough, and whoever gets there first is also running
the foundation for the first time ever. If the app dies at the spinner or the error
screen, suspect `expo-sqlite` loading or migrations before you suspect your vertical.
Clear the four checks above when you get there, then delete that section from this file.

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
- Architecture state and open technical decisions: `docs/architecture.md`
- Decision log: `docs/decisions.md`
