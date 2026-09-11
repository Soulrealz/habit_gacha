# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared floor both feature verticals sit on — database, config, shared types, the ticket ledger seam, and a navigation shell — so that the habits and gacha verticals can then be developed in parallel without touching the same files.

**Architecture:** A thin `expo-sqlite` layer with `PRAGMA user_version` migrations, and a ticket ledger exposed as three functions (`awardTickets`, `spendTicket`, `getBalance`) that are the only cross-vertical dependency. Rules worth testing are extracted into pure functions; database wrappers stay thin and are verified on device.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, `expo-sqlite`, React Navigation (bottom tabs), Jest via `jest-expo`.

**Spec:** `docs/superpowers/specs/core-loop/September_2026/2026-09-12-core-loop-design.md`

## Global Constraints

- Branch for this plan: `feat/foundation`. Trunk is `master`, not `main`.
- Every tunable number lives in `src/config/gacha.ts`. No rate, threshold, or cap literal appears anywhere else in the codebase.
- `fiveStarRate: 0.005`, `fourStarRate: 0.15`, `pityThreshold: 60`, `dailyTicketCap: 5`.
- All dates stored in the database are **local** calendar dates in `YYYY-MM-DD` form, produced only by `src/lib/date.ts`. Never call `toISOString().slice(0, 10)` for a log date.
- `habit_logs.count` is an INTEGER. No fractional habit counts.
- Formatting is Prettier-owned. Run `npx prettier --write .` before committing; never hand-format.
- Named exports only, except framework-required entry points (`App.tsx`, `index.ts`).
- This plan must be merged to `master` before either vertical plan starts.

---

### Task 1: Dependencies and test infrastructure

**Files:**

- Modify: `package.json`
- Modify: `tsconfig.json`

**Interfaces:**

- Consumes: nothing.
- Produces: a working `npm test` command, plus `expo-sqlite` and React Navigation available to all later tasks.

- [ ] **Step 1: Install the runtime dependencies**

The `"--"` before `--dev` is required on Windows PowerShell; without it npm swallows the flag.

```bash
npx expo install expo-sqlite
npx expo install @react-navigation/native @react-navigation/bottom-tabs react-native-screens react-native-safe-area-context
```

- [ ] **Step 2: Install the test dependencies**

```bash
npx expo install jest-expo jest @types/jest "--" --dev
```

- [ ] **Step 3: Add the Jest preset and test scripts to package.json**

Add a top-level `"jest"` key and two scripts. `test` runs once (CI-friendly); `test:watch` is for development.

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watchAll"
  },
  "jest": {
    "preset": "jest-expo"
  }
}
```

- [ ] **Step 4: Tell TypeScript about Jest globals**

In `tsconfig.json`, add `"types": ["jest"]` inside `compilerOptions`. If `compilerOptions` does not exist yet, create it alongside the existing `extends` key.

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "types": ["jest"]
  }
}
```

- [ ] **Step 5: Verify the toolchain**

Run each and confirm all three pass:

```bash
npx tsc --noEmit
npx jest --passWithNoTests
npx expo export --platform android
```

Expected: typecheck silent, Jest exits 0 reporting no tests, export prints "Android Bundled". If the export fails, the dependency install is broken — fix before continuing.

- [ ] **Step 6: Commit**

```bash
npx prettier --write .
git add package.json package-lock.json tsconfig.json
git commit -m "chore: add sqlite, navigation, and jest test infrastructure"
```

---

### Task 2: Local date helper

**Files:**

- Create: `src/lib/date.ts`
- Test: `src/lib/__tests__/date.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `toLocalDateString(date: Date): string` and `today(): string`, both returning `YYYY-MM-DD`. Every task that writes a `log_date` uses `today()`.

- [ ] **Step 1: Write the failing tests**

The third test is the important one: it constructs a local time late on New Year's Eve. A naive UTC implementation rolls that into the next year in any timezone east of UTC, so this test is what actually pins the behaviour down. Because the `Date` is built from local components, the expectation holds in every timezone.

Create `src/lib/__tests__/date.test.ts`:

```ts
import { toLocalDateString, today } from '../date';

describe('toLocalDateString', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(toLocalDateString(new Date(2026, 8, 12))).toBe('2026-09-12');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('uses local calendar components, not UTC', () => {
    expect(toLocalDateString(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
  });
});

describe('today', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/lib/__tests__/date.test.ts
```

Expected: FAIL — "Cannot find module '../date'".

- [ ] **Step 3: Write the implementation**

Create `src/lib/date.ts`:

```ts
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function today(): string {
  return toLocalDateString(new Date());
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/lib/__tests__/date.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write .
git add src/lib
git commit -m "feat: add local date helper"
```

---

### Task 3: Shared types and gacha config

**Files:**

- Create: `src/types/index.ts`
- Create: `src/config/gacha.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: the `Habit`, `Character`, `HabitLog`, `OwnedCharacter`, `Rarity`, `GachaConfig` types, plus `GACHA_CONFIG`, `DEV_GACHA_CONFIG`, and `getGachaConfig()`. Both verticals import from these two files.

This task has no test cycle — it is pure declarations, and asserting that a constant equals itself has no value. Its gate is that the typecheck passes and the values match the spec exactly.

- [ ] **Step 1: Write the shared types**

Create `src/types/index.ts`:

```ts
import type { ImageSourcePropType } from 'react-native';

export type HabitCategory = 'gym';

export type Habit = {
  id: string;
  name: string;
  category: HabitCategory;
  target: number;
  unit: string;
  ticketReward: number;
  quickAdd: number[];
};

export type Rarity = 3 | 4 | 5;

export type Character = {
  id: string;
  name: string;
  rarity: Rarity;
  sprite: ImageSourcePropType;
};

export type HabitLog = {
  habitId: string;
  logDate: string;
  count: number;
  completedAt: string | null;
};

export type OwnedCharacter = {
  characterId: string;
  copies: number;
  firstObtainedAt: string;
};

export type GachaConfig = {
  fiveStarRate: number;
  fourStarRate: number;
  pityThreshold: number;
  dailyTicketCap: number;
};
```

- [ ] **Step 2: Write the config**

`DEV_GACHA_CONFIG` exists so both developers can actually see a 5★ during development instead of grinding ~52 pulls. `getGachaConfig()` must only be called at the app edge — pure functions receive a `GachaConfig` as an argument so their tests stay deterministic regardless of `__DEV__`.

Create `src/config/gacha.ts`:

```ts
import type { GachaConfig } from '../types';

export const GACHA_CONFIG: GachaConfig = {
  fiveStarRate: 0.005,
  fourStarRate: 0.15,
  pityThreshold: 60,
  dailyTicketCap: 5,
};

export const DEV_GACHA_CONFIG: GachaConfig = {
  fiveStarRate: 0.25,
  fourStarRate: 0.4,
  pityThreshold: 5,
  dailyTicketCap: 50,
};

export function getGachaConfig(): GachaConfig {
  return __DEV__ ? DEV_GACHA_CONFIG : GACHA_CONFIG;
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx expo lint
```

Expected: both silent. Then re-read `src/config/gacha.ts` against the Global Constraints above and confirm all four production values match exactly.

- [ ] **Step 4: Commit**

```bash
npx prettier --write .
git add src/types src/config
git commit -m "feat: add shared types and tunable gacha config"
```

---

### Task 4: Database layer with migrations

**Files:**

- Create: `src/services/db/schema.ts`
- Create: `src/services/db/index.ts`
- Modify: `App.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces: `initDatabase(): Promise<SQLiteDatabase>` and `getDatabase(): SQLiteDatabase`. Every service that touches persistence calls `getDatabase()`.

`expo-sqlite` is a native module, so this task cannot be unit tested — its gate is that the app boots on a device with the database initialised. Wiring initialisation into `App.tsx` here also delivers the spec's database-failure error screen (§9.2), so the two belong in the same task.

- [ ] **Step 1: Write the schema and migration list**

Migrations are an ordered array; the array index is the version. To add a migration later, append a string — never edit an existing one, because devices that already ran it will not run it again.

Create `src/services/db/schema.ts`:

```ts
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS habit_logs (
    habit_id     TEXT NOT NULL,
    log_date     TEXT NOT NULL,
    count        INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    PRIMARY KEY (habit_id, log_date)
  );

  CREATE TABLE IF NOT EXISTS ticket_ledger (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    delta      INTEGER NOT NULL,
    reason     TEXT NOT NULL,
    log_date   TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ticket_ledger_log_date
    ON ticket_ledger (log_date);

  CREATE TABLE IF NOT EXISTS player_state (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    pity_counter INTEGER NOT NULL DEFAULT 0
  );

  INSERT OR IGNORE INTO player_state (id, pity_counter) VALUES (1, 0);

  CREATE TABLE IF NOT EXISTS owned_characters (
    character_id      TEXT PRIMARY KEY,
    copies            INTEGER NOT NULL DEFAULT 1,
    first_obtained_at TEXT NOT NULL
  );
  `,
];
```

- [ ] **Step 2: Write the database module**

Create `src/services/db/index.ts`:

```ts
import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from './schema';

const DATABASE_NAME = 'daily_summoner.db';

let database: SQLite.SQLiteDatabase | null = null;

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  for (let index = version; index < MIGRATIONS.length; index++) {
    await db.execAsync(MIGRATIONS[index]);
    version = index + 1;
  }

  await db.execAsync(`PRAGMA user_version = ${version}`);
}

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) {
    return database;
  }

  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await runMigrations(db);
  database = db;
  return db;
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!database) {
    throw new Error('Database not initialised. Call initDatabase() first.');
  }
  return database;
}
```

- [ ] **Step 3: Wire initialisation into App.tsx with loading and error states**

Replace the entire contents of `App.tsx`:

```tsx
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { initDatabase } from './src/services/db';

type InitState = 'loading' | 'ready' | 'failed';

export default function App() {
  const [state, setState] = useState<InitState>('loading');

  useEffect(() => {
    initDatabase()
      .then(() => setState('ready'))
      .catch((error) => {
        console.error('Database initialisation failed', error);
        setState('failed');
      });
  }, []);

  if (state === 'loading') {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (state === 'failed') {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorTitle}>Could not load your data</Text>
        <Text style={styles.errorBody}>
          Daily Summoner could not open its local database. Restarting the app usually fixes this.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.centred}>
      <Text>Database ready</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorBody: {
    textAlign: 'center',
    color: '#555',
  },
});
```

- [ ] **Step 4: Verify on a device**

```bash
npx tsc --noEmit
npx expo start
```

Open the app on a phone or emulator. Expected: a brief spinner, then "Database ready". Then fully close and reopen the app — it must still show "Database ready", proving the migration is idempotent and `user_version` is being persisted.

- [ ] **Step 5: Commit**

```bash
npx prettier --write .
git add src/services/db App.tsx
git commit -m "feat: add sqlite schema, migration runner, and app init states"
```

---

### Task 5: Ticket ledger service

**Files:**

- Create: `src/services/tickets/cap.ts`
- Create: `src/services/tickets/index.ts`
- Test: `src/services/tickets/__tests__/cap.test.ts`

**Interfaces:**

- Consumes: `getDatabase()` from Task 4, `today()` from Task 2, `getGachaConfig()` from Task 3.
- Produces: `clampAward(requested, awardedToday, dailyCap): number`, `awardTickets(reason, amount): Promise<number>`, `spendTicket(): Promise<boolean>`, `getBalance(): Promise<number>`, `getAwardedToday(): Promise<number>`.

This is the only module both verticals import. The habits vertical calls `awardTickets` and never `spendTicket`; the gacha vertical calls `spendTicket` and never `awardTickets`. Both may read `getBalance`.

- [ ] **Step 1: Write the failing tests for the pure cap logic**

Create `src/services/tickets/__tests__/cap.test.ts`:

```ts
import { clampAward } from '../cap';

describe('clampAward', () => {
  it('grants the full amount when well under the cap', () => {
    expect(clampAward(1, 0, 5)).toBe(1);
  });

  it('grants the full amount when it exactly reaches the cap', () => {
    expect(clampAward(2, 3, 5)).toBe(2);
  });

  it('clips the amount when it would exceed the cap', () => {
    expect(clampAward(3, 4, 5)).toBe(1);
  });

  it('grants nothing when the cap is already reached', () => {
    expect(clampAward(1, 5, 5)).toBe(0);
  });

  it('grants nothing when already somehow over the cap', () => {
    expect(clampAward(1, 7, 5)).toBe(0);
  });

  it('grants nothing for a zero or negative request', () => {
    expect(clampAward(0, 0, 5)).toBe(0);
    expect(clampAward(-2, 0, 5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/services/tickets
```

Expected: FAIL — "Cannot find module '../cap'".

- [ ] **Step 3: Write the pure cap logic**

Create `src/services/tickets/cap.ts`:

```ts
export function clampAward(requested: number, awardedToday: number, dailyCap: number): number {
  if (requested <= 0) {
    return 0;
  }

  const remaining = dailyCap - awardedToday;
  if (remaining <= 0) {
    return 0;
  }

  return Math.min(requested, remaining);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/services/tickets
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Write the ledger service**

Both writes read-then-insert inside `withTransactionAsync`. That is what prevents the double-spend described in spec §9.1 — without the transaction, two rapid summon taps could each read a balance of 1 and both insert a spend.

Create `src/services/tickets/index.ts`:

```ts
import { getGachaConfig } from '../../config/gacha';
import { today } from '../../lib/date';
import { getDatabase } from '../db';
import { clampAward } from './cap';

export { clampAward };

export async function getBalance(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ balance: number | null }>(
    'SELECT SUM(delta) AS balance FROM ticket_ledger',
  );
  return row?.balance ?? 0;
}

export async function getAwardedToday(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ awarded: number | null }>(
    'SELECT SUM(delta) AS awarded FROM ticket_ledger WHERE delta > 0 AND log_date = ?',
    today(),
  );
  return row?.awarded ?? 0;
}

export async function awardTickets(reason: string, amount: number): Promise<number> {
  const db = getDatabase();
  const dailyCap = getGachaConfig().dailyTicketCap;
  const logDate = today();
  let granted = 0;

  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ awarded: number | null }>(
      'SELECT SUM(delta) AS awarded FROM ticket_ledger WHERE delta > 0 AND log_date = ?',
      logDate,
    );

    granted = clampAward(amount, row?.awarded ?? 0, dailyCap);

    if (granted > 0) {
      await db.runAsync(
        'INSERT INTO ticket_ledger (delta, reason, log_date, created_at) VALUES (?, ?, ?, ?)',
        granted,
        reason,
        logDate,
        new Date().toISOString(),
      );
    }
  });

  return granted;
}

export async function spendTicket(): Promise<boolean> {
  const db = getDatabase();
  let spent = false;

  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ balance: number | null }>(
      'SELECT SUM(delta) AS balance FROM ticket_ledger',
    );

    if ((row?.balance ?? 0) > 0) {
      await db.runAsync(
        'INSERT INTO ticket_ledger (delta, reason, log_date, created_at) VALUES (?, ?, ?, ?)',
        -1,
        'summon',
        today(),
        new Date().toISOString(),
      );
      spent = true;
    }
  });

  return spent;
}
```

- [ ] **Step 6: Verify**

```bash
npx jest
npx tsc --noEmit
npx expo lint
```

Expected: all tests pass, typecheck silent, lint silent.

- [ ] **Step 7: Commit**

```bash
npx prettier --write .
git add src/services/tickets
git commit -m "feat: add ticket ledger with daily cap clipping"
```

---

### Task 6: Navigation shell

**Files:**

- Create: `src/screens/TodayScreen.tsx`
- Create: `src/screens/SummonScreen.tsx`
- Create: `src/screens/CollectionScreen.tsx`
- Create: `src/navigation/index.tsx`
- Modify: `App.tsx`

**Interfaces:**

- Consumes: `initDatabase()` from Task 4.
- Produces: `RootNavigator` as a named export, and three placeholder screens each exported as `TodayScreen`, `SummonScreen`, `CollectionScreen`.

The three screen files are deliberately created as placeholders here so the navigator compiles. In the vertical plans, Dev 1 replaces the body of `TodayScreen` and Dev 2 replaces `SummonScreen` and `CollectionScreen`. Nobody edits a screen they do not own.

- [ ] **Step 1: Create the three placeholder screens**

Create `src/screens/TodayScreen.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';

export function TodayScreen() {
  return (
    <View style={styles.container}>
      <Text>Today</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
```

Create `src/screens/SummonScreen.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';

export function SummonScreen() {
  return (
    <View style={styles.container}>
      <Text>Summon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
```

Create `src/screens/CollectionScreen.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';

export function CollectionScreen() {
  return (
    <View style={styles.container}>
      <Text>Collection</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 2: Create the navigator**

Create `src/navigation/index.tsx`:

```tsx
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CollectionScreen } from '../screens/CollectionScreen';
import { SummonScreen } from '../screens/SummonScreen';
import { TodayScreen } from '../screens/TodayScreen';

const Tab = createBottomTabNavigator();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="Today" component={TodayScreen} />
        <Tab.Screen name="Summon" component={SummonScreen} />
        <Tab.Screen name="Collection" component={CollectionScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
```

- [ ] **Step 3: Render the navigator from App.tsx**

In `App.tsx`, keep the `loading` and `failed` branches exactly as they are. Replace only the final `return` block (the one rendering "Database ready") with the navigator, and add the import.

```tsx
import { RootNavigator } from './src/navigation';
```

```tsx
return <RootNavigator />;
```

The now-unused `StatusBar` import must be removed, or lint will fail.

- [ ] **Step 4: Verify on a device**

```bash
npx tsc --noEmit
npx expo lint
npx expo start
```

Open on a device. Expected: three working bottom tabs labelled Today, Summon, and Collection, each showing its placeholder text, with the spinner appearing briefly on launch.

- [ ] **Step 5: Commit**

```bash
npx prettier --write .
git add src/screens src/navigation App.tsx
git commit -m "feat: add bottom tab navigation shell"
```

---

### Task 7: Correct the trunk branch name in CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

**Interfaces:**

- Consumes: nothing.
- Produces: nothing consumed by code.

`CLAUDE.md` currently claims the trunk is `main`, but the repository's trunk is `master`. Correcting the document is less disruptive than renaming a shared branch.

- [ ] **Step 1: Fix the branch name**

In the `## Git workflow` section of `CLAUDE.md`, change:

```
- `main` is the trunk. Never commit directly to it — branch, then PR/merge back.
```

to:

```
- `master` is the trunk. Never commit directly to it — branch, then PR/merge back.
```

- [ ] **Step 2: Verify**

Confirm no other occurrence of "main" as a branch name remains:

```bash
grep -n "main" CLAUDE.md
```

Expected: no line describing `main` as the trunk branch.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: correct trunk branch name to master"
```

---

## Done when

- `npm test` passes with the date and cap suites green.
- `npx tsc --noEmit` and `npx expo lint` are both silent.
- The app launches on a physical device, shows three tabs, and survives a full close-and-reopen.
- `feat/foundation` is merged to `master`. **Both vertical plans are blocked until this merge lands.**
