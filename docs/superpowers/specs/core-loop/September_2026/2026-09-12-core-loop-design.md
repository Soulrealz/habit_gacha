# Daily Summoner — v1 Core Loop Design

**Date:** 2026-09-12
**Status:** Approved design, pending implementation plan
**Scope:** v1 — gym habits → summoning tickets → gacha pulls → collection

---

## 1. Product concept

A habit tracker with a gacha reward loop. Completing daily habits earns
summoning tickets; tickets are spent pulling for collectible characters.
The habit work is the "grind" and the character pull is the payoff.

v1 proves exactly one thing: **that the loop is satisfying.** Log a gym
habit, earn a ticket, summon, get a character, see it in your collection.

## 2. Scope

**In scope for v1:**

- Preset gym habit catalog with counter-based logging
- Ticket earning, capped at 5 per day across all habits
- Gacha pull with real probability rates and a pity guarantee
- Character collection view with duplicate tracking
- Full local persistence across app restarts

**Explicitly out of scope for v1** (each is a later design cycle):

- Rewarded ads / monetization
- Streaks and streak-saving
- Non-gym habit categories (studying, nutrition beyond protein, etc.)
- Duplicate/"trash pull" conversion economy
- Any backend, account system, or cloud sync

## 3. Decisions

| Decision         | Choice                                   | Rationale                                                      |
| ---------------- | ---------------------------------------- | -------------------------------------------------------------- |
| Habit definition | Preset catalog only                      | Keeps the economy un-cheatable and the data model simple       |
| Habit logging    | Daily counter with quick-add buttons     | Matches "do X, Y times"; supports partial progress             |
| Daily ticket cap | 5/day across all categories              | Bounds the economy regardless of habit count                   |
| 5★ rate          | 0.5% per pull, hard pity at 60           | Produces a ~52-pull average, matching the "50–60 pulls" target |
| Tunables         | Single `config/gacha.ts`                 | Rates are never hard-coded; balance changes touch no vertical  |
| Team structure   | Foundation phase, then feature verticals | Pays off the shared floor once so verticals never contend      |

## 4. Data model

### Static data (TypeScript constants, not database)

Habit and character catalogs ship as code. Sprites are bundled in the
binary regardless, so adding content is a code change requiring no
migration.

```ts
type Habit = {
  id: string;
  name: string;
  category: 'gym';
  target: number;
  unit: string;
  ticketReward: number;
  quickAdd: number[]; // increment amounts offered as buttons
};

type Character = {
  id: string;
  name: string;
  rarity: 3 | 4 | 5;
  sprite: ImageSourcePropType;
};
```

**v1 gym catalog** (7 habits × 1 ticket = 7 potential, capped at 5):

| id            | name         | target | unit    | ticketReward | quickAdd         |
| ------------- | ------------ | ------ | ------- | ------------ | ---------------- |
| `pullups`     | Pull-ups     | 10     | reps    | 1            | [1, 5, 10]       |
| `pushups`     | Push-ups     | 30     | reps    | 1            | [5, 10, 20]      |
| `squats`      | Squats       | 30     | reps    | 1            | [5, 10, 20]      |
| `plank`       | Plank        | 60     | seconds | 1            | [15, 30, 60]     |
| `run`         | Run          | 2000   | m       | 1            | [250, 500, 1000] |
| `gym_session` | Gym session  | 1      | session | 1            | [1]              |
| `protein`     | Protein goal | 1      | day     | 1            | [1]              |

`run` is measured in metres rather than kilometres so that `habit_logs.count`
stays an INTEGER column. Sub-kilometre increments would otherwise require a
REAL column and float-comparison handling in the completion check.

Potential daily earnings deliberately exceed the cap, so the cap is live
behaviour rather than dead code, and users get to choose which habits to
prioritise.

### SQLite tables

```sql
habit_logs (
  habit_id     TEXT NOT NULL,
  log_date     TEXT NOT NULL,          -- local 'YYYY-MM-DD'
  count        INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,                   -- set once count >= target, else NULL
  PRIMARY KEY (habit_id, log_date)
);

ticket_ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  delta      INTEGER NOT NULL,         -- +n earned, -1 spent
  reason     TEXT NOT NULL,            -- 'habit:pullups' | 'summon'
  log_date   TEXT NOT NULL,            -- local date, for the daily cap query
  created_at TEXT NOT NULL
);

player_state (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  pity_counter INTEGER NOT NULL DEFAULT 0
);

owned_characters (
  character_id      TEXT PRIMARY KEY,
  copies            INTEGER NOT NULL DEFAULT 1,
  first_obtained_at TEXT NOT NULL
);
```

### Why a ledger instead of a balance column

- Balance is `SUM(delta)`.
- Today's earnings are `SUM(delta) WHERE delta > 0 AND log_date = today`,
  which is exactly the daily-cap check.
- It provides an audit trail for debugging the economy.
- Habits only ever append positive rows; gacha only ever appends negative
  rows. Neither vertical reads the other's tables.

`owned_characters.copies` tracks duplicates from day one so the deferred
"trash pull" economy needs no migration when it is designed.

### Award semantics

A habit awards its tickets **once per day**, at the moment `count` first
reaches `target`. `completed_at` is the guard: if it is already set, no
further award occurs no matter how much higher the count climbs.

Awards are **not clawed back**. If a user decrements a count back below
target after completing it, `completed_at` stays set and the tickets
remain earned. Reversing an award would let the ledger disagree with the
cap accounting, and the honour-system framing makes the exploit
uninteresting.

### Local date handling

`log_date` is the **local** calendar date. A single shared helper
(`lib/date.ts`) defines "today" and is imported by both verticals.
Without it, the two verticals will disagree at midnight and across DST
transitions.

## 5. Module architecture and ownership

```
src/
  config/gacha.ts          FOUNDATION   all tunable numbers
  types/index.ts           FOUNDATION   shared types
  lib/date.ts              FOUNDATION   local-date helper
  services/
    db/                    FOUNDATION   init, schema, migrations
    tickets/               FOUNDATION   the cross-vertical seam
    habits/                DEV 1
    gacha/                 DEV 2
    collection/            DEV 2
  data/
    habits.ts              DEV 1
    characters.ts          DEV 2
  screens/
    TodayScreen.tsx        DEV 1
    SummonScreen.tsx       DEV 2
    CollectionScreen.tsx   DEV 2
  navigation/index.tsx     FOUNDATION
```

After Phase 0, the two verticals share no files.

### The ticket seam

`services/tickets` is the only module both verticals import:

```ts
awardTickets(reason: string, amount: number): Promise<number>;  // returns amount ACTUALLY awarded
spendTicket(): Promise<boolean>;                                 // false if balance is 0
getBalance(): Promise<number>;
```

`awardTickets` returns the actually-awarded amount because the daily cap
may clip the request. Dev 1 needs that value to render "daily cap
reached" rather than silently misreporting the award. Dev 2 never calls
`awardTickets`; Dev 1 never calls `spendTicket`.

### The roll engine

```ts
rollOne(rng: () => number, pity: number, config: GachaConfig): RollResult;
```

Pure, synchronous, injected RNG, no database access. All persistence
lives in a thin wrapper above it. This makes the most rules-dense part of
the app deterministically testable in isolation.

## 6. Gacha mechanics

### Configuration

```ts
export const GACHA_CONFIG = {
  fiveStarRate: 0.005,
  fourStarRate: 0.15,
  pityThreshold: 60,
  dailyTicketCap: 5,
};
```

No rate or threshold appears anywhere else in the codebase.

### Rarity tiers

| Tier | Rate  | Notes                                           |
| ---- | ----- | ----------------------------------------------- |
| 5★   | 0.5%  | The featured characters. Hard pity at 60.       |
| 4★   | 15%   | Mid-tier. No pity in v1.                        |
| 3★   | 84.5% | The common bucket. No conversion economy in v1. |

### Pity rules

1. The pity counter increments on **every** pull.
2. It resets to 0 on **any** 5★ — whether won naturally off the 0.5% roll
   or granted by pity.
3. The 60th consecutive pull without a 5★ is guaranteed to be a 5★.

### Expected pacing

With a 0.5% rate and hard pity at 60, the average pull count to a 5★ is
**~52**. At the 5/day cap that is one 5★ roughly every **10–11 days**.
About 74% of 5★s arrive via pity, so pity is the dominant path rather
than a rare fallback — which is what makes "50–60 pulls" the typical
experience rather than the worst case.

### Development override

A `__DEV__`-gated rate override lets both developers see 5★ pulls without
grinding ~52 real ones. It must be inert in production builds.

## 7. Development track

### Phase 0 — Foundation

The only blocking dependency in the project. One developer, roughly one
day, on `feat/foundation`:

- SQLite init, schema, migration runner
- `config/gacha.ts`
- `lib/date.ts`
- `types/index.ts`
- `services/tickets` with unit tests
- Navigation shell with three empty screens

Merged before Phase 1 begins.

In parallel, the other developer builds the **asset pipeline**: generating
sprites, settling naming and sizing conventions, and defining the shape of
`data/characters.ts`. This work has no dependency on the foundation.

### Phase 1 — Parallel verticals

No shared files; neither developer blocks the other.

**Dev 1 — `feat/habit-tracking`**

- `data/habits.ts` gym catalog
- `services/habits/` — counter increments, completion detection, calls
  `awardTickets` on completion
- `TodayScreen` — counters, quick-add buttons, progress, ticket balance

**Dev 2 — `feat/gacha-summon`**

- `data/characters.ts` plus bundled sprites
- `services/gacha/engine.ts` — pure roll engine and test suite
- `services/gacha/index.ts` — persistence wrapper
- `services/collection/`
- `SummonScreen` and `CollectionScreen`

### Phase 2 — Integration

Both developers: real-device testing, first-run and empty states, and the
5★ reveal animation. The reveal deserves genuine attention — it is the
payoff the entire app exists to deliver.

### Definition of done for v1

Install on a physical device; log pull-ups; earn a ticket; summon; see the
character in the collection; confirm all state survives an app restart.

## 8. Testing strategy

`expo-sqlite` is a native module and cannot execute under Jest in Node.
Rather than introduce a second SQLite driver purely for tests, every rule
that is worth testing is extracted into a **pure function** that takes its
inputs as arguments, and the database layer above it is kept thin enough
to be verified on device.

- **Roll engine** (`services/gacha/engine.ts`): heavy unit tests with
  seeded RNG — rate distribution over large samples, pity fires at exactly
  60, pity resets on a natural 5★.
- **Cap logic** (`services/tickets/cap.ts`): pure `clampAward` covering
  under-cap, clipped-at-cap, and at-cap cases.
- **Completion logic** (`services/habits/completion.ts`): pure
  `shouldAward` covering the target-crossing edges and the
  already-completed guard.
- **Date helper** (`lib/date.ts`): local-date formatting, including a case
  that would break under a naive UTC implementation.
- **Database wrappers and screens:** manual device testing. React Native
  component tests are deliberately not part of v1 — low value at this
  stage.

This is the reason the pure/persistent split in §5 matters: it is what
makes the rules testable at all.

## 9. Error handling

1. **Double-spend on summon.** Rapid taps could spend one ticket twice or
   produce two rolls from one spend. Three layers address this:
   - `spendTicket` reads the balance and inserts its debit row inside one
     transaction. SQLite serialises transactions, so two concurrent calls
     against a balance of 1 cannot both succeed — the second reads 0 and
     returns `false`. This is what actually prevents a double spend.
   - The summon button disables while a pull is in flight.
   - A module-level in-flight guard in the summon service rejects a second
     concurrent call even if the UI guard is bypassed.

   The spend, roll, and persist steps deliberately do **not** share one
   transaction: `spendTicket` owns its own, and SQLite cannot nest
   transactions. The residual window is a crash between spending and
   persisting, which can lose a ticket but can never duplicate a character
   or grant one for free.

2. **Database init failure.** Local-only storage makes this rare but
   unrecoverable. Initialisation is wrapped so failure renders an explicit
   error screen rather than a blank app.
3. **Cap clipping.** `awardTickets` returning the actual amount lets the
   UI distinguish "earned 1 ticket" from "cap reached, earned 0".

## 10. Housekeeping

- `CLAUDE.md` states the trunk branch is `main`, but the repository's
  trunk is `master`. Update `CLAUDE.md` to say `master`; renaming a shared
  branch is more disruptive than correcting the document.
- Branch naming already established: `feat/<short-description>` and
  `bug/<short-description>`.

## 11. Deferred

These are decided deferrals, not open questions. Each gets its own design
cycle when its time comes.

- **Duplicate economy.** What 3★ duplicates convert into. The `copies`
  column already captures the data needed.
- **Rewarded ads.** Extra daily pull and streak-saving, via an ad SDK not
  yet selected.
- **Streaks.** Consecutive-day tracking and break consequences.
- **Additional habit categories.** Studying and others, expanding beyond
  the gym catalog.
- **4★ pity.** Only 5★ is pitied in v1.
