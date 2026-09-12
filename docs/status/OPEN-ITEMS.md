# Open Items — read before trusting anything in `src/`

Last updated: 2026-09-12. This file is auto-loaded into every Claude session via
`CLAUDE.md`. Keep it short and current; delete items once they are genuinely done.

## Where the project actually stands

The **foundation layer is written but has never been run.** Branch `feat/foundation`
contains the database layer, shared types, tunable config, the ticket ledger, and a
navigation shell. It typechecks, lints, passes 10/10 unit tests, and produces a valid
Android bundle — but **no human or agent has ever launched this app.**

Do not describe the foundation as "working", "tested", or "verified" to anyone. It is
written and statically checked. That is a different claim.

## ⚠️ Must be confirmed on a real device before building on this

Nobody has an Android SDK, emulator, or device attached to the machine this was built
on. These are unverified and each one could be broken:

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

## Nothing is committed

All foundation work sits uncommitted in the working tree by the repo owner's choice. It
must be reviewed and committed before either vertical starts, because both verticals
depend on it.

## Next steps, in order

1. **Run the app and clear the four checks above.** Fix anything they surface.
2. **Commit and merge `feat/foundation` into `master`.** Both vertical plans are
   hard-blocked until this lands — they import from it.
3. **Then the two verticals proceed in parallel**, one developer each:
   - Habits: `docs/superpowers/plans/core-loop/September_2026/2026-09-12-habits-vertical.md`
   - Gacha: `docs/superpowers/plans/core-loop/September_2026/2026-09-12-gacha-vertical.md`

The verticals are designed to share no files. Stay inside your plan's stated file
boundary — the "Global Constraints" section of each plan lists exactly what it owns.
Anything both verticals need belongs in the foundation, which means it needs a
conversation first, not a unilateral edit.

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
