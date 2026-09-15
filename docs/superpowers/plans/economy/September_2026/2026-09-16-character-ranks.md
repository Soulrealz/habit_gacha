# Character Ranks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make duplicate pulls worth something by turning `owned_characters.copies` into a five-rank ladder that unlocks lore, a decorative border, and alternate artwork.

**Architecture:** Rank is **derived**, never stored — `rank = f(rarity, copies)` over the `copies` column that has existed since migration 0. No change to the summon path, the write queue, or the ticket seam. The only persisted state this adds is one global UI preference, which gets a new generic `settings` key/value table.

**Tech Stack:** Expo 57 (managed), React Native 0.86, TypeScript strict, `expo-sqlite`, `@react-navigation/native` + `bottom-tabs` (+ `native-stack`, added in Task 5), Jest via `jest-expo`, `react-test-renderer`.

**Spec:** `docs/superpowers/specs/economy/September_2026/2026-09-15-economy-design.md`

## Global Constraints

- **Do NOT create git commits.** The repo owner commits all work themselves. Every task ends by reporting completion and handing them a one-line commit message. Never run `git add`, `git commit`, `git push`, `git stash`, `git checkout`, or `git reset`. Read-only git is fine.
- **Every tunable game-balance number lives in `src/config/gacha.ts` and nowhere else.** Never hard-code a rate, pity threshold, daily cap, or rank threshold anywhere else.
- **Every database write goes through `withWriteTransaction` from `src/services/db`**, with all queries on the `txn` handle it passes. Never call `db.withExclusiveTransactionAsync` or `db.withTransactionAsync` directly. It is a process-global mutex that _rejects_ nested writes — a write started from inside another write callback fails loudly.
- **Named exports only**, except framework-required entry points (`App.tsx`, `index.ts`).
- **Functional components only.** No class components.
- **Strict TypeScript.** Avoid `any`; explicit types on public function signatures.
- **Prettier owns formatting** — never hand-format. Run `npx prettier --write <the files you touched>`. Do NOT run `npx prettier --write .`: seven files are already prettier-unclean on master and a repo-wide write would reformat them, bundling unrelated changes.
- `RANK_THRESHOLDS` is **not** overridden in dev. Dev config overrides rates only — same precedent as `dailyTicketCap`. To exercise high ranks while developing, lower the thresholds as a local uncommitted edit and revert before the PR.
- **Growing the roster and re-checking the thresholds are the same task.** Adding characters dilutes per-character copy supply within a rarity.
- Verify with `npx jest`, `npx tsc --noEmit`, and `npx expo lint` before declaring a task done.
- Expo has changed — read https://docs.expo.dev/versions/v57.0.0/ before writing Expo-specific code.

---

## File Structure

| File                                       | Responsibility                                      | Task |
| ------------------------------------------ | --------------------------------------------------- | ---- |
| `src/types/index.ts`                       | `Character` gains `lore` tuple + `altSprite`        | 1    |
| `src/data/characters.ts`                   | The nine characters' lore and alt sprite references | 1    |
| `scripts/generate-placeholder-sprites.mjs` | Also emits `<id>_alt.png`                           | 1    |
| `src/config/gacha.ts`                      | `RANK_THRESHOLDS` + `getRankThresholds()`           | 2    |
| `src/services/collection/rank.ts`          | Pure rank maths — the only place rank is computed   | 2    |
| `src/services/db/schema.ts`                | Migration index 1: the `settings` table             | 3    |
| `src/services/settings/index.ts`           | Generic key/value settings, plus the border flag    | 3    |
| `src/screens/CharacterDetailScreen.tsx`    | Art, rank pips, lore, copies-to-next                | 4    |
| `src/navigation/index.tsx`                 | Collection tab becomes a stack                      | 5    |
| `src/screens/CollectionScreen.tsx`         | Rank pips on cells; cells become tappable           | 5    |
| `src/components/RankBorder.tsx`            | The code-drawn R4 border                            | 6    |
| `src/screens/HowItWorksScreen.tsx`         | Border toggle + the ranks explainer                 | 6, 7 |

**Foundation files touched** (shared, not either vertical's): `src/config/gacha.ts`, `src/navigation/index.tsx`, `src/services/db/schema.ts`, `src/types/index.ts`. The spec §10 records this.

---

## Task 1: Character lore and alternate sprites

**Files:**

- Modify: `src/types/index.ts` — the `Character` type
- Modify: `src/data/characters.ts` — all nine entries
- Modify: `scripts/generate-placeholder-sprites.mjs` — emit alt sprites
- Create: `assets/characters/{aria,brin,caul,dax,echo,fen,gale,hex,iris}_01_alt.png` (generated, not hand-written)
- Test: `src/data/__tests__/characters.test.ts` (this file already exists — add to it)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `Character.lore: [string, string, string]` and `Character.altSprite: ImageSourcePropType`, consumed by Tasks 2 and 4.

- [ ] **Step 1: Write the failing test**

Append to `src/data/__tests__/characters.test.ts`:

```ts
describe('character rank content', () => {
  it('gives every character exactly three lore entries, none blank', () => {
    for (const character of CHARACTERS) {
      expect(character.lore).toHaveLength(3);
      for (const entry of character.lore) {
        expect(entry.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every character an alternate sprite distinct from the base one', () => {
    for (const character of CHARACTERS) {
      expect(character.altSprite).toBeDefined();
      expect(character.altSprite).not.toBe(character.sprite);
    }
  });

  it('does not reuse one character lore entry on another character', () => {
    const all = CHARACTERS.flatMap((character) => character.lore);
    expect(new Set(all).size).toBe(all.length);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/data/__tests__/characters.test.ts`
Expected: FAIL — `character.lore` is `undefined`, so `toHaveLength` throws.

- [ ] **Step 3: Extend the `Character` type**

In `src/types/index.ts`, replace the `Character` type with:

```ts
export type Character = {
  id: string;
  name: string;
  rarity: Rarity;
  sprite: ImageSourcePropType;
  /**
   * Revealed one entry per rank at R1, R2, R3: epithet, background, personal line.
   * A fixed-length tuple rather than `string[]` on purpose — a character missing an
   * entry is then a compile error instead of a blank panel on the detail screen.
   */
  lore: [string, string, string];
  /** Unlocked at R5. */
  altSprite: ImageSourcePropType;
};
```

`tsc` now fails on all nine characters. That is expected and is fixed by Step 4.

- [ ] **Step 4: Generate the alternate placeholder sprites**

In `scripts/generate-placeholder-sprites.mjs`, replace `spriteFor` and the write loop at the bottom of the file with:

```js
// `alt` inverts the sprite — rarity-coloured glyph on near-black, inside a rarity
// border — so the R5 unlock is unmistakably a different image on screen. Still not
// art; see the header comment.
const ALT_BACKGROUND = [0x21, 0x25, 0x29];
const ALT_BORDER = 14;

function spriteFor({ letter, rarity }, alt = false) {
  const colour = RARITY_COLOURS[rarity];
  const glyph = GLYPHS[letter];
  const glyphPixelW = GLYPH_W * SCALE;
  const glyphPixelH = GLYPH_H * SCALE;
  const originX = Math.floor((SIZE - glyphPixelW) / 2);
  const originY = Math.floor((SIZE - glyphPixelH) / 2);

  return encodePng(SIZE, SIZE, (x, y) => {
    const gx = Math.floor((x - originX) / SCALE);
    const gy = Math.floor((y - originY) / SCALE);
    const inGlyph = gx >= 0 && gx < GLYPH_W && gy >= 0 && gy < GLYPH_H && glyph[gy][gx] === '#';

    if (!alt) {
      return inGlyph ? INK : colour;
    }

    const inBorder =
      x < ALT_BORDER || y < ALT_BORDER || x >= SIZE - ALT_BORDER || y >= SIZE - ALT_BORDER;
    if (inBorder) {
      return colour;
    }
    return inGlyph ? colour : ALT_BACKGROUND;
  });
}

mkdirSync(OUT_DIR, { recursive: true });
for (const character of CHARACTERS) {
  writeFileSync(join(OUT_DIR, `${character.id}.png`), spriteFor(character, false));
  writeFileSync(join(OUT_DIR, `${character.id}_alt.png`), spriteFor(character, true));
  console.log(`wrote ${character.id}.png + _alt.png  (${character.letter}, ${character.rarity}★)`);
}
console.log(`\n${CHARACTERS.length * 2} placeholder sprites written to assets/characters/`);
```

Then run: `node scripts/generate-placeholder-sprites.mjs`
Expected output: `18 placeholder sprites written to assets/characters/`

- [ ] **Step 5: Fill in the character data**

In `src/data/characters.ts`, give every entry `lore` and `altSprite`. The full array:

```ts
export const CHARACTERS: Character[] = [
  {
    id: 'aria_01',
    name: 'Aria',
    rarity: 5,
    sprite: require('../../assets/characters/aria_01.png'),
    altSprite: require('../../assets/characters/aria_01_alt.png'),
    lore: [
      'The First Light',
      'Kept the lamp on the last road out of the valley, and never once let it go out — not in storms, not in the years nobody came.',
      '"Get up. The morning is not waiting for either of us."',
    ],
  },
  {
    id: 'brin_01',
    name: 'Brin',
    rarity: 5,
    sprite: require('../../assets/characters/brin_01.png'),
    altSprite: require('../../assets/characters/brin_01_alt.png'),
    lore: [
      'The Unbroken Vow',
      'Made one promise, to one person, a very long time ago. Has structured every day since around keeping it.',
      '"I am not stronger than you. I have just been at this longer."',
    ],
  },
  {
    id: 'caul_01',
    name: 'Caul',
    rarity: 4,
    sprite: require('../../assets/characters/caul_01.png'),
    altSprite: require('../../assets/characters/caul_01_alt.png'),
    lore: [
      'The Quiet Hour',
      'Works before dawn, when the halls are empty and there is nobody to perform for. Insists this is the only honest time of day.',
      '"Nobody is watching. That is rather the point."',
    ],
  },
  {
    id: 'dax_01',
    name: 'Dax',
    rarity: 4,
    sprite: require('../../assets/characters/dax_01.png'),
    altSprite: require('../../assets/characters/dax_01_alt.png'),
    lore: [
      'The Iron Count',
      'Counts everything — steps, breaths, repetitions. Claims the counting is not discipline but company.',
      '"Eight. Nine. See? Already further than yesterday."',
    ],
  },
  {
    id: 'echo_01',
    name: 'Echo',
    rarity: 4,
    sprite: require('../../assets/characters/echo_01.png'),
    altSprite: require('../../assets/characters/echo_01_alt.png'),
    lore: [
      'The Second Wind',
      'Turns up precisely when someone has decided to stop, and has never been thanked for it at the time.',
      '"You said that five minutes ago and you are still going."',
    ],
  },
  {
    id: 'fen_01',
    name: 'Fen',
    rarity: 3,
    sprite: require('../../assets/characters/fen_01.png'),
    altSprite: require('../../assets/characters/fen_01_alt.png'),
    lore: [
      'The Early Riser',
      'Has never needed an alarm and finds the concept faintly insulting. Is insufferable about this.',
      '"It is a beautiful morning. It has been for three hours."',
    ],
  },
  {
    id: 'gale_01',
    name: 'Gale',
    rarity: 3,
    sprite: require('../../assets/characters/gale_01.png'),
    altSprite: require('../../assets/characters/gale_01_alt.png'),
    lore: [
      'The Long Walk',
      'Measures journeys in days rather than distance, and has opinions about people who sprint the first mile.',
      '"Slower. You are racing someone who is not here."',
    ],
  },
  {
    id: 'hex_01',
    name: 'Hex',
    rarity: 3,
    sprite: require('../../assets/characters/hex_01.png'),
    altSprite: require('../../assets/characters/hex_01_alt.png'),
    lore: [
      'The Stubborn Ember',
      'Refuses, with some style, to go out. Has been written off more times than anyone has bothered to count.',
      '"Still here. Annoying, is it not?"',
    ],
  },
  {
    id: 'iris_01',
    name: 'Iris',
    rarity: 3,
    sprite: require('../../assets/characters/iris_01.png'),
    altSprite: require('../../assets/characters/iris_01_alt.png'),
    lore: [
      'The Patient Bloom',
      'Plants things that will not flower for years, and considers this entirely reasonable.',
      '"You will not see today\'s work today. Do it anyway."',
    ],
  },
];
```

- [ ] **Step 6: Verify**

Run: `npx jest src/data/__tests__/characters.test.ts && npx tsc --noEmit && npx expo lint`
Expected: tests PASS, `tsc` silent, lint silent.

Then `npx prettier --write src/types/index.ts src/data/characters.ts scripts/generate-placeholder-sprites.mjs`

- [ ] **Step 7: Stop and report — do NOT commit**

Report the test count and hand over this one-line commit message:

```
give characters lore tiers and alternate placeholder sprites
```

---

## Task 2: Rank thresholds and the pure rank module

**Files:**

- Modify: `src/config/gacha.ts`
- Create: `src/services/collection/rank.ts`
- Test: `src/services/collection/__tests__/rank.test.ts`

**Interfaces:**

- Consumes: `Character.lore` from Task 1.
- Produces, all used by Tasks 4–7:
  - `RANK_THRESHOLDS: Record<Rarity, RankThresholds>` and `getRankThresholds(): Record<Rarity, RankThresholds>` from `src/config/gacha`
  - `type RankThresholds = [number, number, number, number, number]`
  - `MAX_RANK: 5`, `rankFor(rarity: Rarity, copies: number): number`, `copiesToNextRank(rarity: Rarity, copies: number): number | null`, `unlockedLore(character: Character, copies: number): string[]` from `src/services/collection/rank`

- [ ] **Step 1: Write the failing test**

Create `src/services/collection/__tests__/rank.test.ts`:

```ts
import { getRankThresholds, RANK_THRESHOLDS } from '../../../config/gacha';
import { CHARACTERS } from '../../../data/characters';
import { copiesToNextRank, MAX_RANK, rankFor, unlockedLore } from '../rank';
import type { Rarity } from '../../../types';

const RARITIES: Rarity[] = [3, 4, 5];

describe('RANK_THRESHOLDS config invariants', () => {
  it('covers every rarity with exactly MAX_RANK thresholds', () => {
    for (const rarity of RARITIES) {
      expect(RANK_THRESHOLDS[rarity]).toHaveLength(MAX_RANK);
    }
  });

  // The test that catches a fat-fingered tune. A non-increasing ladder would make a
  // rank unreachable or skippable without any other test noticing.
  it('gives every rarity a strictly increasing ladder starting above one copy', () => {
    for (const rarity of RARITIES) {
      const thresholds = RANK_THRESHOLDS[rarity];
      expect(thresholds[0]).toBeGreaterThan(1);
      for (let i = 1; i < thresholds.length; i++) {
        expect(thresholds[i]).toBeGreaterThan(thresholds[i - 1]);
      }
    }
  });

  it('is not overridden in dev, unlike the rates', () => {
    expect(getRankThresholds()).toEqual(RANK_THRESHOLDS);
  });
});

describe('rankFor', () => {
  it('is rank 0 for an unowned or single-copy character', () => {
    for (const rarity of RARITIES) {
      expect(rankFor(rarity, 0)).toBe(0);
      expect(rankFor(rarity, 1)).toBe(0);
    }
  });

  // Exactly at, one below, and one above every threshold, for every rarity.
  it('advances exactly on each threshold and not before', () => {
    for (const rarity of RARITIES) {
      const thresholds = RANK_THRESHOLDS[rarity];
      thresholds.forEach((threshold, index) => {
        expect(rankFor(rarity, threshold - 1)).toBe(index);
        expect(rankFor(rarity, threshold)).toBe(index + 1);
      });
    }
  });

  it('caps at MAX_RANK however many copies are held', () => {
    for (const rarity of RARITIES) {
      const top = RANK_THRESHOLDS[rarity][MAX_RANK - 1];
      expect(rankFor(rarity, top)).toBe(MAX_RANK);
      expect(rankFor(rarity, top + 1)).toBe(MAX_RANK);
      expect(rankFor(rarity, top + 10_000)).toBe(MAX_RANK);
    }
  });
});

describe('copiesToNextRank', () => {
  it('counts down to the next threshold', () => {
    for (const rarity of RARITIES) {
      const first = RANK_THRESHOLDS[rarity][0];
      expect(copiesToNextRank(rarity, 1)).toBe(first - 1);
      expect(copiesToNextRank(rarity, first - 1)).toBe(1);
    }
  });

  it('returns null at max rank, so callers must handle "nothing left to earn"', () => {
    for (const rarity of RARITIES) {
      const top = RANK_THRESHOLDS[rarity][MAX_RANK - 1];
      expect(copiesToNextRank(rarity, top)).toBeNull();
      expect(copiesToNextRank(rarity, top + 5)).toBeNull();
    }
  });
});

describe('unlockedLore', () => {
  const character = CHARACTERS[0];

  it('reveals nothing at rank 0', () => {
    expect(unlockedLore(character, 1)).toEqual([]);
  });

  it('reveals one entry per rank up to the third', () => {
    const thresholds = RANK_THRESHOLDS[character.rarity];
    expect(unlockedLore(character, thresholds[0])).toEqual([character.lore[0]]);
    expect(unlockedLore(character, thresholds[1])).toEqual([character.lore[0], character.lore[1]]);
    expect(unlockedLore(character, thresholds[2])).toEqual(character.lore);
  });

  // R4 and R5 unlock a border and artwork, not text — lore must not grow past three.
  it('stops at three entries even at max rank', () => {
    const top = RANK_THRESHOLDS[character.rarity][MAX_RANK - 1];
    expect(unlockedLore(character, top)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/services/collection/__tests__/rank.test.ts`
Expected: FAIL — `Cannot find module '../rank'`.

- [ ] **Step 3: Add the thresholds to the config**

Append to `src/config/gacha.ts`:

```ts
/** One copy threshold per rank, R1 through R5. Fixed length so a short ladder is a compile error. */
export type RankThresholds = [number, number, number, number, number];

/**
 * Copies required to REACH each rank, inclusive of the first copy that granted the
 * character. Rarer characters need fewer copies: 3★ pulls are ~84.5% of all pulls and
 * would otherwise be noise, so their ladders are long enough to absorb the flood, while
 * a 5★ duplicate arrives every few weeks and must therefore be an event.
 *
 * ⚠ Supply-sensitive to roster size. Every character added to `src/data/characters.ts`
 * dilutes per-character copies within its rarity — doubling the 5★ roster doubles the
 * time to R5 on any given 5★. Growing the roster and re-checking these numbers are the
 * same task. See the spec's §3 for the derivation.
 */
export const RANK_THRESHOLDS: Record<Rarity, RankThresholds> = {
  3: [3, 8, 15, 25, 40],
  4: [2, 4, 7, 11, 16],
  5: [2, 3, 4, 5, 6],
};

/**
 * Deliberately NOT dev-overridden, unlike the rates: the same precedent as
 * `dailyTicketCap`. Exists as a function anyway so callers read thresholds exactly the
 * way they read rates, and so the How it works screen can be tested against values the
 * app has never shipped.
 */
export function getRankThresholds(): Record<Rarity, RankThresholds> {
  return RANK_THRESHOLDS;
}
```

The existing `import type { GachaConfig } from '../types';` line must become `import type { GachaConfig, Rarity } from '../types';`.

- [ ] **Step 4: Write the rank module**

Create `src/services/collection/rank.ts`:

```ts
import { getRankThresholds } from '../../config/gacha';
import type { Character, Rarity } from '../../types';

/** R1–R5. Rank 0 is "owned, not yet ranked". */
export const MAX_RANK = 5;

/** How many of the five ranks reveal a lore entry; R4 and R5 unlock a border and artwork. */
const LORE_RANKS = 3;

/**
 * The single place rank is computed. Pure and I/O-free on purpose: rank is derived from
 * `owned_characters.copies` rather than stored, so there is no second source of truth to
 * drift, and every case is testable without the native SQLite module.
 */
export function rankFor(rarity: Rarity, copies: number): number {
  const thresholds = getRankThresholds()[rarity];
  let rank = 0;
  for (const threshold of thresholds) {
    if (copies < threshold) {
      break;
    }
    rank++;
  }
  return rank;
}

/** Copies still needed for the next rank, or null when there is nothing left to earn. */
export function copiesToNextRank(rarity: Rarity, copies: number): number | null {
  const rank = rankFor(rarity, copies);
  if (rank >= MAX_RANK) {
    return null;
  }
  return getRankThresholds()[rarity][rank] - copies;
}

/** The lore entries unlocked so far, in order. Empty at rank 0. */
export function unlockedLore(character: Character, copies: number): string[] {
  const revealed = Math.min(rankFor(character.rarity, copies), LORE_RANKS);
  return character.lore.slice(0, revealed);
}
```

- [ ] **Step 5: Verify**

Run: `npx jest src/services/collection/__tests__/rank.test.ts && npx tsc --noEmit && npx expo lint`
Expected: all PASS.

Then `npx prettier --write src/config/gacha.ts src/services/collection/rank.ts src/services/collection/__tests__/rank.test.ts`

- [ ] **Step 6: Stop and report — do NOT commit**

```
derive character rank from copies with per-rarity thresholds
```

---

## Task 3: The settings table and service

**Files:**

- Modify: `src/services/db/schema.ts` — append migration index 1
- Create: `src/services/settings/index.ts`
- Test: `src/services/settings/__tests__/settings.test.ts`

**Interfaces:**

- Consumes: `withWriteTransaction`, `getDatabase` from `src/services/db`.
- Produces, used by Task 6: `SHOW_RANK_BORDERS: 'show_rank_borders'`, `getSetting(key: string): Promise<string | null>`, `setSetting(key: string, value: string): Promise<void>`, `getShowRankBorders(): Promise<boolean>`, `setShowRankBorders(value: boolean): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `src/services/settings/__tests__/settings.test.ts`:

```ts
import { getShowRankBorders, getSetting, setSetting, setShowRankBorders } from '../index';

type Row = { key: string; value: string };

const rows: Row[] = [];

// The write queue and expo-sqlite are not available under jest, so the db module is
// faked at the seam the service actually uses. `withWriteTransaction` hands the callback
// a `txn` exactly as the real one does.
const txn = {
  runAsync: async (_sql: string, key: string, value: string) => {
    const existing = rows.find((row) => row.key === key);
    if (existing) {
      existing.value = value;
    } else {
      rows.push({ key, value });
    }
  },
};

jest.mock('../../db', () => ({
  getDatabase: () => ({
    getFirstAsync: async (_sql: string, key: string) => rows.find((row) => row.key === key) ?? null,
  }),
  withWriteTransaction: (task: (handle: typeof txn) => Promise<unknown>) => task(txn),
}));

beforeEach(() => {
  rows.length = 0;
});

describe('settings', () => {
  it('returns null for a key that was never written', async () => {
    await expect(getSetting('nothing_here')).resolves.toBeNull();
  });

  it('reads back what it wrote', async () => {
    await setSetting('colour', 'blue');
    await expect(getSetting('colour')).resolves.toBe('blue');
  });

  it('overwrites rather than duplicating a key', async () => {
    await setSetting('colour', 'blue');
    await setSetting('colour', 'green');

    await expect(getSetting('colour')).resolves.toBe('green');
    expect(rows).toHaveLength(1);
  });
});

describe('the rank border flag', () => {
  // Default-on matters: an existing player upgrading into this feature has no row, and
  // hiding a reward they just earned would read as a bug.
  it('defaults to on when no row exists', async () => {
    await expect(getShowRankBorders()).resolves.toBe(true);
  });

  it('round-trips off and back on', async () => {
    await setShowRankBorders(false);
    await expect(getShowRankBorders()).resolves.toBe(false);

    await setShowRankBorders(true);
    await expect(getShowRankBorders()).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/services/settings`
Expected: FAIL — `Cannot find module '../index'`.

- [ ] **Step 3: Append the migration**

In `src/services/db/schema.ts`, add a **second** string to the `MIGRATIONS` array, after the existing one. Do not edit the existing entry — the array index is the schema version and the file says append-only.

```ts
  `
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
```

A generic key/value table rather than a column on `player_state`, because streaks and ad consent will both want somewhere to live and neither should cost its own migration.

- [ ] **Step 4: Write the service**

Create `src/services/settings/index.ts`:

```ts
import { getDatabase, withWriteTransaction } from '../db';

/** Whether R4 rank borders are drawn. Global, not per character. */
export const SHOW_RANK_BORDERS = 'show_rank_borders';

export async function getSetting(key: string): Promise<string | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await withWriteTransaction(async (txn) => {
    await txn.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  });
}

/**
 * Defaults to true when the row is absent: a player upgrading into this feature has no
 * row, and hiding a border they just earned would read as a bug rather than a default.
 */
export async function getShowRankBorders(): Promise<boolean> {
  return (await getSetting(SHOW_RANK_BORDERS)) !== 'false';
}

export async function setShowRankBorders(value: boolean): Promise<void> {
  await setSetting(SHOW_RANK_BORDERS, value ? 'true' : 'false');
}
```

- [ ] **Step 5: Verify**

Run: `npx jest src/services/settings && npx jest && npx tsc --noEmit && npx expo lint`

Run the full `npx jest`, not just the settings tests. No current test asserts on the length of `MIGRATIONS` (verified 2026-09-16), so nothing should need updating — but a migration is the one change in this plan that can break app startup, and the db suite is what would catch it.

Then `npx prettier --write src/services/db/schema.ts src/services/settings/index.ts src/services/settings/__tests__/settings.test.ts`

- [ ] **Step 6: Stop and report — do NOT commit**

```
add a settings table and a global rank border preference
```

---

## Task 4: The character detail screen

**Files:**

- Create: `src/screens/CharacterDetailScreen.tsx`
- Test: `src/screens/__tests__/CharacterDetailScreen.test.tsx`

**Interfaces:**

- Consumes: `rankFor`, `copiesToNextRank`, `unlockedLore`, `MAX_RANK` (Task 2); `getCollection` from `src/services/collection`; `CHARACTERS`, `RARITY_COLOURS` from `src/data/characters`.
- Produces: `CharacterDetailScreen`, and the prop shape `{ route: { params: { characterId: string } } }`, consumed by Task 5's navigator.

The screen takes a **minimal structural prop**, not `NativeStackScreenProps`. It is assignable from what the navigator passes, keeps navigation types out of the screen, and lets a test pass a plain object.

- [ ] **Step 1: Write the failing test**

Create `src/screens/__tests__/CharacterDetailScreen.test.tsx`:

```tsx
import { CharacterDetailScreen } from '../CharacterDetailScreen';
import { CHARACTERS } from '../../data/characters';
import { RANK_THRESHOLDS } from '../../config/gacha';
import { MAX_RANK } from '../../services/collection/rank';
import { renderAndSettle, textContent } from '../../test-utils/render';
import type { OwnedCharacter } from '../../types';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]),
}));

const store = { rows: [] as OwnedCharacter[] };

jest.mock('../../services/collection', () => ({
  getCollection: async () => store.rows,
}));

const character = CHARACTERS[0];
const thresholds = RANK_THRESHOLDS[character.rarity];

function own(copies: number): OwnedCharacter {
  return { characterId: character.id, copies, firstObtainedAt: '2026-09-16T10:00:00.000Z' };
}

function renderAt(copies: number) {
  store.rows = [own(copies)];
  return renderAndSettle(
    <CharacterDetailScreen route={{ params: { characterId: character.id } }} />,
  );
}

beforeEach(() => {
  store.rows = [];
});

describe('character detail', () => {
  it('shows the name and copy count', async () => {
    const text = textContent(await renderAt(3));

    expect(text).toContain(character.name);
    expect(text).toContain('3 copies');
  });

  it('says how many more copies the next rank needs', async () => {
    const text = textContent(await renderAt(1));

    expect(text).toContain(`${thresholds[0] - 1} more`);
  });

  // Locked entries are shown as locked rather than hidden: seeing there is something
  // left to earn is the whole motivational point of the ladder.
  it('shows locked lore as locked rather than hiding it', async () => {
    const text = textContent(await renderAt(1));

    expect(text).not.toContain(character.lore[0]);
    expect(text.split('Locked').length - 1).toBe(3);
  });

  it('reveals one lore entry per rank', async () => {
    const text = textContent(await renderAt(thresholds[1]));

    expect(text).toContain(character.lore[0]);
    expect(text).toContain(character.lore[1]);
    expect(text).not.toContain(character.lore[2]);
  });

  it('says there is nothing left to earn at max rank', async () => {
    const text = textContent(await renderAt(thresholds[MAX_RANK - 1]));

    expect(text).toContain('Fully ranked');
    expect(text).not.toContain('more to Rank');
  });
});

describe('the alternate artwork', () => {
  it('shows the base sprite below max rank', async () => {
    const renderer = await renderAt(thresholds[MAX_RANK - 2]);
    const art = renderer.root.findByProps({ testID: 'detail-art' });

    expect(art.props.source).toBe(character.sprite);
  });

  it('swaps to the alternate sprite at max rank', async () => {
    const renderer = await renderAt(thresholds[MAX_RANK - 1]);
    const art = renderer.root.findByProps({ testID: 'detail-art' });

    expect(art.props.source).toBe(character.altSprite);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/screens/__tests__/CharacterDetailScreen.test.tsx`
Expected: FAIL — `Cannot find module '../CharacterDetailScreen'`.

- [ ] **Step 3: Write the screen**

Create `src/screens/CharacterDetailScreen.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CHARACTERS, RARITY_COLOURS } from '../data/characters';
import { getCollection } from '../services/collection';
import { copiesToNextRank, MAX_RANK, rankFor, unlockedLore } from '../services/collection/rank';

// A minimal structural prop rather than NativeStackScreenProps: it is assignable from
// what the navigator passes, keeps navigation types out of the screen, and lets a test
// render it with a plain object.
type CharacterDetailProps = {
  route: { params: { characterId: string } };
};

export function CharacterDetailScreen({ route }: CharacterDetailProps) {
  const { characterId } = route.params;
  const character = CHARACTERS.find((entry) => entry.id === characterId);
  const [copies, setCopies] = useState<number | null>(null);

  // useFocusEffect, not useEffect: a pull on the Summon tab can raise the rank while
  // this screen is mounted underneath, and switching back must not show a stale rank.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      getCollection()
        .then((rows) => {
          if (!active) {
            return;
          }
          setCopies(rows.find((row) => row.characterId === characterId)?.copies ?? 0);
        })
        .catch((error) => {
          console.error('Loading the collection failed', error);
          if (active) {
            // Not 0: a failed read is not an empty shelf. Rank renders from 0 copies
            // anyway, and the banner below says the number is missing.
            setCopies(-1);
          }
        });

      return () => {
        active = false;
      };
    }, [characterId]),
  );

  if (!character) {
    return (
      <View style={styles.centred}>
        <Text style={styles.error}>That character is not in the roster.</Text>
      </View>
    );
  }

  if (copies === null) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const failed = copies < 0;
  const held = failed ? 0 : copies;
  const rank = rankFor(character.rarity, held);
  const toNext = copiesToNextRank(character.rarity, held);
  const lore = unlockedLore(character, held);
  const colour = RARITY_COLOURS[character.rarity];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {failed ? <Text style={styles.error}>Could not read your copies — showing none.</Text> : null}

      <Image
        testID="detail-art"
        source={rank >= MAX_RANK ? character.altSprite : character.sprite}
        style={styles.art}
        resizeMode="contain"
      />

      <Text style={[styles.name, { color: colour }]}>{character.name}</Text>
      <Text style={[styles.rarity, { color: colour }]}>{'★'.repeat(character.rarity)}</Text>

      <View style={styles.pips}>
        {Array.from({ length: MAX_RANK }, (_, index) => (
          <View
            key={index}
            style={[styles.pip, index < rank ? { backgroundColor: colour } : styles.pipEmpty]}
          />
        ))}
      </View>

      <Text style={styles.progress}>
        Rank {rank} · {held} {held === 1 ? 'copy' : 'copies'}
      </Text>
      <Text style={styles.progress}>
        {toNext === null ? 'Fully ranked' : `${toNext} more to Rank ${rank + 1}`}
      </Text>

      {character.lore.map((entry, index) => (
        <View key={index} style={styles.loreRow}>
          <Text style={styles.loreRank}>R{index + 1}</Text>
          <Text style={index < lore.length ? styles.lore : styles.loreLocked}>
            {index < lore.length ? entry : 'Locked'}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 24, paddingBottom: 48, alignItems: 'center' },
  error: { color: '#c92a2a', marginBottom: 12, textAlign: 'center' },
  art: { width: 200, height: 200, marginBottom: 12 },
  name: { fontSize: 26, fontWeight: '700' },
  rarity: { fontSize: 18, marginTop: 2 },
  pips: { flexDirection: 'row', marginTop: 12 },
  pip: { width: 14, height: 14, borderRadius: 7, marginHorizontal: 3 },
  pipEmpty: { backgroundColor: '#dee2e6' },
  progress: { marginTop: 8, color: '#495057', fontWeight: '600' },
  loreRow: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 16 },
  loreRank: { width: 32, fontWeight: '700', color: '#adb5bd' },
  lore: { flex: 1, fontSize: 15, lineHeight: 22, color: '#343a40' },
  loreLocked: { flex: 1, fontSize: 15, lineHeight: 22, color: '#ced4da', fontStyle: 'italic' },
});
```

- [ ] **Step 4: Verify**

Run: `npx jest src/screens/__tests__/CharacterDetailScreen.test.tsx && npx tsc --noEmit && npx expo lint`
Expected: all PASS.

Then `npx prettier --write src/screens/CharacterDetailScreen.tsx src/screens/__tests__/CharacterDetailScreen.test.tsx`

- [ ] **Step 5: Stop and report — do NOT commit**

```
add a character detail screen showing rank, lore and alternate art
```

---

## Task 5: Collection stack navigation and grid rank pips

**Files:**

- Modify: `package.json` — add `@react-navigation/native-stack`
- Create: `src/navigation/CollectionStack.tsx`
- Modify: `src/navigation/index.tsx`
- Modify: `src/screens/CollectionScreen.tsx`
- Test: `src/screens/__tests__/CollectionScreen.test.tsx` (exists — add to it)

**Interfaces:**

- Consumes: `CharacterDetailScreen` (Task 4); `rankFor`, `MAX_RANK` (Task 2).
- Produces: `CollectionStack`, and the param list `CollectionStackParamList = { CollectionGrid: undefined; CharacterDetail: { characterId: string } }`.

`CollectionScreen` gains an **optional** `onOpen?: (characterId: string) => void` prop so its existing tests keep working unchanged and the new test can assert the callback directly, without mounting a navigator.

- [ ] **Step 1: Install the dependency**

Run: `npx expo install @react-navigation/native-stack`

`react-native-screens` and `react-native-safe-area-context` are already installed, so nothing else is needed.

- [ ] **Step 2: Write the failing test**

Append to `src/screens/__tests__/CollectionScreen.test.tsx`:

```tsx
describe('rank on the collection grid', () => {
  it('shows filled pips matching the character rank', async () => {
    const character = CHARACTERS[0];
    store.rows = [own(character.id, RANK_THRESHOLDS[character.rarity][1])];

    const renderer = await renderAndSettle(<CollectionScreen />);
    const pips = renderer.root.findAllByProps({ testID: `pips-${character.id}` });

    expect(pips[0].props.accessibilityLabel).toBe('Rank 2 of 5');
  });

  it('opens the character when an owned cell is pressed', async () => {
    const character = CHARACTERS[0];
    store.rows = [own(character.id)];
    const onOpen = jest.fn();

    const renderer = await renderAndSettle(<CollectionScreen onOpen={onOpen} />);
    await press(renderer, `Open ${character.name}`);

    expect(onOpen).toHaveBeenCalledWith(character.id);
  });

  it('does not offer to open a character that is not owned', async () => {
    const renderer = await renderAndSettle(<CollectionScreen onOpen={jest.fn()} />);

    expect(Object.keys(pressablesByLabel(renderer))).toHaveLength(0);
  });
});
```

Add `press` and `pressablesByLabel` to the existing `test-utils/render` import at the top of that file, and add `import { RANK_THRESHOLDS } from '../../config/gacha';` — this test file does not mock that module, so a plain import is correct here.

- [ ] **Step 3: Run it and watch it fail**

Run: `npx jest src/screens/__tests__/CollectionScreen.test.tsx`
Expected: FAIL — no node with testID `pips-aria_01`.

- [ ] **Step 4: Make the grid cells ranked and tappable**

In `src/screens/CollectionScreen.tsx`:

Add to the imports:

```tsx
import { Pressable } from 'react-native';
import { MAX_RANK, rankFor } from '../services/collection/rank';
```

Change the component signature to accept the optional callback:

Every prop is optional, so `<CollectionScreen />` still type-checks and the existing tests are untouched.

```tsx
type CollectionScreenProps = {
  /** Optional so the screen still renders standalone in tests and before the stack exists. */
  onOpen?: (characterId: string) => void;
};

export function CollectionScreen({ onOpen }: CollectionScreenProps) {
```

Replace the body of the `CHARACTERS.map` callback with:

```tsx
const copies = owned[character.id] ?? 0;
const isOwned = copies > 0;
const rank = rankFor(character.rarity, copies);

return (
  <Pressable
    key={character.id}
    style={styles.cell}
    // Locked cells are not pressable: there is nothing to show, and an
    // accessibility label on one would announce a character the player has
    // not met.
    disabled={!isOwned || !onOpen}
    accessibilityLabel={isOwned ? `Open ${character.name}` : undefined}
    onPress={isOwned && onOpen ? () => onOpen(character.id) : undefined}
  >
    {/* Unowned characters render as silhouettes rather than being hidden:
                  the visible gap is most of what drives a collection loop. */}
    <Image
      source={character.sprite}
      style={[styles.sprite, !isOwned && styles.spriteLocked]}
      resizeMode="contain"
    />
    <Text style={[styles.name, { color: isOwned ? RARITY_COLOURS[character.rarity] : '#ced4da' }]}>
      {isOwned ? character.name : '???'}
    </Text>
    {copies > 1 ? <Text style={styles.copies}>×{copies}</Text> : null}
    {isOwned ? (
      <View
        testID={`pips-${character.id}`}
        accessibilityLabel={`Rank ${rank} of ${MAX_RANK}`}
        style={styles.pips}
      >
        {Array.from({ length: MAX_RANK }, (_, index) => (
          <View
            key={index}
            style={[
              styles.pip,
              index < rank
                ? { backgroundColor: RARITY_COLOURS[character.rarity] }
                : styles.pipEmpty,
            ]}
          />
        ))}
      </View>
    ) : null}
  </Pressable>
);
```

Add to the `StyleSheet.create` block:

```tsx
  pips: { flexDirection: 'row', marginTop: 4 },
  pip: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 1.5 },
  pipEmpty: { backgroundColor: '#dee2e6' },
```

- [ ] **Step 5: Create the stack**

Create `src/navigation/CollectionStack.tsx`:

```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CharacterDetailScreen } from '../screens/CharacterDetailScreen';
import { CollectionScreen } from '../screens/CollectionScreen';

export type CollectionStackParamList = {
  CollectionGrid: undefined;
  CharacterDetail: { characterId: string };
};

const Stack = createNativeStackNavigator<CollectionStackParamList>();

export function CollectionStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="CollectionGrid" options={{ title: 'Collection' }}>
        {({ navigation }) => (
          <CollectionScreen
            onOpen={(characterId) => navigation.navigate('CharacterDetail', { characterId })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="CharacterDetail"
        component={CharacterDetailScreen}
        options={{ title: '' }}
      />
    </Stack.Navigator>
  );
}
```

- [ ] **Step 6: Point the tab at the stack**

In `src/navigation/index.tsx`, replace the `CollectionScreen` import with `import { CollectionStack } from './CollectionStack';` and change the Collection tab to:

```tsx
<Tab.Screen name="Collection" component={CollectionStack} options={{ headerShown: false }} />
```

`headerShown: false` on the tab prevents a doubled header, since the stack draws its own.

- [ ] **Step 7: Verify**

Run: `npx jest && npx tsc --noEmit && npx expo lint`
Expected: all PASS, including the pre-existing CollectionScreen tests, which must not need changing.

Then `npx prettier --write src/navigation src/screens/CollectionScreen.tsx src/screens/__tests__/CollectionScreen.test.tsx`

- [ ] **Step 8: Stop and report — do NOT commit**

Mention that `package.json` gained a dependency.

```
open a character detail screen from the collection grid
```

---

## Task 6: The rank border and its global toggle

**Files:**

- Create: `src/components/RankBorder.tsx`
- Modify: `src/screens/CharacterDetailScreen.tsx`
- Modify: `src/screens/HowItWorksScreen.tsx` — the toggle
- Test: `src/components/__tests__/RankBorder.test.tsx`
- Test: `src/screens/__tests__/CharacterDetailScreen.test.tsx` (add to it)

**Interfaces:**

- Consumes: `getShowRankBorders`, `setShowRankBorders` (Task 3); `rankFor`, `MAX_RANK` (Task 2).
- Produces: `RankBorder`, taking `{ colour: string; children: React.ReactNode }`.

**The border is drawn at R4 and above** — it does not disappear at R5 when the artwork changes.

- [ ] **Step 1: Write the failing tests**

Create `src/components/__tests__/RankBorder.test.tsx`:

```tsx
import { Text } from 'react-native';
import { RankBorder } from '../RankBorder';
import { render } from '../../test-utils/render';

describe('RankBorder', () => {
  it('renders its child inside a frame tinted by the given colour', () => {
    const renderer = render(
      <RankBorder colour="#f59f00">
        <Text>inside</Text>
      </RankBorder>,
    );

    const frame = renderer.root.findByProps({ testID: 'rank-border' });
    expect([frame.props.style].flat(Infinity)).toContainEqual({ borderColor: '#f59f00' });
    expect(renderer.root.findByType(Text).props.children).toBe('inside');
  });
});
```

Append to `src/screens/__tests__/CharacterDetailScreen.test.tsx`. Add this mock alongside the existing ones at the top of the file:

```tsx
const settings = { showBorders: true };

jest.mock('../../services/settings', () => ({
  getShowRankBorders: async () => settings.showBorders,
}));
```

and add `settings.showBorders = true;` to the existing `beforeEach`. Then:

```tsx
describe('the rank border', () => {
  const borderRank = RANK_THRESHOLDS[character.rarity][3]; // R4

  it('is absent below R4', async () => {
    const renderer = await renderAt(RANK_THRESHOLDS[character.rarity][2]);

    expect(renderer.root.findAllByProps({ testID: 'rank-border' })).toHaveLength(0);
  });

  it('appears at R4', async () => {
    const renderer = await renderAt(borderRank);

    expect(renderer.root.findAllByProps({ testID: 'rank-border' }).length).toBeGreaterThan(0);
  });

  it('is still drawn at max rank, alongside the alternate art', async () => {
    const renderer = await renderAt(RANK_THRESHOLDS[character.rarity][MAX_RANK - 1]);

    expect(renderer.root.findAllByProps({ testID: 'rank-border' }).length).toBeGreaterThan(0);
  });

  it('is hidden when the global setting is off', async () => {
    settings.showBorders = false;
    const renderer = await renderAt(borderRank);

    expect(renderer.root.findAllByProps({ testID: 'rank-border' })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/components/__tests__/RankBorder.test.tsx src/screens/__tests__/CharacterDetailScreen.test.tsx`
Expected: FAIL — `Cannot find module '../RankBorder'`, and no `rank-border` node.

- [ ] **Step 3: Write the border component**

Create `src/components/RankBorder.tsx`:

```tsx
import { StyleSheet, View } from 'react-native';

type RankBorderProps = {
  colour: string;
  children: React.ReactNode;
};

/**
 * The R4 unlock. Code-drawn rather than an asset, which is what keeps this feature's
 * whole art bill to one extra piece per character.
 */
export function RankBorder({ colour, children }: RankBorderProps) {
  return (
    <View testID="rank-border" style={[styles.frame, { borderColor: colour }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 3,
    borderRadius: 12,
    padding: 8,
  },
});
```

- [ ] **Step 4: Use it on the detail screen**

In `src/screens/CharacterDetailScreen.tsx`:

Add the imports:

```tsx
import { RankBorder } from '../components/RankBorder';
import { getShowRankBorders } from '../services/settings';
```

Add the state, next to `copies`:

```tsx
// Defaults to true so a border never flickers off while the preference loads.
const [showBorders, setShowBorders] = useState(true);
```

Inside the existing `useFocusEffect` callback, after the `getCollection()` chain, add:

```tsx
getShowRankBorders()
  .then((value) => {
    if (active) {
      setShowBorders(value);
    }
  })
  .catch((error) => {
    // A missing preference is not worth failing the screen over — the default
    // stands and the art still renders.
    console.error('Reading the rank border setting failed', error);
  });
```

Add `const BORDER_RANK = 4;` at module scope, below the imports — it never varies, so it does not belong inside the component. Then add this derived value below `const colour = ...`:

```tsx
const bordered = showBorders && rank >= BORDER_RANK;
```

Replace the `<Image testID="detail-art" ... />` element with:

```tsx
{
  bordered ? (
    <RankBorder colour={colour}>
      <Image
        testID="detail-art"
        source={rank >= MAX_RANK ? character.altSprite : character.sprite}
        style={styles.art}
        resizeMode="contain"
      />
    </RankBorder>
  ) : (
    <Image
      testID="detail-art"
      source={rank >= MAX_RANK ? character.altSprite : character.sprite}
      style={styles.art}
      resizeMode="contain"
    />
  );
}
```

- [ ] **Step 5: Add the toggle to the How it works screen**

`HowItWorksScreen` is currently stateless. It gains exactly one piece of state for the switch. In `src/screens/HowItWorksScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Switch } from 'react-native';
import { getShowRankBorders, setShowRankBorders } from '../services/settings';
```

Inside the component, above the `return`:

```tsx
const [showBorders, setShowBorders] = useState(true);

// A plain useEffect, not useFocusEffect: this setting is changed only here, so there
// is nothing to re-read on focus, and useFocusEffect would need the screen to be
// inside a navigator for its tests to run.
useEffect(() => {
  let active = true;
  getShowRankBorders()
    .then((value) => {
      if (active) {
        setShowBorders(value);
      }
    })
    .catch((error) => console.error('Reading the rank border setting failed', error));
  return () => {
    active = false;
  };
}, []);

const toggleBorders = (value: boolean) => {
  setShowBorders(value);
  setShowRankBorders(value).catch((error) => {
    console.error('Saving the rank border setting failed', error);
    // Put the switch back rather than leaving it lying about what was saved.
    setShowBorders(!value);
  });
};
```

And before the closing `</ScrollView>`:

```tsx
      <Text style={styles.heading}>Display</Text>
      <View style={styles.settingRow}>
        <Text style={styles.body}>Show rank borders</Text>
        <Switch
          value={showBorders}
          onValueChange={toggleBorders}
          accessibilityLabel="Show rank borders"
        />
      </View>
```

Add to that file's `StyleSheet.create`:

```tsx
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
```

The existing `HowItWorksScreen` tests do not mock `../services/settings`. Add this mock to the top of `src/screens/__tests__/HowItWorksScreen.test.tsx`:

```tsx
jest.mock('../../services/settings', () => ({
  getShowRankBorders: async () => true,
  setShowRankBorders: async () => undefined,
}));
```

and change every `render(<HowItWorksScreen />)` in that file to `await renderAndSettle(<HowItWorksScreen />)`, making each enclosing `it` callback `async`. The screen now loads a setting, so a synchronous render leaves a pending promise and React logs an act() warning.

- [ ] **Step 6: Verify**

Run: `npx jest && npx tsc --noEmit && npx expo lint`
Expected: all PASS.

Then `npx prettier --write src/components src/screens`

- [ ] **Step 7: Stop and report — do NOT commit**

```
draw a rank border at R4 with a global toggle on the rules screen
```

---

## Task 7: The ranks section on the How it works screen

**Files:**

- Modify: `src/screens/HowItWorksScreen.tsx`
- Test: `src/screens/__tests__/HowItWorksScreen.test.tsx`

**Interfaces:**

- Consumes: `getRankThresholds` (Task 2).
- Produces: nothing consumed elsewhere.

This screen's standing constraint applies: **no number may be retyped into the copy.** The test proves it by rendering against thresholds the app has never shipped.

- [ ] **Step 1: Write the failing test**

Append to `src/screens/__tests__/HowItWorksScreen.test.tsx`. The file already mocks `../../config/gacha` with a `mockActive` holder; extend that holder and the factory:

```tsx
// In the existing mock holder, alongside `config`:
//   thresholds: Record<Rarity, RankThresholds>
// and in the existing jest.mock factory, alongside getGachaConfig:
//   getRankThresholds: () => mockActive.thresholds,
```

Then the tests:

```tsx
describe('the ranks section', () => {
  it('explains what duplicates are for', async () => {
    const text = textContent(await renderAndSettle(<HowItWorksScreen />));

    expect(text).toContain('Duplicates');
    expect(text).toContain('Rank 5');
  });

  it('reads the thresholds from the config rather than hard-coding them', async () => {
    mockActive.thresholds = {
      3: [4, 9, 14, 19, 24],
      4: [3, 6, 9, 12, 15],
      5: [2, 5, 8, 11, 14],
    };

    const text = textContent(await renderAndSettle(<HowItWorksScreen />));

    // The invented 3★ ladder, and none of the real one.
    expect(text).toContain('24');
    expect(text).toContain('14');
    expect(text).not.toContain('40');
    expect(text).not.toContain('25');
  });
});
```

Add `thresholds: RANK_THRESHOLDS_REAL()` to the `mockActive` initialiser and reset it in the existing `beforeEach`, mirroring how `config` is handled, with:

```tsx
function RANK_THRESHOLDS_REAL() {
  return jest.requireActual<typeof import('../../config/gacha')>('../../config/gacha')
    .RANK_THRESHOLDS;
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/screens/__tests__/HowItWorksScreen.test.tsx`
Expected: FAIL — the text contains neither 'Duplicates' nor the invented thresholds.

- [ ] **Step 3: Add the section**

In `src/screens/HowItWorksScreen.tsx`, add `getRankThresholds` to the config import, and this above `const config = getGachaConfig();`:

```tsx
const thresholds = getRankThresholds();
const rankRarities: Rarity[] = [5, 4, 3];
```

Then, before the `Display` heading added in Task 6:

```tsx
      <Text style={styles.heading}>Duplicates and ranks</Text>
      <Text style={styles.body}>
        Pulling a character you already own is not wasted. Copies raise that
        character&apos;s rank, up to Rank 5.
      </Text>
      <Text style={styles.body}>
        Ranks 1 to 3 each reveal something about them. Rank 4 unlocks a border, and Rank 5
        unlocks alternate artwork.
      </Text>
      <Text style={styles.body}>
        Rarer characters need fewer copies, because they arrive far less often. Copies for
        each rank:
      </Text>
      {rankRarities.map((rarity) => (
        <View key={rarity} style={styles.rateRow}>
          <Text style={[styles.rateLabel, { color: RARITY_COLOURS[rarity] }]}>
            {'★'.repeat(rarity)}
          </Text>
          <Text style={styles.rateValue}>{thresholds[rarity].join(' · ')}</Text>
        </View>
      ))}
```

`Rarity` must be added to that file's existing `import type { Rarity } from '../types';`.

- [ ] **Step 4: Verify**

Run: `npx jest && npx tsc --noEmit && npx expo lint`
Expected: all PASS.

Then `npx prettier --write src/screens/HowItWorksScreen.tsx src/screens/__tests__/HowItWorksScreen.test.tsx`

- [ ] **Step 5: Update the docs**

- Add an entry to `docs/decisions.md` (newest at top) recording: rank derived from `copies` rather than stored; shards rejected; the global rather than per-character border toggle; the `settings` table added as migration 1; and the supply-sensitivity warning.
- In `docs/next-steps.md`, mark §2 done, pointing at the spec and this plan. Note that §3 (streaks) is now unblocked.
- In `docs/status/OPEN-ITEMS.md`, move "What duplicates are worth" and "What the collection is ultimately for" out of the open design questions into resolved, and record that **the ranks feature has never been run on a device**.

- [ ] **Step 6: Stop and report — do NOT commit**

```
explain duplicates and ranks on the rules screen
```

---

## After the plan

**The feature will not have run on a device.** `docs/status/DEVICE-RUN-CHECKLIST.md` is the ordered re-run script; it needs new steps for the detail screen, the pips, and the border toggle. A dev build cannot reach R4 or R5 on a 5★ in one sitting — the fastest route is lowering `RANK_THRESHOLDS` as a local uncommitted edit, exactly as the Global Constraints describe.

**Known gap, deliberate:** nothing tells a player a rank went up at the moment it happens. The rank-up is discoverable only by opening the detail screen. A NEW badge needs a "last seen rank" marker, which the spec defers along with the `character_progress` table it would have needed. Watch for it on the device run.
