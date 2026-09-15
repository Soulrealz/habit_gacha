# Daily Summoner — Duplicate Economy & Character Ranks

**Date:** 2026-09-15
**Status:** Approved design, pending implementation plan
**Scope:** What duplicate pulls are worth, and what the collection is ultimately for

---

## 1. The question this answers

`docs/next-steps.md` §2 names two questions and insists they are one:

- Pulling a character you already own increments `copies` and shows `×2`. Nothing
  consumes it.
- Which means: what _is_ the reward? Right now it is a picture.

v1 deferred this deliberately as the "trash pull economy"
(`2026-09-12-core-loop-design.md` §11). `owned_characters.copies` has counted duplicates
since migration 0 precisely so it could be designed later. That bet now pays off.

**The answer: characters grow.** A duplicate is not consolation for missing a new
character — it is investment in one you already have. What growth yields is **art and
lore**, never power. Nothing in this design touches habit logging, ticket earning, pull
rates, or the pity guarantee.

## 2. What was rejected, and why

Recorded so these are not re-litigated.

| Rejected                                          | Why                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completionist gallery (dupes → targeted pulls)    | Caps out the moment the roster completes, and the roster is small                                                                                             |
| Growth that pays the habit layer                  | Makes the gacha economically load-bearing on the tracker, entangles with streaks (§3 of next-steps) and forces tuning rates the docs say not to tune casually |
| Growth feeding a light second game                | Expeditions/auto-battles are a second product competing with the habit loop for attention                                                                     |
| Rank as pure trophy number                        | A number with no consequence reads as hollow                                                                                                                  |
| A new artwork per rank                            | 5 ranks × 9 characters = 45 commissions before it works, and the roster is supposed to grow                                                                   |
| **Shards** (dupes melt into a spendable currency) | Rejected knowingly, with the 5★ problem in §8 stated first. Direct dupes keep rank a function of `copies` and keep the "investment" fantasy intact            |
| Persisting rank in a `character_progress` table   | Buys NEW-badges and a shard migration path; shards were rejected, so it buys nothing today and adds a second source of truth that can disagree with `copies`  |
| Per-character border toggle                       | A row and a control per character for a cosmetic most people set once                                                                                         |

## 3. The ladder

Every character has the same shape — a base state, then **five ranks**. Uniform shape
keeps the UI and the explanation uniform. Only the _cost_ varies by rarity.

| Rank | Unlocks                                                   | Asset cost        |
| ---- | --------------------------------------------------------- | ----------------- |
| base | Name and sprite (what exists today)                       | —                 |
| R1   | Epithet — `lore[0]`                                       | text              |
| R2   | Background — `lore[1]`                                    | text              |
| R3   | Personal line, in the character's own voice — `lore[2]`   | text              |
| R4   | A decorative border on the character, globally toggleable | code-drawn        |
| R5   | Alternate artwork                                         | 1 piece/character |

Three text ranks, then two visual ones. R4's border is code-drawn so the whole art bill
for this feature is **one additional piece per character**.

### Copy thresholds

Copies required to _reach_ each rank, inclusive of the first copy that granted the
character.

| Rarity | R1  | R2  | R3  | R4  | R5  |
| ------ | --- | --- | --- | --- | --- |
| 3★     | 3   | 8   | 15  | 25  | 40  |
| 4★     | 2   | 4   | 7   | 11  | 16  |
| 5★     | 2   | 3   | 4   | 5   | 6   |

The inverse relationship is the point: 3★ pulls are 84.5% of all pulls and would
otherwise be noise, so 3★ ladders are long enough to absorb the flood. 5★ duplicates
arrive every few weeks, so a single one must be an event.

**Derivation** — production rates, 5 tickets/day spent, today's roster of 2 × 5★,
3 × 4★, 4 × 3★:

| Rarity | Pulls/day of that rarity      | Per character/day | Copies to R5 | ≈ Time to R5 |
| ------ | ----------------------------- | ----------------- | ------------ | ------------ |
| 3★     | 4.23                          | 1.06              | 40           | ~5 weeks     |
| 4★     | 0.75                          | 0.25              | 16           | ~9 weeks     |
| 5★     | 0.097 (effective, incl. pity) | 0.048             | 6            | ~4 months    |

The 3★ and 4★ figures use the raw config rates and are therefore very slightly optimistic:
pity-granted 5★ pulls displace some of them. The error is under 1.5% and does not move
any threshold, but the numbers are estimates, not guarantees.

### ⚠ These thresholds are supply-sensitive to roster size

Every character added to `src/data/characters.ts` dilutes per-character copies within its
rarity. Doubling the 5★ roster from 2 to 4 doubles the time to R5 on any given 5★, from
~4 months to ~8.

`docs/next-steps.md` §1 says the roster **must** grow well past nine. **Growing the roster
and re-checking these thresholds are the same task.** Anyone who does one without the
other will quietly make the ladder unreachable.

## 4. Architecture — rank is derived, not stored

`rank = f(rarity, copies)`. `owned_characters.copies` remains the single source of truth
for progression. Nothing about the summon path, the write queue, or `recordCharacterOn`
changes.

Consequences:

- **No migration for rank itself**, and no new write path. A duplicate already increments
  `copies`; that is now also a rank-up.
- Rank cannot drift from copies, because there is nothing to drift from.
- The logic is pure and exhaustively testable without the native SQLite module.

### New module: `src/services/collection/rank.ts`

Pure, no I/O, no database import.

```ts
export function rankFor(rarity: Rarity, copies: number): number; // 0–5
export function copiesToNextRank(rarity: Rarity, copies: number): number | null; // null at max
export function unlockedLore(character: Character, copies: number): string[];
```

### Config: `src/config/gacha.ts`

Rank thresholds are game-balance numbers, so per `CLAUDE.md` they live in `gacha.ts` and
nowhere else:

```ts
export const RANK_THRESHOLDS: Record<Rarity, [number, number, number, number, number]>;
```

A fixed-length tuple, not `number[]`, so a rarity with the wrong number of thresholds is
a compile error.

**`RANK_THRESHOLDS` is NOT overridden in `DEV_GACHA_CONFIG`.** The dev overrides cover
rates only — the same precedent as `dailyTicketCap`, recorded in `OPEN-ITEMS.md`. To
exercise high ranks while developing, lower the thresholds as a local uncommitted edit
and revert before the PR.

### Data: `src/data/characters.ts`

`Character` gains two fields:

```ts
lore: [string, string, string]; // R1, R2, R3 — a tuple, not string[]
altSprite: ImageSourcePropType; // R5
```

`lore` is a tuple so a character missing an entry fails `tsc` rather than rendering a
blank panel at R2. Both fields are required, so adding a character to the roster cannot
silently skip them.

### The one migration this design needs

R4's border is toggleable, which is stored user preference. `MIGRATIONS` is append-only,
so this is migration index 1:

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

A generic key/value table rather than a `show_rank_borders` column on `player_state`,
because streaks and ad consent will both want somewhere to live and neither should cost
its own migration. The border setting is the key `show_rank_borders`, default on when
absent.

Writes to `settings` go through `withWriteTransaction` like every other write. No
exceptions, no direct `db.withTransactionAsync`.

## 5. UI

### Collection grid (`CollectionScreen`)

Each owned cell gains a compact rank indicator — five pips, filled to the character's
rank. Cells become tappable, opening the detail screen. Locked characters are unchanged
and not tappable.

### New: `CharacterDetailScreen`

- The artwork, large. The alternate artwork at R5, the base sprite below it.
- Rank pips and the rank name.
- The lore entries. **Locked entries are shown as locked, not hidden** — you can see
  there is something to earn, which is the whole motivational point.
- "3 more copies to Rank 2", from `copiesToNextRank`. At max rank it says so instead.
- The border, when the character is R4+ and the global setting is on.

### Settings surface for the border toggle

The toggle goes on the **How it works** tab, which already exists as the app's
non-gameplay screen. This avoids a fifth tab. It is one switch reading and writing
`settings.show_rank_borders`.

### `HowItWorksScreen` gains a ranks section

Explaining that duplicates raise rank and what each rank gives, with the thresholds read
from `RANK_THRESHOLDS` at runtime. It falls under that screen's existing hard constraint:
**no number may be retyped into the copy**, enforced by rendering against a config the app
has never shipped.

## 6. Navigation

The Collection tab needs a stack navigator wrapped around it to hold the detail screen:

```
Tab "Collection" → Stack
                     ├─ CollectionGrid  (the current CollectionScreen)
                     └─ CharacterDetail
```

The other three tabs are untouched.

## 7. Testing

| Target                  | Tests                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `rank.ts`               | Every threshold boundary: exactly at, one below, one above, and far beyond max for each rarity. `copies: 0` and `copies: 1`.                 |
| Config invariant        | Every rarity's ladder is strictly increasing, and every entry ≥ 1. This is what catches a fat-fingered tune.                                 |
| Config completeness     | `RANK_THRESHOLDS` has an entry for every `Rarity`.                                                                                           |
| Data completeness       | Every character in `CHARACTERS` has three lore entries and an `altSprite` that resolves.                                                     |
| `CharacterDetailScreen` | Locked lore renders as locked, not absent; the alt artwork appears only at R5; the "copies to next rank" line is correct and says so at max. |
| Border toggle           | Off hides the border at R4+; on shows it; a missing settings row defaults to on.                                                             |
| `CollectionScreen`      | Pips reflect rank; locked characters are not tappable.                                                                                       |
| `HowItWorksScreen`      | The ranks section tracks `RANK_THRESHOLDS` against an unshipped config, same as the rates.                                                   |

## 8. The 5★ problem — accepted knowingly

Direct duplicates mean the characters you most want to invest in are the ones you can
least often feed. At production rates a specific 5★ gains a copy roughly every three
weeks, and that worsens linearly as the 5★ roster grows.

This was put in front of the decision-maker with the maths before direct dupes were
chosen over shards. It is accepted, with two mitigations built in:

1. The 5★ ladder is short — 6 copies to max, against 40 for a 3★.
2. R1 lands on the _second_ copy, so the first 5★ duplicate ever pulled immediately
   unlocks something.

**If this proves too slow in practice, the fix is to lower the 5★ thresholds in
`RANK_THRESHOLDS`, not to introduce shards.** Shards were rejected on the fantasy, not on
the maths.

## 9. Deferred

### R6 — animated portrait (documented, not built)

A sixth rank unlocking a subtly animated version of the character: hair drifting, a small
hand or cloth movement, a slow blink. Deliberately understated — not a full animation, an
image with a few moving elements.

Not built now, and **not** merely because of effort:

- It is the most expensive asset tier by a wide margin, and the base artwork does not
  exist yet — nine placeholders are still in `assets/characters/`. Animating art you have
  not commissioned is out of order.
- Format is undecided. GIF is simple and looks poor at these sizes; a short looping video,
  a sprite sheet, and Lottie/Rive each have different bundle-size, licence and
  React Native support consequences. That is its own design cycle.
- It needs a threshold above 40 copies for a 3★, and 40 alone is already ~5 weeks of
  playing at the cap every single day. The supply maths in §3 has to be revisited before
  a sixth rank is reachable at all.

What this design does for R6 now: nothing in §4 blocks it. `RANK_THRESHOLDS` is a tuple
whose length is the rank count, so adding R6 is a data change plus a tuple widening, with
**no migration** — `copies` keeps counting regardless.

### Also deferred

- **NEW badges on freshly unlocked lore.** Needs a "last seen rank" marker, the only
  thing the rejected `character_progress` table would have bought. Defer until the badge
  is actually missed.
- **Per-character border toggle.** Global first; revisit only if people ask.
- **Streaks** (`next-steps.md` §3) remain sequenced after this design, unchanged.

## 10. What this design does NOT touch

Stated explicitly, because the verticals share few files and this one reaches across
them:

- Habit logging, `adjustHabitCount`, and the ticket seam — untouched.
- `getGachaConfig()` rates, `pityThreshold`, `dailyTicketCap` — untouched.
- `performSummon` and the write queue — untouched. A duplicate already increments
  `copies`; that is now also a rank-up, with no new write.
- The `owned_characters` table — untouched. The new `settings` table is additive.

### Shared foundation files this design modifies

Both belong to the foundation rather than either vertical, and per `next-steps.md` that
means a conversation rather than a unilateral edit:

- `src/config/gacha.ts` — gains `RANK_THRESHOLDS`
- `src/navigation/index.tsx` — the Collection tab becomes a stack
- `src/services/db/schema.ts` — gains migration index 1

## 11. Open item for implementation

Nine alternate-artwork placeholders are needed before R5 can be seen.
`scripts/generate-placeholder-sprites.mjs` still exists and can produce them.
`next-steps.md` §1 says to delete that script when real art lands; it now lives until
both the base and alternate art are commissioned.
