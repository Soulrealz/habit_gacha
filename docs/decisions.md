# Decisions Log

Lightweight ADR-style log. One entry per decision that would otherwise get
re-litigated or forgotten. Newest at top.

---

### 2026-09-16 — Two traps worth recording from the character-ranks review

- **The boolean settings encoding is deliberately fail-open.** `getShowRankBorders()` is
  `(await getSetting(KEY)) !== 'false'`, so any unexpected value — missing row, a stray
  string, a half-written row — reads as ON. That is correct for a cosmetic border: hiding
  a reward the player already earned would read as a bug, not a safe default. It is
  **wrong for ad consent**, where a corrupt or half-written row must never default to
  "consented". The next implementer will copy the nearest precedent, and this is it. When
  a second boolean setting lands, add an explicit `getBooleanSetting(key, fallback)` with
  a strict `'true'`/`'false'` comparison rather than copying this one — but don't build
  that helper now, nothing consumes it, same standing rule that left `getAwardedToday()`
  unbuilt (see `docs/status/OPEN-ITEMS.md`).
- **Streak state must not live in the `settings` table.** Streak *preferences* could, but
  current length / longest streak / last-qualifying-date are gameplay data that wants
  querying, not stringified key/value blobs. `docs/next-steps.md` already notes the
  ticket ledger's `log_date` can answer "days the cap was maxed" from existing data.
  Putting `settings['current_streak'] = '7'` in the settings table would create
  integers-as-TEXT and a second source of truth competing with the ledger — exactly the
  failure mode this feature's "derive rank, don't store it" decision (below) was built to
  avoid.

### 2026-09-16 — Character ranks: duplicates drive rank, not a currency

- **Decision**: A duplicate pull raises that character's rank (0–5) rather than doing
  nothing. Rank is **derived from `owned_characters.copies`** in `src/services/collection/rank.ts`
  (`rankFor`), not stored anywhere — there is no second source of truth to drift. Ranks 1–3
  each reveal one lore entry; Rank 4 unlocks a decorative border; Rank 5 swaps in alternate
  artwork. Copies-per-rank ladders live in `RANK_THRESHOLDS` in `src/config/gacha.ts`, read
  through `getRankThresholds()`, and are rarity-shaped — a 5★ needs far fewer copies than a
  3★, because a 5★ arrives far less often.
- **Alternative rejected: shards.** Melting duplicates into a spendable currency was
  considered and rejected knowingly, with the 5★ scarcity problem weighed first (see the
  spec's §8). Direct duplicates keep rank a pure function of `copies` and keep the
  "investment in this specific character" fantasy intact; shards would have needed a second
  source of truth and a whole separate spend economy for a v1 that hasn't yet proven the
  loop is worth extending.
- **Alternative rejected: persisting rank in a new `character_progress` table.** Would have
  bought a "rank went up" NEW-badge and a future shard migration path. Shards were rejected,
  so today it would only add a table that can disagree with `copies` for no benefit. Revisit
  if a rank-up notification is designed — see the "known gap" below.
- **Decision: the border toggle is global, not per-character.** A row and a control per
  character was rejected as a lot of surface for a cosmetic most players set once. The
  setting lives in a new `settings` key/value table (migration 1 in `src/services/db/schema.ts`,
  append-only, `MIGRATIONS[0]` untouched) and is read/written through
  `src/services/settings/` — `getShowRankBorders` / `setShowRankBorders`. A missing row
  defaults to borders on.
- **Supply-sensitivity warning, written down because it will bite the roster-growth task**:
  `RANK_THRESHOLDS` is calibrated against the current 9-character roster (2×5★, 3×4★, 4×3★).
  Every character added to `src/data/characters.ts` dilutes per-character pull odds within
  its rarity, which stretches every rank ladder for that rarity. Growing the roster and
  re-deriving these thresholds are the same task, not two — see `docs/next-steps.md` §1 and
  the spec's §3.
- **Known gap, deliberate**: nothing tells a player a rank went up at the moment it happens.
  It is discoverable only by opening the character detail screen. A NEW-badge for rank-ups
  would need a "last seen rank" marker and the `character_progress` table rejected above —
  deferred, not forgotten.
- **Status**: implemented across 7 tasks (T1 data/types, T2 `rankFor`/`copiesToNextRank`/
  `unlockedLore`, T3 the `settings` migration and service, T4 `CharacterDetailScreen`, T5 the
  Collection→Detail stack navigator and grid rank pips, T6 the `RankBorder` component and its
  toggle, T7 this screen's copy). 201/201 tests passing, `tsc --noEmit` and `expo lint` clean.
  **Never run on a device** — see `docs/status/OPEN-ITEMS.md` for the full list of what that
  leaves unverified, including that Collection→Detail navigation has never actually been
  mounted by a test and that the `settings` migration's SQL has only been inspected, never
  executed.

### 2026-09-15 — A "How it works" tab, with every number read from the config

- **Decision**: A fourth bottom tab, `HowItWorksScreen`, explaining the daily ticket cap,
  the pull rates and the pity guarantee. It is purely presentational: no database reads,
  no state, no effects, so it cannot spin, fail, or go stale.
- **Extended 2026-09-16**: the character-ranks branch added a "show rank borders" toggle
  to this screen, which reads and writes the `settings` table. The screen is no longer
  purely presentational — see the entry above and `docs/next-steps.md`. This decision's
  reasoning for reading every number from `getGachaConfig()` at render time is unaffected.
- **Why**: The app taught the 5/day cap only by hitting it, and taught the guarantee not
  at all. `docs/next-steps.md` §4 lists this as the one item with no dependency on the
  undesigned economy, so it could be built without prejudging what duplicates convert
  into.
- **Constraint, and the reason the screen has tests at all**: every number is read from
  `getGachaConfig()` at render time and none may be retyped into the copy. The 3★ rate is
  the case that proves it — no field in `GachaConfig` holds it, so it is computed as
  `1 - fiveStarRate - fourStarRate`. The guarantee copy counts from `pityThreshold`, and
  says the *next* summon after `pityThreshold - 1` misses is the guaranteed one, matching
  `rollOne`'s `nextPity >= threshold` rather than approximating it.
- **How that is enforced**: the load-bearing test renders against a config the app has
  never shipped (7% / 23% / pity 33 / cap 9) and asserts the rendered text tracks it,
  including the derived 70%. A hard-coded number fails it. Verified by mutation: replacing
  one interpolation with its literal turns the suite red.
- **Decision**: a `__DEV__` banner reading "Development rates — these are not the real
  economy." Reading `getGachaConfig()` means a dev build honestly displays 25% and pity 5;
  honest but misleading, and `docs/next-steps.md` warns that judging the loop from those
  numbers misleads in both directions. The banner costs nothing in production.
- **Alternatives rejected**: a header "?" button on the Summon screen (needs a stack
  navigator the repo does not have), and a `<Modal>` inside `SummonScreen` (touches the
  gacha vertical's file, and modals are missable). The tab is one additive line.
- **Note**: `src/navigation/index.tsx` is shared foundation rather than either vertical's
  file. The change is one import and one `<Tab.Screen>`, additive, touching no existing
  screen — flagged here rather than made quietly.
- **Status**: 10 new tests, 160/160 passing, `tsc --noEmit` and `expo lint` clean.
  **Not yet seen on a device** — the fourth tab's effect on the tab bar at narrow widths
  is unverified.

### 2026-09-15 — The ✓ tracks live progress, not the award

- **Decision**: `TodayScreen` renders the tick from `count >= target` rather than from
  `completed_at`. Re-completing a habit that already paid out now says
  "today's ticket is already earned" instead of silently doing nothing.
- **Why**: Found on the first device run — complete a habit, edit the count back down,
  and the ✓ stayed above a count below the target. `completed_at` was doing two jobs:
  "this habit is done" and "today's ticket is paid". It is deliberately never cleared so
  the award cannot be farmed by crossing the target twice, which made it wrong as a
  display source.
- **Consequence**: **no schema change and no migration.** `completed_at` keeps only its
  award-once job; the economy is untouched. The asymmetry is intentional and now stated
  in the UI: progress is editable, earnings are final — the ticket may already be spent.
- **Amended**: the habits walkthrough's step 4 previously asserted the ✓ _stays_ as proof
  that awards are not clawed back. It conflated the two meanings. The earned ticket is
  what must not be clawed back; the tick is live progress. The device checklist and the
  screen test were both corrected.
- **Status**: Unit-tested, 6 new tests. Not yet re-checked on device.

### 2026-09-15 — A summon is one transaction

- **Decision**: `performSummon` runs spend, roll, grant and pity inside a single
  `withWriteTransaction`. The services gained `…On(txn)` cores —
  `spendTicketOn`, `recordCharacterOn` — with the public wrappers kept as thin callers.
- **Why**: It was three separately-committed writes, so a failure between the debit and
  the grant spent a ticket and produced nothing. Permanent and unrecoverable, in a game
  whose entire currency is tickets, and it forced the UI to carry an apology for it. The
  original spec accepted that trade explicitly; it was the wrong way round.
- **Consequence**: `SummonOutcome`'s `failed` variant lost its `ticketSpent` field — on
  any failure the debit rolls back, so the screen can promise the ticket is intact rather
  than hedging.
- **Note**: The split was necessary, not stylistic. `withWriteTransaction` is a
  process-global mutex that _rejects_ a nested write, so calling the public
  `spendTicket()` inside another transaction is a loud error.
- **Note**: The write queue re-runs its callback after a lock conflict, so a retried
  summon re-rolls the dice. Sound — nothing was committed — but a roll is not fixed until
  it commits.
- **Decision**: `spendTicket()` is kept despite now being unconsumed, because the spec
  lists it as the shared seam's entry point and removing it would be a breaking change to
  an interface the other developer may rely on. `recordCharacter()` was removed, being
  gacha-owned with no external contract — the project's standing rule against building
  what nothing consumes.
- **Decision**: `spendTicketOn` is additive; the three original seam signatures are
  unchanged, so the habits vertical is unaffected.
- **Status**: Written and unit-tested, including the first real unit tests of the spend
  path — splitting it out of the transaction is what made it testable without the native
  module. **Never run on a device.**

### 2026-09-15 — CI on every push and PR to master

- **Decision**: `.github/workflows/ci.yml` runs typecheck, lint, `jest --ci`, and an
  Android bundle on every push and PR to `master`, on Node 22.
- **Why**: The architecture's central bet is that two developers can work parallel
  verticals without blocking each other, and the only thing holding that together is a
  shared foundation nobody was automatically re-checking. 139 tests existed and ran only
  when someone remembered. A foundation regression would have surfaced as the _other_
  developer's vertical breaking.
- **Decision**: `expo export` is included even though it is the slowest step. It is the
  only check that exercises Metro, so it is the only one that catches a broken asset
  path — a renamed sprite typechecks and lints clean and fails only here.
- **Decision**: `expo-doctor` runs `continue-on-error: true`. It queries Expo's servers
  for version-compatibility data, so a network hiccup would redden an otherwise good PR.
  Read it when it goes red rather than ignoring it by habit.
- **Consequence**: a leaked timer that leaves jest hanging with every test green now
  shows up as a 20-minute job timeout rather than an invisible local annoyance.
- **Status**: Every step verified locally against this repo; **the workflow itself has
  never run on GitHub.**

---

### 2026-09-15 — `react-test-renderer` is a declared devDependency

- **Decision**: Added `react-test-renderer` to `devDependencies` explicitly, pinned to the
  19.2.3 already in the tree.
- **Why**: The screen tests `import` it directly, but it was only present transitively via
  `jest-expo` — while its _types_ were already a direct devDependency. Depending on a
  transitive package for a direct import breaks silently the day the parent drops it, and
  having the types declared but not the implementation was incoherent.
- **Consequence**: still dev-only and absent from the app bundle. This corrects an earlier
  claim that the screen tests added no dependency — true for runtime, not for dev.

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

---

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
