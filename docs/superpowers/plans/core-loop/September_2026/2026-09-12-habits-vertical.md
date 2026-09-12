# Habits Vertical Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete habit-tracking half of the app — the gym habit catalog, counter-based logging with quick-add buttons, and ticket awards on completion — so a user can log gym work and watch their summoning tickets accumulate.

**Architecture:** A static habit catalog in TypeScript, a thin persistence service over `habit_logs`, and the award decision extracted into a pure `shouldAward` function. Tickets are earned only through `awardTickets` from the foundation's ledger; this vertical never reads or writes the gacha vertical's tables.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, `expo-sqlite`, Jest via `jest-expo`.

**Spec:** `docs/superpowers/specs/core-loop/September_2026/2026-09-12-core-loop-design.md`

## Global Constraints

- **Prerequisite:** `feat/foundation` must be merged to `master` before starting. This plan consumes `getDatabase()`, `today()`, `awardTickets()`, `getBalance()`, and the `Habit`/`HabitLog` types from it.
- Branch for this plan: `feat/habit-tracking`. Trunk is `master`, not `main`.
- This vertical owns exactly these paths: `src/data/habits.ts`, `src/services/habits/`, `src/screens/TodayScreen.tsx`, and `src/components/`. Do not edit `src/services/gacha/`, `src/services/collection/`, `src/data/characters.ts`, `src/screens/SummonScreen.tsx`, or `src/screens/CollectionScreen.tsx` — the other developer owns those and edits will collide.
- Never call `awardTickets` with a hard-coded amount. Always pass `habit.ticketReward`.
- All dates come from `today()` in `src/lib/date.ts`. Never call `toISOString().slice(0, 10)`.
- `habit_logs.count` is an INTEGER. No fractional counts — this is why `run` is measured in metres.
- Formatting is Prettier-owned. Run `npx prettier --write .` before committing.
- Named exports only.

---

### Task 1: Gym habit catalog

**Files:**

- Create: `src/data/habits.ts`
- Test: `src/data/__tests__/habits.test.ts`

**Interfaces:**

- Consumes: the `Habit` type from `src/types`.
- Produces: `GYM_HABITS: Habit[]`.

The catalog's total potential (7 tickets) deliberately exceeds the 5/day cap, so the cap is live behaviour rather than dead code and users must choose what to prioritise. The test pins that relationship down so a future edit cannot silently kill the cap.

- [ ] **Step 1: Write the failing tests**

Create `src/data/__tests__/habits.test.ts`:

```ts
import { GACHA_CONFIG } from '../../config/gacha';
import { GYM_HABITS } from '../habits';

describe('GYM_HABITS', () => {
  it('has unique ids', () => {
    const ids = GYM_HABITS.map((habit) => habit.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every habit a positive target and reward', () => {
    for (const habit of GYM_HABITS) {
      expect(habit.target).toBeGreaterThan(0);
      expect(habit.ticketReward).toBeGreaterThan(0);
    }
  });

  it('offers at least one quick-add amount per habit', () => {
    for (const habit of GYM_HABITS) {
      expect(habit.quickAdd.length).toBeGreaterThan(0);
      expect(habit.quickAdd.every((amount) => amount > 0)).toBe(true);
    }
  });

  it('offers more total tickets than the daily cap, so the cap stays meaningful', () => {
    const total = GYM_HABITS.reduce((sum, habit) => sum + habit.ticketReward, 0);
    expect(total).toBeGreaterThan(GACHA_CONFIG.dailyTicketCap);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/data
```

Expected: FAIL — "Cannot find module '../habits'".

- [ ] **Step 3: Write the catalog**

Create `src/data/habits.ts`:

```ts
import type { Habit } from '../types';

export const GYM_HABITS: Habit[] = [
  {
    id: 'pullups',
    name: 'Pull-ups',
    category: 'gym',
    target: 10,
    unit: 'reps',
    ticketReward: 1,
    quickAdd: [1, 5, 10],
  },
  {
    id: 'pushups',
    name: 'Push-ups',
    category: 'gym',
    target: 30,
    unit: 'reps',
    ticketReward: 1,
    quickAdd: [5, 10, 20],
  },
  {
    id: 'squats',
    name: 'Squats',
    category: 'gym',
    target: 30,
    unit: 'reps',
    ticketReward: 1,
    quickAdd: [5, 10, 20],
  },
  {
    id: 'plank',
    name: 'Plank',
    category: 'gym',
    target: 60,
    unit: 'seconds',
    ticketReward: 1,
    quickAdd: [15, 30, 60],
  },
  {
    id: 'run',
    name: 'Run',
    category: 'gym',
    target: 2000,
    unit: 'm',
    ticketReward: 1,
    quickAdd: [250, 500, 1000],
  },
  {
    id: 'gym_session',
    name: 'Gym session',
    category: 'gym',
    target: 1,
    unit: 'session',
    ticketReward: 1,
    quickAdd: [1],
  },
  {
    id: 'protein',
    name: 'Protein goal',
    category: 'gym',
    target: 1,
    unit: 'day',
    ticketReward: 1,
    quickAdd: [1],
  },
];
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/data
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write .
git add src/data
git commit -m "feat: add gym habit catalog"
```

---

### Task 2: Completion logic

**Files:**

- Create: `src/services/habits/completion.ts`
- Test: `src/services/habits/__tests__/completion.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `shouldAward(previousCount, newCount, target, alreadyCompleted): boolean` and `clampCount(value: number): number`.

This is the spec's award-once rule (§4, Award semantics) as a pure function. Extracting it is what makes the rule testable at all, since the service around it touches a native module.

- [ ] **Step 1: Write the failing tests**

The "already completed" case is the one that matters most — without it a user could pass the target, drop back below, pass it again, and farm tickets.

Create `src/services/habits/__tests__/completion.test.ts`:

```ts
import { clampCount, shouldAward } from '../completion';

describe('shouldAward', () => {
  it('awards when the count first reaches the target', () => {
    expect(shouldAward(9, 10, 10, false)).toBe(true);
  });

  it('awards when the count jumps past the target', () => {
    expect(shouldAward(5, 30, 10, false)).toBe(true);
  });

  it('does not award while still below the target', () => {
    expect(shouldAward(5, 9, 10, false)).toBe(false);
  });

  it('does not award twice once already completed', () => {
    expect(shouldAward(9, 10, 10, true)).toBe(false);
  });

  it('does not award when incrementing above an already-passed target', () => {
    expect(shouldAward(12, 15, 10, false)).toBe(false);
  });

  it('awards for a single-step target', () => {
    expect(shouldAward(0, 1, 1, false)).toBe(true);
  });
});

describe('clampCount', () => {
  it('leaves non-negative values alone', () => {
    expect(clampCount(7)).toBe(7);
    expect(clampCount(0)).toBe(0);
  });

  it('floors negative values at zero', () => {
    expect(clampCount(-3)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/services/habits
```

Expected: FAIL — "Cannot find module '../completion'".

- [ ] **Step 3: Write the implementation**

Create `src/services/habits/completion.ts`:

```ts
export function shouldAward(
  previousCount: number,
  newCount: number,
  target: number,
  alreadyCompleted: boolean,
): boolean {
  if (alreadyCompleted) {
    return false;
  }
  return previousCount < target && newCount >= target;
}

export function clampCount(value: number): number {
  return Math.max(0, value);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/services/habits
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write .
git add src/services/habits
git commit -m "feat: add pure habit completion logic"
```

---

### Task 3: Habit logging service

**Files:**

- Create: `src/services/habits/index.ts`

**Interfaces:**

- Consumes: `getDatabase()` from `src/services/db`, `today()` from `src/lib/date`, `awardTickets()` from `src/services/tickets`, `shouldAward`/`clampCount` from Task 2, `GYM_HABITS` from Task 1.
- Produces: `getTodayLogs(): Promise<Record<string, HabitLog>>` and `adjustHabitCount(habit: Habit, delta: number): Promise<AdjustResult>`, where `AdjustResult` is `{ count: number; completed: boolean; ticketsAwarded: number; capReached: boolean }`. `TodayScreen` in Task 4 consumes both.

Native module, so no unit tests here — the rules it depends on are already tested in Task 2. Its gate is the device check in Task 5.

- [ ] **Step 1: Write the service**

Note the ordering: the row is written and `completed_at` is set inside the transaction, then `awardTickets` is called after it commits. `awardTickets` opens its own transaction, and nesting transactions in SQLite would fail.

Use `withExclusiveTransactionAsync`, never `withTransactionAsync` — the latter is a plain
`BEGIN`/`COMMIT` on the shared connection that its own docs describe as "not exclusive and can be
interrupted by other async queries", so overlapping calls corrupt each other's transactions.
`TodayScreen`'s quick-add buttons make overlapping calls easy: two fast `+5` taps are exactly the
race. Every query inside the callback must run on `txn`, not `db` — `txn` is a separate connection
holding the write lock, so a stray `db` call inside the callback deadlocks.

`capReached` is derived from `shouldAward(...) === true` but `ticketsAwarded === 0` — that combination means the habit genuinely completed but the daily cap clipped the award to nothing, which is exactly what the UI needs to explain to the user.

Create `src/services/habits/index.ts`:

```ts
import { today } from '../../lib/date';
import type { Habit, HabitLog } from '../../types';
import { getDatabase } from '../db';
import { awardTickets } from '../tickets';
import { clampCount, shouldAward } from './completion';

export { clampCount, shouldAward };

export type AdjustResult = {
  count: number;
  completed: boolean;
  ticketsAwarded: number;
  capReached: boolean;
};

type HabitLogRow = {
  habit_id: string;
  log_date: string;
  count: number;
  completed_at: string | null;
};

function toHabitLog(row: HabitLogRow): HabitLog {
  return {
    habitId: row.habit_id,
    logDate: row.log_date,
    count: row.count,
    completedAt: row.completed_at,
  };
}

export async function getTodayLogs(): Promise<Record<string, HabitLog>> {
  const db = getDatabase();
  const rows = await db.getAllAsync<HabitLogRow>(
    'SELECT habit_id, log_date, count, completed_at FROM habit_logs WHERE log_date = ?',
    today(),
  );

  const logs: Record<string, HabitLog> = {};
  for (const row of rows) {
    logs[row.habit_id] = toHabitLog(row);
  }
  return logs;
}

export async function adjustHabitCount(habit: Habit, delta: number): Promise<AdjustResult> {
  const db = getDatabase();
  const logDate = today();

  let previousCount = 0;
  let alreadyCompleted = false;
  let newCount = 0;
  let justCompleted = false;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync<HabitLogRow>(
      'SELECT habit_id, log_date, count, completed_at FROM habit_logs WHERE habit_id = ? AND log_date = ?',
      habit.id,
      logDate,
    );

    previousCount = row?.count ?? 0;
    alreadyCompleted = row?.completed_at !== null && row?.completed_at !== undefined;
    newCount = clampCount(previousCount + delta);
    justCompleted = shouldAward(previousCount, newCount, habit.target, alreadyCompleted);

    const completedAt = alreadyCompleted
      ? (row?.completed_at ?? null)
      : justCompleted
        ? new Date().toISOString()
        : null;

    await txn.runAsync(
      `INSERT INTO habit_logs (habit_id, log_date, count, completed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (habit_id, log_date)
       DO UPDATE SET count = excluded.count, completed_at = excluded.completed_at`,
      habit.id,
      logDate,
      newCount,
      completedAt,
    );
  });

  const ticketsAwarded = justCompleted
    ? await awardTickets(`habit:${habit.id}`, habit.ticketReward)
    : 0;

  return {
    count: newCount,
    completed: alreadyCompleted || justCompleted,
    ticketsAwarded,
    capReached: justCompleted && ticketsAwarded === 0,
  };
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx expo lint
npx jest
```

Expected: all three clean. The existing tests must still pass.

- [ ] **Step 3: Commit**

```bash
npx prettier --write .
git add src/services/habits
git commit -m "feat: add habit logging service with award on completion"
```

---

### Task 4: Habit row component

**Files:**

- Create: `src/components/HabitRow.tsx`

**Interfaces:**

- Consumes: the `Habit` type from `src/types`.
- Produces: `HabitRow` accepting props `{ habit: Habit; count: number; completed: boolean; onAdd: (amount: number) => void }`.

A presentational component with no data access, so it can be built and reviewed before the screen wiring exists.

- [ ] **Step 1: Write the component**

Create `src/components/HabitRow.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Habit } from '../types';

type HabitRowProps = {
  habit: Habit;
  count: number;
  completed: boolean;
  onAdd: (amount: number) => void;
};

export function HabitRow({ habit, count, completed, onAdd }: HabitRowProps) {
  const progress = Math.min(1, habit.target === 0 ? 0 : count / habit.target);

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.name}>
          {habit.name}
          {completed ? ' ✓' : ''}
        </Text>
        <Text style={styles.progressText}>
          {count} / {habit.target} {habit.unit}
        </Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.buttons}>
        {habit.quickAdd.map((amount) => (
          <Pressable
            key={amount}
            style={styles.button}
            onPress={() => onAdd(amount)}
            accessibilityLabel={`Add ${amount} ${habit.unit} to ${habit.name}`}
          >
            <Text style={styles.buttonText}>+{amount}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.button, styles.undoButton]}
          onPress={() => onAdd(-habit.quickAdd[0])}
          accessibilityLabel={`Remove ${habit.quickAdd[0]} ${habit.unit} from ${habit.name}`}
        >
          <Text style={styles.buttonText}>−{habit.quickAdd[0]}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  name: { fontSize: 16, fontWeight: '600' },
  progressText: { fontSize: 14, color: '#666' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#eee', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#4c6ef5' },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 10 },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#4c6ef5',
  },
  undoButton: { backgroundColor: '#adb5bd', marginLeft: 'auto' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx expo lint
```

Expected: both silent.

- [ ] **Step 3: Commit**

```bash
npx prettier --write .
git add src/components
git commit -m "feat: add habit row component with quick-add buttons"
```

---

### Task 5: Today screen

**Files:**

- Modify: `src/screens/TodayScreen.tsx` (replace the placeholder body created in the foundation plan)

**Interfaces:**

- Consumes: `GYM_HABITS` from Task 1, `getTodayLogs`/`adjustHabitCount`/`AdjustResult` from Task 3, `HabitRow` from Task 4, `getBalance` from `src/services/tickets`.
- Produces: the `TodayScreen` named export, unchanged in name so `src/navigation/index.tsx` keeps working without edits.

- [ ] **Step 1: Write the screen**

The ticket balance is re-read after every adjustment rather than tracked locally, so it cannot drift from the ledger. `capReached` drives the banner that tells the user why a completed habit paid nothing.

It refreshes with `useFocusEffect`, not `useEffect`. Tickets are spent on the Summon tab, and switching tabs does not remount a screen — with `useEffect` the balance shown here would stay stale after a pull.

Replace the entire contents of `src/screens/TodayScreen.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HabitRow } from '../components/HabitRow';
import { GYM_HABITS } from '../data/habits';
import { adjustHabitCount, getTodayLogs } from '../services/habits';
import { getBalance } from '../services/tickets';
import type { Habit, HabitLog } from '../types';

export function TodayScreen() {
  const [logs, setLogs] = useState<Record<string, HabitLog> | null>(null);
  const [balance, setBalance] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextLogs, nextBalance] = await Promise.all([getTodayLogs(), getBalance()]);
    setLogs(nextLogs);
    setBalance(nextBalance);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleAdd = useCallback(
    async (habit: Habit, amount: number) => {
      const result = await adjustHabitCount(habit, amount);

      if (result.capReached) {
        setNotice(`${habit.name} complete — but you have hit today's ticket cap.`);
      } else if (result.ticketsAwarded > 0) {
        setNotice(
          `${habit.name} complete! +${result.ticketsAwarded} ticket${
            result.ticketsAwarded === 1 ? '' : 's'
          }`,
        );
      }

      await refresh();
    },
    [refresh],
  );

  if (!logs) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Today</Text>
        <Text style={styles.balance}>🎟 {balance}</Text>
      </View>

      {notice ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <ScrollView>
        {GYM_HABITS.map((habit) => {
          const log = logs[habit.id];
          return (
            <HabitRow
              key={habit.id}
              habit={habit}
              count={log?.count ?? 0}
              completed={Boolean(log?.completedAt)}
              onAdd={(amount) => handleAdd(habit, amount)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '700' },
  balance: { fontSize: 18, fontWeight: '600' },
  notice: { backgroundColor: '#e7f5ff', paddingVertical: 10, paddingHorizontal: 16 },
  noticeText: { color: '#1864ab' },
});
```

- [ ] **Step 2: Verify the full suite still passes**

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

Walk this exact sequence on a phone or emulator:

1. Open the Today tab. Every habit shows `0 / target` with an empty progress bar and a ticket balance of `🎟 0`.
2. Tap `+5` on Pull-ups twice. The row reads `10 / 10 reps`, shows a ✓, the bar is full, and a notice reads "Pull-ups complete! +1 ticket". Balance becomes `🎟 1`.
3. Tap `+1` on Pull-ups again. The count rises to 11 but the balance stays at 1 — this proves the award-once rule.
4. Tap `−1` on Pull-ups until the count drops below 10. The ✓ stays and the balance stays at 1 — this proves awards are not clawed back.
5. Complete four more habits. The balance reaches `🎟 5`.
6. Complete a sixth habit. It shows as complete, but the notice reads "hit today's ticket cap" and the balance stays at 5 — this proves cap clipping.
7. Fully close and reopen the app. All counts, ✓ marks, and the balance of 5 are still there.

If any step fails, fix it before committing.

- [ ] **Step 4: Commit**

```bash
npx prettier --write .
git add src/screens/TodayScreen.tsx
git commit -m "feat: add today screen with habit counters and ticket balance"
```

---

## Done when

- `npm test` passes, including the catalog and completion suites.
- `npx tsc --noEmit` and `npx expo lint` are both silent.
- The seven-step device walkthrough in Task 5 passes end to end.
- No file outside this vertical's owned paths has been modified.
- `feat/habit-tracking` is open as a PR against `master`.
