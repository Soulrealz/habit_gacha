# Gacha Vertical Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the summoning half of the app — the character roster, a pure probabilistic roll engine with pity, and the Summon and Collection screens — so a user can spend earned tickets on pulls and watch a collection accumulate.

**Architecture:** The rarity decision and character selection are pure functions with an injected RNG, making the most rules-dense part of the app deterministically testable. A thin persistence layer above them spends a ticket, advances the pity counter, and upserts the collection. This vertical never reads or writes the habits vertical's tables.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, `expo-sqlite`, Jest via `jest-expo`.

**Spec:** `docs/superpowers/specs/core-loop/September_2026/2026-09-12-core-loop-design.md`

## Global Constraints

- **Prerequisite:** `feat/foundation` must be merged to `master` before starting. This plan consumes `getDatabase()`, `today()`, `spendTicket()`, `getBalance()`, `getGachaConfig()`, and the `Character`/`Rarity`/`OwnedCharacter`/`GachaConfig` types from it.
- Branch for this plan: `feat/gacha-summon`. Trunk is `master`, not `main`.
- This vertical owns exactly these paths: `src/data/characters.ts`, `src/services/gacha/`, `src/services/collection/`, `src/screens/SummonScreen.tsx`, `src/screens/CollectionScreen.tsx`, and `assets/characters/`. Do not edit `src/services/habits/`, `src/data/habits.ts`, `src/screens/TodayScreen.tsx`, or `src/components/HabitRow.tsx` — the other developer owns those and edits will collide.
- **No rate, threshold, or cap literal may appear in this vertical.** Every probability comes from a `GachaConfig` passed in as an argument. Pure functions receive the config as a parameter; only the service layer calls `getGachaConfig()`.
- Pure functions must never call `Math.random()` directly — the RNG is always injected, or their tests cannot be deterministic.
- Formatting is Prettier-owned. Run `npx prettier --write .` before committing.
- Named exports only.

---

### Task 1: Character roster and placeholder sprites

**Files:**

- Create: `assets/characters/` (placeholder PNGs)
- Create: `src/data/characters.ts`
- Test: `src/data/__tests__/characters.test.ts`

**Interfaces:**

- Consumes: the `Character` and `Rarity` types from `src/types`.
- Produces: `CHARACTERS: Character[]`, `charactersByRarity(rarity: Rarity): Character[]`, and `RARITY_COLOURS: Record<Rarity, string>`.

`RARITY_COLOURS` lives here rather than in either screen because both the Summon and Collection screens need it and the two must never drift apart — a 5★ that is gold on one screen and something else on the other is a bug users would notice immediately.

Real AI-generated sprites are a separate workstream. This task ships placeholder art at the final paths so the vertical is fully runnable now; dropping real PNGs over them later requires no code change.

The roster is deliberately small but must contain at least one character of every rarity, or a roll can return a rarity with an empty pool and crash.

- [ ] **Step 1: Create the sprite directory with placeholders**

Copy the existing splash icon once per character id. Replace these with real art later at exactly these paths.

```bash
mkdir -p assets/characters
for id in aria_01 brin_01 caul_01 dax_01 echo_01 fen_01 gale_01 hex_01 iris_01; do
  cp assets/splash-icon.png "assets/characters/$id.png"
done
ls assets/characters
```

Expected: nine PNG files.

- [ ] **Step 2: Write the failing tests**

The last two tests are the important ones — an empty rarity pool is a crash waiting to happen, and a rarity outside 3–5 would silently never be rolled.

Create `src/data/__tests__/characters.test.ts`:

```ts
import { CHARACTERS, charactersByRarity } from '../characters';
import type { Rarity } from '../../types';

describe('CHARACTERS', () => {
  it('has unique ids', () => {
    const ids = CHARACTERS.map((character) => character.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only uses rarities 3, 4, and 5', () => {
    for (const character of CHARACTERS) {
      expect([3, 4, 5]).toContain(character.rarity);
    }
  });

  it('gives every character a sprite', () => {
    for (const character of CHARACTERS) {
      expect(character.sprite).toBeDefined();
    }
  });
});

describe('charactersByRarity', () => {
  it('returns a non-empty pool for every rarity', () => {
    const rarities: Rarity[] = [3, 4, 5];
    for (const rarity of rarities) {
      expect(charactersByRarity(rarity).length).toBeGreaterThan(0);
    }
  });

  it('returns only characters of the requested rarity', () => {
    for (const character of charactersByRarity(5)) {
      expect(character.rarity).toBe(5);
    }
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx jest src/data/__tests__/characters.test.ts
```

Expected: FAIL — "Cannot find module '../characters'".

- [ ] **Step 4: Write the roster**

Create `src/data/characters.ts`:

```ts
import type { Character, Rarity } from '../types';

export const CHARACTERS: Character[] = [
  {
    id: 'aria_01',
    name: 'Aria',
    rarity: 5,
    sprite: require('../../assets/characters/aria_01.png'),
  },
  {
    id: 'brin_01',
    name: 'Brin',
    rarity: 5,
    sprite: require('../../assets/characters/brin_01.png'),
  },
  {
    id: 'caul_01',
    name: 'Caul',
    rarity: 4,
    sprite: require('../../assets/characters/caul_01.png'),
  },
  { id: 'dax_01', name: 'Dax', rarity: 4, sprite: require('../../assets/characters/dax_01.png') },
  {
    id: 'echo_01',
    name: 'Echo',
    rarity: 4,
    sprite: require('../../assets/characters/echo_01.png'),
  },
  { id: 'fen_01', name: 'Fen', rarity: 3, sprite: require('../../assets/characters/fen_01.png') },
  {
    id: 'gale_01',
    name: 'Gale',
    rarity: 3,
    sprite: require('../../assets/characters/gale_01.png'),
  },
  { id: 'hex_01', name: 'Hex', rarity: 3, sprite: require('../../assets/characters/hex_01.png') },
  {
    id: 'iris_01',
    name: 'Iris',
    rarity: 3,
    sprite: require('../../assets/characters/iris_01.png'),
  },
];

export function charactersByRarity(rarity: Rarity): Character[] {
  return CHARACTERS.filter((character) => character.rarity === rarity);
}

export const RARITY_COLOURS: Record<Rarity, string> = {
  3: '#adb5bd',
  4: '#9775fa',
  5: '#f59f00',
};
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx jest src/data/__tests__/characters.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
npx prettier --write .
git add assets/characters src/data/characters.ts src/data/__tests__/characters.test.ts
git commit -m "feat: add character roster with placeholder sprites"
```

---

### Task 2: Pure roll engine

**Files:**

- Create: `src/services/gacha/engine.ts`
- Test: `src/services/gacha/__tests__/engine.test.ts`

**Interfaces:**

- Consumes: the `GachaConfig`, `Rarity`, and `Character` types from `src/types`.
- Produces: `rollOne(rng, pity, config): RollResult` where `RollResult` is `{ rarity: Rarity; newPity: number; pityTriggered: boolean }`, and `pickCharacter(rng, pool): Character`.

This is the heart of the app and the only place the pity rules live. Both functions are pure and take an injected RNG, so every test below is fully deterministic.

The pity contract from the spec: the counter increments on every pull, resets to 0 on **any** 5★ whether natural or granted, and the 60th consecutive pull without a 5★ is guaranteed. That means the guarantee fires when the incoming `pity` is 59 — the pull being rolled is then the 60th.

- [ ] **Step 1: Write the failing tests**

`createSeededRng` is a mulberry32 generator defined in the test file because only these tests need it. The distribution test is the one that would catch a genuinely broken pity implementation: with a 0.5% rate and a 60-pull guarantee, the average pulls per 5★ is ~52.

Create `src/services/gacha/__tests__/engine.test.ts`:

```ts
import { pickCharacter, rollOne } from '../engine';
import type { Character, GachaConfig } from '../../../types';

const CONFIG: GachaConfig = {
  fiveStarRate: 0.005,
  fourStarRate: 0.15,
  pityThreshold: 60,
  dailyTicketCap: 5,
};

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const always = (value: number) => () => value;

describe('rollOne rarity bands', () => {
  it('returns a 5★ when the roll falls under the five-star rate', () => {
    const result = rollOne(always(0.001), 0, CONFIG);
    expect(result.rarity).toBe(5);
    expect(result.pityTriggered).toBe(false);
  });

  it('returns a 4★ when the roll falls in the four-star band', () => {
    expect(rollOne(always(0.1), 0, CONFIG).rarity).toBe(4);
  });

  it('returns a 3★ when the roll falls above both bands', () => {
    expect(rollOne(always(0.9), 0, CONFIG).rarity).toBe(3);
  });
});

describe('rollOne pity', () => {
  it('increments pity on a non-five-star pull', () => {
    expect(rollOne(always(0.9), 12, CONFIG).newPity).toBe(13);
  });

  it('resets pity to zero on a natural five-star', () => {
    const result = rollOne(always(0.001), 30, CONFIG);
    expect(result.newPity).toBe(0);
    expect(result.pityTriggered).toBe(false);
  });

  it('does not trigger the guarantee on the 59th consecutive pull', () => {
    const result = rollOne(always(0.9), 58, CONFIG);
    expect(result.rarity).toBe(3);
    expect(result.newPity).toBe(59);
  });

  it('triggers the guarantee on the 60th consecutive pull', () => {
    const result = rollOne(always(0.9), 59, CONFIG);
    expect(result.rarity).toBe(5);
    expect(result.pityTriggered).toBe(true);
    expect(result.newPity).toBe(0);
  });
});

describe('rollOne distribution', () => {
  it('averages roughly 52 pulls per five-star and never exceeds the guarantee', () => {
    const rng = createSeededRng(20260912);
    const pullsPerFiveStar: number[] = [];
    let pity = 0;
    let sinceLast = 0;

    for (let i = 0; i < 200000; i++) {
      const result = rollOne(rng, pity, CONFIG);
      pity = result.newPity;
      sinceLast++;

      if (result.rarity === 5) {
        pullsPerFiveStar.push(sinceLast);
        sinceLast = 0;
      }
    }

    const average =
      pullsPerFiveStar.reduce((sum, value) => sum + value, 0) / pullsPerFiveStar.length;

    expect(pullsPerFiveStar.length).toBeGreaterThan(3000);
    expect(average).toBeGreaterThan(48);
    expect(average).toBeLessThan(56);
    expect(Math.max(...pullsPerFiveStar)).toBeLessThanOrEqual(CONFIG.pityThreshold);
  });
});

describe('pickCharacter', () => {
  const pool: Character[] = [
    { id: 'a', name: 'A', rarity: 3, sprite: 1 },
    { id: 'b', name: 'B', rarity: 3, sprite: 2 },
    { id: 'c', name: 'C', rarity: 3, sprite: 3 },
  ];

  it('picks the first character when the roll is at the bottom', () => {
    expect(pickCharacter(always(0), pool).id).toBe('a');
  });

  it('picks the last character when the roll is near the top', () => {
    expect(pickCharacter(always(0.999), pool).id).toBe('c');
  });

  it('throws on an empty pool rather than returning undefined', () => {
    expect(() => pickCharacter(always(0), [])).toThrow('empty pool');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/services/gacha
```

Expected: FAIL — "Cannot find module '../engine'".

- [ ] **Step 3: Write the engine**

Create `src/services/gacha/engine.ts`:

```ts
import type { Character, GachaConfig, Rarity } from '../../types';

export type RollResult = {
  rarity: Rarity;
  newPity: number;
  pityTriggered: boolean;
};

export function rollOne(rng: () => number, pity: number, config: GachaConfig): RollResult {
  const nextPity = pity + 1;

  if (nextPity >= config.pityThreshold) {
    return { rarity: 5, newPity: 0, pityTriggered: true };
  }

  const roll = rng();

  if (roll < config.fiveStarRate) {
    return { rarity: 5, newPity: 0, pityTriggered: false };
  }

  if (roll < config.fiveStarRate + config.fourStarRate) {
    return { rarity: 4, newPity: nextPity, pityTriggered: false };
  }

  return { rarity: 3, newPity: nextPity, pityTriggered: false };
}

export function pickCharacter(rng: () => number, pool: Character[]): Character {
  if (pool.length === 0) {
    throw new Error('Cannot pick a character from an empty pool');
  }

  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[index];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/services/gacha
```

Expected: PASS, 11 tests. The distribution test runs 200,000 iterations and may take a second or two.

- [ ] **Step 5: Commit**

```bash
npx prettier --write .
git add src/services/gacha
git commit -m "feat: add pure gacha roll engine with pity"
```

---

### Task 3: Collection service

**Files:**

- Create: `src/services/collection/index.ts`

**Interfaces:**

- Consumes: `getDatabase()` from `src/services/db`, the `OwnedCharacter` type from `src/types`.
- Produces: `getCollection(): Promise<OwnedCharacter[]>` and `recordCharacter(characterId: string): Promise<boolean>`, where the boolean is `true` when the character was newly obtained rather than a duplicate.

Native module, so no unit tests — the device walkthrough in Task 5 is the gate.

- [ ] **Step 1: Write the service**

The upsert increments `copies` for a duplicate and leaves `first_obtained_at` untouched, which is what makes the deferred duplicate economy possible later without a migration.

Use `withExclusiveTransactionAsync`, never `withTransactionAsync` — the latter is a plain
`BEGIN`/`COMMIT` on the shared connection that its own docs describe as "not exclusive and can be
interrupted by other async queries", so overlapping calls corrupt each other's transactions. Every
query inside the callback must run on `txn`, not `db` — `txn` is a separate connection holding the
write lock, so a stray `db` call inside the callback deadlocks.

Create `src/services/collection/index.ts`:

```ts
import type { OwnedCharacter } from '../../types';
import { getDatabase } from '../db';

type OwnedCharacterRow = {
  character_id: string;
  copies: number;
  first_obtained_at: string;
};

function toOwnedCharacter(row: OwnedCharacterRow): OwnedCharacter {
  return {
    characterId: row.character_id,
    copies: row.copies,
    firstObtainedAt: row.first_obtained_at,
  };
}

export async function getCollection(): Promise<OwnedCharacter[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<OwnedCharacterRow>(
    'SELECT character_id, copies, first_obtained_at FROM owned_characters ORDER BY first_obtained_at DESC',
  );
  return rows.map(toOwnedCharacter);
}

export async function recordCharacter(characterId: string): Promise<boolean> {
  const db = getDatabase();
  let isNew = false;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<{ copies: number }>(
      'SELECT copies FROM owned_characters WHERE character_id = ?',
      characterId,
    );

    if (existing) {
      await txn.runAsync(
        'UPDATE owned_characters SET copies = copies + 1 WHERE character_id = ?',
        characterId,
      );
    } else {
      await txn.runAsync(
        'INSERT INTO owned_characters (character_id, copies, first_obtained_at) VALUES (?, 1, ?)',
        characterId,
        new Date().toISOString(),
      );
      isNew = true;
    }
  });

  return isNew;
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx expo lint
npx jest
```

Expected: all clean.

- [ ] **Step 3: Commit**

```bash
npx prettier --write .
git add src/services/collection
git commit -m "feat: add collection service with duplicate tracking"
```

---

### Task 4: Summon service

**Files:**

- Create: `src/services/gacha/index.ts`

**Interfaces:**

- Consumes: `rollOne`/`pickCharacter` from Task 2, `charactersByRarity` from Task 1, `recordCharacter` from Task 3, `spendTicket` from `src/services/tickets`, `getDatabase()` from `src/services/db`, `getGachaConfig()` from `src/config/gacha`.
- Produces: `performSummon(): Promise<SummonOutcome>` where `SummonOutcome` is `{ status: 'no_tickets' } | { status: 'busy' } | { status: 'success'; character: Character; rarity: Rarity; isNew: boolean; pityTriggered: boolean }`. `SummonScreen` in Task 5 consumes it.

This is the only place in the vertical that calls `getGachaConfig()` and `Math.random`.

- [ ] **Step 1: Write the service**

Three notes on the ordering, all of which come from spec §9.1:

The `inFlight` module guard rejects a second concurrent call outright. `spendTicket` is what actually prevents a double spend — it reads the balance and inserts its debit inside one **exclusive** transaction, so two concurrent calls against a balance of 1 cannot both succeed. That guarantee depends on it using `withExclusiveTransactionAsync`; plain `withTransactionAsync` would not provide it.

Spend, roll, and persist deliberately do not share a single transaction, because `spendTicket` owns its own and SQLite cannot nest them. The residual risk is a crash between spending and persisting, which can lose a ticket but can never duplicate a character or grant one for free.

The pity counter is read and written around the roll, so a crash mid-summon leaves pity unchanged rather than corrupted.

Create `src/services/gacha/index.ts`:

```ts
import { getGachaConfig } from '../../config/gacha';
import { charactersByRarity } from '../../data/characters';
import type { Character, Rarity } from '../../types';
import { recordCharacter } from '../collection';
import { getDatabase } from '../db';
import { spendTicket } from '../tickets';
import { pickCharacter, rollOne } from './engine';

export type SummonOutcome =
  | { status: 'no_tickets' }
  | { status: 'busy' }
  | {
      status: 'success';
      character: Character;
      rarity: Rarity;
      isNew: boolean;
      pityTriggered: boolean;
    };

let inFlight = false;

async function readPity(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ pity_counter: number }>(
    'SELECT pity_counter FROM player_state WHERE id = 1',
  );
  return row?.pity_counter ?? 0;
}

async function writePity(value: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('UPDATE player_state SET pity_counter = ? WHERE id = 1', value);
}

export async function performSummon(): Promise<SummonOutcome> {
  if (inFlight) {
    return { status: 'busy' };
  }

  inFlight = true;

  try {
    const spent = await spendTicket();
    if (!spent) {
      return { status: 'no_tickets' };
    }

    const config = getGachaConfig();
    const pity = await readPity();
    const result = rollOne(Math.random, pity, config);
    const character = pickCharacter(Math.random, charactersByRarity(result.rarity));

    await writePity(result.newPity);
    const isNew = await recordCharacter(character.id);

    return {
      status: 'success',
      character,
      rarity: result.rarity,
      isNew,
      pityTriggered: result.pityTriggered,
    };
  } finally {
    inFlight = false;
  }
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx expo lint
npx jest
```

Expected: all clean.

- [ ] **Step 3: Commit**

```bash
npx prettier --write .
git add src/services/gacha/index.ts
git commit -m "feat: add summon service wiring spend, roll, and collection"
```

---

### Task 5: Summon screen

**Files:**

- Modify: `src/screens/SummonScreen.tsx` (replace the placeholder body created in the foundation plan)

**Interfaces:**

- Consumes: `performSummon`/`SummonOutcome` from Task 4, `getBalance` from `src/services/tickets`.
- Produces: the `SummonScreen` named export, unchanged in name so `src/navigation/index.tsx` keeps working without edits.

- [ ] **Step 1: Write the screen**

The button is disabled both while a pull is in flight and when the balance is zero. The rarity colour gives the 5★ its own visual weight — this is the payoff moment the whole app exists to deliver, and it is worth revisiting in Phase 2 with real animation.

The balance is read with `useFocusEffect`, not `useEffect`. Tickets are earned on the Today tab, and switching tabs does not remount a screen — with `useEffect` the balance would still read 0 after earning one, and the Summon button would stay disabled. That is exactly step 2 of the walkthrough below.

Replace the entire contents of `src/screens/SummonScreen.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { RARITY_COLOURS } from '../data/characters';
import { performSummon } from '../services/gacha';
import { getBalance } from '../services/tickets';
import type { Character, Rarity } from '../types';

type LastPull = {
  character: Character;
  rarity: Rarity;
  isNew: boolean;
  pityTriggered: boolean;
};

export function SummonScreen() {
  const [balance, setBalance] = useState<number | null>(null);
  const [pulling, setPulling] = useState(false);
  const [lastPull, setLastPull] = useState<LastPull | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refreshBalance = useCallback(async () => {
    setBalance(await getBalance());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshBalance();
    }, [refreshBalance]),
  );

  const handleSummon = useCallback(async () => {
    setPulling(true);
    setMessage(null);

    try {
      const outcome = await performSummon();

      if (outcome.status === 'no_tickets') {
        setMessage('No tickets yet — go complete a habit.');
      } else if (outcome.status === 'busy') {
        setMessage('Already summoning.');
      } else {
        setLastPull({
          character: outcome.character,
          rarity: outcome.rarity,
          isNew: outcome.isNew,
          pityTriggered: outcome.pityTriggered,
        });
      }
    } finally {
      setPulling(false);
      await refreshBalance();
    }
  }, [refreshBalance]);

  if (balance === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const disabled = pulling || balance <= 0;

  return (
    <View style={styles.container}>
      <Text style={styles.balance}>🎟 {balance}</Text>

      {lastPull ? (
        <View style={styles.result}>
          <Image source={lastPull.character.sprite} style={styles.sprite} resizeMode="contain" />
          <Text style={[styles.name, { color: RARITY_COLOURS[lastPull.rarity] }]}>
            {lastPull.character.name}
          </Text>
          <Text style={[styles.rarity, { color: RARITY_COLOURS[lastPull.rarity] }]}>
            {'★'.repeat(lastPull.rarity)}
          </Text>
          {lastPull.isNew ? <Text style={styles.badge}>NEW</Text> : null}
          {lastPull.pityTriggered ? <Text style={styles.badge}>GUARANTEED</Text> : null}
        </View>
      ) : (
        <Text style={styles.placeholder}>Spend a ticket to summon.</Text>
      )}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Pressable
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={handleSummon}
        disabled={disabled}
        accessibilityLabel="Summon one character"
      >
        <Text style={styles.buttonText}>{pulling ? 'Summoning…' : 'Summon (1 🎟)'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  balance: { fontSize: 20, fontWeight: '600', marginBottom: 24 },
  result: { alignItems: 'center', marginBottom: 24 },
  sprite: { width: 160, height: 160, marginBottom: 12 },
  name: { fontSize: 24, fontWeight: '700' },
  rarity: { fontSize: 20, marginTop: 4 },
  badge: { marginTop: 8, fontWeight: '700', color: '#2b8a3e' },
  placeholder: { color: '#868e96', marginBottom: 24 },
  message: { color: '#c92a2a', marginBottom: 16 },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    backgroundColor: '#4c6ef5',
  },
  buttonDisabled: { backgroundColor: '#ced4da' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 2: Verify**

```bash
npx jest
npx tsc --noEmit
npx expo lint
```

Expected: all clean.

- [ ] **Step 3: Commit**

```bash
npx prettier --write .
git add src/screens/SummonScreen.tsx
git commit -m "feat: add summon screen with pull result display"
```

---

### Task 6: Collection screen

**Files:**

- Modify: `src/screens/CollectionScreen.tsx` (replace the placeholder body created in the foundation plan)

**Interfaces:**

- Consumes: `getCollection` from Task 3, `CHARACTERS` from Task 1.
- Produces: the `CollectionScreen` named export, unchanged in name so `src/navigation/index.tsx` keeps working without edits.

- [ ] **Step 1: Write the screen**

Unowned characters render as silhouettes rather than being hidden, so the user can see what they are chasing — that visible gap is most of what drives a collection loop.

`useFocusEffect` is used instead of `useEffect` because the collection changes on the Summon tab; without it, pulling a character and switching tabs would show a stale grid.

Replace the entire contents of `src/screens/CollectionScreen.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CHARACTERS, RARITY_COLOURS } from '../data/characters';
import { getCollection } from '../services/collection';

export function CollectionScreen() {
  const [owned, setOwned] = useState<Record<string, number> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      getCollection().then((rows) => {
        if (!active) {
          return;
        }
        const next: Record<string, number> = {};
        for (const row of rows) {
          next[row.characterId] = row.copies;
        }
        setOwned(next);
      });

      return () => {
        active = false;
      };
    }, []),
  );

  if (!owned) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const ownedCount = Object.keys(owned).length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Collection {ownedCount} / {CHARACTERS.length}
      </Text>

      <ScrollView contentContainerStyle={styles.grid}>
        {CHARACTERS.map((character) => {
          const copies = owned[character.id] ?? 0;
          const isOwned = copies > 0;

          return (
            <View key={character.id} style={styles.cell}>
              <Image
                source={character.sprite}
                style={[styles.sprite, !isOwned && styles.spriteLocked]}
                resizeMode="contain"
              />
              <Text
                style={[
                  styles.name,
                  { color: isOwned ? RARITY_COLOURS[character.rarity] : '#ced4da' },
                ]}
              >
                {isOwned ? character.name : '???'}
              </Text>
              {copies > 1 ? <Text style={styles.copies}>×{copies}</Text> : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', padding: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  cell: { width: '33.33%', alignItems: 'center', paddingVertical: 12 },
  sprite: { width: 80, height: 80 },
  spriteLocked: { opacity: 0.15 },
  name: { marginTop: 6, fontWeight: '600' },
  copies: { color: '#868e96', fontSize: 12 },
});
```

- [ ] **Step 2: Verify**

```bash
npx jest
npx tsc --noEmit
npx expo lint
```

Expected: all clean.

- [ ] **Step 3: Verify the whole vertical on a device**

```bash
npx expo start
```

Note that `__DEV__` is true here, so `DEV_GACHA_CONFIG` applies: a 25% 5★ rate and pity at 5. That is deliberate — it makes this walkthrough take a minute instead of an hour.

The dev override deliberately does **not** raise `dailyTicketCap`, because the habits vertical's own walkthrough needs the 5/day cap to actually bind in a dev build. If you need more than five pulls in one sitting to reach step 5, temporarily raise `dailyTicketCap` in `src/config/gacha.ts` as a local, uncommitted edit and revert it before opening your PR. With the dev pity threshold of 5, step 6's GUARANTEED badge is reachable inside a single day's five tickets.

Walk this exact sequence on a phone or emulator:

1. Open the Summon tab with a balance of 0. The button is greyed out and disabled.
2. Go to the Today tab and complete a habit to earn a ticket. Return to Summon — the balance reads `🎟 1`.
3. Tap Summon. A character appears with its name, star rating, and a NEW badge. The balance drops to `🎟 0` and the button disables again.
4. Open the Collection tab. The pulled character is visible in colour; every other character is a faded silhouette labelled `???`. The header count reads `1 / 9`.
5. Earn several more tickets and pull until you obtain a duplicate. The Collection cell for that character shows `×2`.
6. Pull until a GUARANTEED badge appears — with the dev pity threshold of 5, this happens within a handful of pulls if you do not hit a natural 5★ first.
7. Fully close and reopen the app, then open Collection. Every owned character and duplicate count is still there.
8. Tap Summon rapidly several times with exactly one ticket. Exactly one pull resolves and the balance never goes negative.

If any step fails, fix it before committing.

- [ ] **Step 4: Commit**

```bash
npx prettier --write .
git add src/screens/CollectionScreen.tsx
git commit -m "feat: add collection screen with locked silhouettes"
```

---

## Done when

- `npm test` passes, including the 11 engine tests and the distribution check.
- `npx tsc --noEmit` and `npx expo lint` are both silent.
- The eight-step device walkthrough in Task 6 passes end to end.
- No rate, threshold, or cap literal exists anywhere in `src/services/gacha/` or `src/data/characters.ts` outside of test fixtures.
- No file outside this vertical's owned paths has been modified.
- `feat/gacha-summon` is open as a PR against `master`.
