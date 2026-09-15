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

This has been fixed — everything now uses `withExclusiveTransactionAsync` with all
queries on the `txn` handle — but the fix has never executed. When you first run the
app, deliberately spam the quick-add and summon buttons and confirm the ticket balance
never goes wrong.

**Rule for all new code:** never use `withTransactionAsync` in this project. Always
`withExclusiveTransactionAsync`, and every query inside the callback must use `txn`, not
the outer `db` — `txn` is a separate connection holding the write lock, so a stray `db`
call inside the callback deadlocks.

### 🔴 `withExclusiveTransactionAsync` does not serialise either — read this

Found 2026-09-15 while building the habits vertical, confirmed by reading
`node_modules/expo-sqlite/build/SQLiteDatabase.js:155`. The name oversells it. The
implementation opens a **new connection** and issues a plain **deferred** `BEGIN` — not
`BEGIN EXCLUSIVE`, and with no queue. Expo's own doc comment on that function admits it:
_"As long as the transaction is converted into a write transaction, the other async write
queries will abort with `database is locked` error."_ Nothing in this project sets
`busy_timeout`, so the losing caller gets `SQLITE_BUSY` **immediately**.

Two consequences:

- The good one: this fails loud, not silent. It cannot corrupt the ledger or break the
  award-once rule the way `withTransactionAsync` could. The earlier fix was still right.
- The bad one: the spec (`core-loop-design.md` §"concurrency") states that a second
  concurrent caller "reads 0 and returns false". **It does not — it throws.** Every
  caller needs an error path. `spendTicket` on the Summon tab has the same exposure.

The habits vertical works around it locally: `adjustHabitCount` serialises its own
callers through a JS promise queue, and `TodayScreen` catches and surfaces failures. That
only covers collisions _within_ the habits module. A habit tap racing a summon still
collides.

**The durable fix is one line in the foundation** — `PRAGMA busy_timeout = 5000` next to
the `journal_mode = WAL` pragma in `initDatabase()` (`src/services/db/index.ts`). It was
deliberately **not** applied unilaterally, because `src/services/db/` is shared and this
file says shared changes need a conversation first. **That conversation is this item.**
Whoever picks it up should also decide whether the gacha vertical wants the same JS queue
around `spendTicket`. Verify it on the device run in the same rapid-tap test as item 4.

## Next steps

**The habits vertical is written** (2026-09-15) and sits **uncommitted in the working
tree on `master`** — it still needs a `feat/habit-tracking` branch, a commit, and a PR.
It passes 33/33 tests, `tsc --noEmit`, `expo lint`, and an Android export, and its one
unfinished gate is the seven-step device walkthrough in Task 5 of its plan, which this
machine cannot run. Decisions taken while building it, with alternatives:
`docs/status/2026-09-15-habits-vertical-decisions.md`.

That leaves:

- Gacha vertical: `docs/superpowers/plans/core-loop/September_2026/2026-09-12-gacha-vertical.md`
- The device walkthrough for habits: `docs/superpowers/plans/core-loop/September_2026/2026-09-12-habits-vertical.md` (Task 5, Step 3)
- The `busy_timeout` conversation flagged in red above.

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

## Known-minor, safe to defer

- `cap.test.ts` has no case where one request exceeds the whole cap from zero
  (`clampAward(10, 0, 5) → 5`). Same code path as a tested case.
- `src/services/.gitkeep` and `src/types/.gitkeep` are now redundant.
- `expo-status-bar` is installed but no longer imported anywhere.

## Where the detail lives

- Authoritative design: `docs/superpowers/specs/core-loop/September_2026/2026-09-12-core-loop-design.md`
- Foundation plan as executed: `docs/superpowers/plans/core-loop/September_2026/2026-09-12-foundation.md`
- Architecture state and open technical decisions: `docs/architecture.md`
- Decision log: `docs/decisions.md`
