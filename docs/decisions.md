# Decisions Log

Lightweight ADR-style log. One entry per decision that would otherwise get
re-litigated or forgotten. Newest at top.

---

### 2026-09-15 — Placeholder sprites are generated, not copied

- **Decision**: `assets/characters/` holds nine generated PNGs — each character's initial
  on its rarity colour — produced by `scripts/generate-placeholder-sprites.mjs`, replacing
  nine identical copies of `splash-icon.png`.
- **Why**: Not cosmetic. The gacha device walkthrough asks the tester to confirm that the
  pulled character shows in colour while the other eight are faded silhouettes, and which
  character a duplicate `×2` belongs to. With nine identical images neither is checkable,
  so two walkthrough steps could not be completed even once hardware was available.
- **Decision**: The generator lives in the repo rather than being thrown away, so the
  placeholders are reproducible and self-evidently placeholders. Its colour table and
  character list must be kept in step with `src/data/characters.ts`.
- **Consequence**: Real art still drops in at the same paths with no code change. Delete
  the script when it does.
- **Status**: Rendered and visually confirmed; bundle exports clean. **Never run on a
  device.**

---

### 2026-09-15 — The Today screen watches the local date

- **Decision**: `useCurrentDate` in `src/lib/` watches for the local date changing via a
  self-re-arming midnight timer plus an `AppState` listener, and `TodayScreen` re-reads
  and posts a notice when it changes.
- **Why**: `today()` is called fresh on every write, so writes were always correct — but
  the screen never re-read, so crossing midnight left stale counts on screen until the
  next tap. The reset then appeared to be _caused by the tap_, which reads as the app
  eating the user's work. The `AppState` trigger matters more than the timer: most users
  close the app at night, so the timer never fires.
- **Decision**: Refresh **and** explain, rather than refreshing silently. A silent reset
  is still an unexplained reset, and the cap refreshing is the good half of the news.
- **Scope**: `TodayScreen` only. `getBalance()` is `SUM(delta)` with no date filter, so
  the balance never resets and neither gacha screen renders date-scoped data. This was
  assumed to be a shared cross-vertical change until the code was read.
- **Not fixed**: `adjustHabitCount` captures `logDate` once, so midnight falling between
  that line and `awardTickets` puts the log on day N and the ticket on day N+1. Closing
  it means a breaking change to the shared ticket seam for a sub-millisecond window.
- **Status**: Written and unit-tested; **never run on a device.**

---

### 2026-09-15 — Screen tests are part of v1 after all

- **Decision**: The three screens and `HabitRow` are covered by `react-test-renderer`
  tests that drive both vertical plans' device walkthroughs against in-memory storage.
  This reverses the spec's §8 call that "React Native component tests are deliberately
  not part of v1 — low value at this stage."
- **Why**: That call assumed a device would be available for the manual pass instead. One
  never was — every walkthrough is still unrun, weeks in. Screen tests turned out to be
  the only way to exercise them at all, and they cover 11 of the 15 steps.
- **Decision**: Only the SQLite layer is faked. The Today walkthrough runs through the
  real `resolveAdjust` and `clampAward`; the Summon walkthrough through the real
  `rollOne`/`pickCharacter` with a seeded RNG. A mock that re-implemented the rules would
  only be testing itself.
- **Consequence**: `react-test-renderer` already ships with `jest-expo`, so no runtime
  dependency was added; `@types/react-test-renderer` was added as a devDependency.
- **Status**: 121/121 tests passing. **Still never run on a device** — these complement
  the device pass, they do not replace it.

### 2026-09-15 — All database writes go through one in-process queue

- **Decision**: `withWriteTransaction` in `src/services/db` is the only supported way to
  write. It serialises every write in the app through a single promise chain and retries
  transient lock errors. Calling `db.withExclusiveTransactionAsync` or
  `db.withTransactionAsync` directly is banned.
- **Why**: `withExclusiveTransactionAsync` does not serialise callers — it opens a new
  connection per call and issues a _deferred_ `BEGIN`, so two overlapping read-then-writes
  both take a read snapshot and the loser fails with "database is locked". Measured: 8
  concurrent ticket awards against a cap of 5 left **7 of 8 throwing and a balance of 1**.
  With the queue, 0 throw and the balance is 5.
- **Decision**: `PRAGMA busy_timeout` is **not** the fix, reversing what
  `OPEN-ITEMS.md` previously prescribed. SQLite skips the busy handler for a stale
  snapshot (`SQLITE_BUSY_SNAPSHOT`), so it makes no difference to the read-then-write
  upgrade — measured at 0 ms to failure with and without it. It is also per-connection
  and would never have reached the connections expo opens for transactions. It is still
  set on the main connection, where it does help plain write-lock contention.
- **Consequence**: the habits vertical's local JS queue was removed as subsumed, and
  `src/services/db/writeQueue.ts` carries the measurements in a comment so this is not
  re-derived.
- **Status**: Written and unit-tested; **never run on a device.**

---

### 2026-09-12 — Foundation layer: SQLite, exclusive transactions, parallel verticals

- **Decision**: Storage is `expo-sqlite` with an append-only `ticket_ledger` rather
  than a balance column, so balance is `SUM(delta)` and the daily cap is a query over
  today's positive rows. Navigation is React Navigation bottom tabs, not expo-router.
- **Decision**: All read-then-write database access uses
  `withExclusiveTransactionAsync` with queries on the `txn` handle.
  `withTransactionAsync` is banned project-wide.
- **Why**: `withTransactionAsync` is a bare `BEGIN`/`COMMIT` on a shared connection and
  is documented as interruptible by other async queries. Overlapping callers corrupt
  each other's transactions, which silently removed the double-spend guarantee the
  design depends on. Caught in final review, after an earlier review had wrongly
  confirmed the original as sound.
- **Decision**: The `__DEV__` config override changes rates and pity only — never
  `dailyTicketCap`. The two vertical plans contradicted each other on this; the spec
  authorises a rate override only, and cap-clipping is a v1 behaviour that must stay
  testable in dev.
- **Status**: Written, statically verified, **never run on a device**. See
  `docs/status/OPEN-ITEMS.md`.

---

### 2026-09-12 — Scaffold: Expo + TypeScript, plain Markdown docs

- **Decision**: Use Expo (managed) + React Native + TypeScript as the base.
  Project context lives in `docs/` as plain Markdown (no Obsidian vault) —
  portable and greppable, works for any collaborator or tool.
- **Why**: Fastest path to iOS + Android builds without native tooling
  overhead; TypeScript for shared conventions with a second dev; plain
  Markdown avoids adding vault tooling before it's needed.
- **Scope**: Skeleton app only — no database, navigation, gacha, or ad logic
  yet. Those are separate future design cycles.
