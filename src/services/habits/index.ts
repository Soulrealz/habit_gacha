import { today } from '../../lib/date';
import type { Habit, HabitLog } from '../../types';
import { getDatabase } from '../db';
import { awardTickets } from '../tickets';
import { clampCount, resolveAdjust, shouldAward } from './completion';

export { clampCount, resolveAdjust, shouldAward };

export type AdjustResult = {
  count: number;
  completed: boolean;
  ticketsRequested: number;
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

// Serialises every adjustHabitCount call in JS before it ever reaches SQLite.
//
// withExclusiveTransactionAsync does NOT queue concurrent callers, despite the name.
// Read expo-sqlite/build/SQLiteDatabase.js: it opens a *new connection* and issues a
// plain deferred `BEGIN`. Two overlapping callers therefore both start read
// transactions, and the second one's attempt to upgrade to a write aborts with
// "database is locked" — expo-sqlite sets no busy_timeout. Two fast taps on the same
// quick-add button are exactly that race, so without this queue the second tap throws
// instead of counting.
//
// This only covers callers inside this module. A habit tap racing the Summon tab's
// spendTicket still collides at the SQL layer; the durable fix is a busy_timeout in
// the foundation's initDatabase, which is a shared file and needs the other developer
// (see docs/status/OPEN-ITEMS.md).
let writeQueue: Promise<unknown> = Promise.resolve();

export function adjustHabitCount(habit: Habit, delta: number): Promise<AdjustResult> {
  const next = writeQueue.then(() => adjustHabitCountUnqueued(habit, delta));
  // Swallowed only on the queue's own copy, so one failed write does not poison
  // every later one. The caller still sees the rejection through `next`.
  writeQueue = next.catch(() => undefined);
  return next;
}

async function adjustHabitCountUnqueued(habit: Habit, delta: number): Promise<AdjustResult> {
  const db = getDatabase();
  const logDate = today();

  let decision = resolveAdjust({
    previousCount: 0,
    previousCompletedAt: null,
    delta,
    target: habit.target,
    now: new Date().toISOString(),
  });

  // withExclusiveTransactionAsync, never withTransactionAsync — the latter is a bare
  // BEGIN/COMMIT on the shared connection that overlapping callers corrupt. Every
  // query below runs on `txn`: a stray `db` call in here deadlocks against the write
  // lock `txn` is holding.
  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync<HabitLogRow>(
      'SELECT habit_id, log_date, count, completed_at FROM habit_logs WHERE habit_id = ? AND log_date = ?',
      habit.id,
      logDate,
    );

    decision = resolveAdjust({
      previousCount: row?.count ?? 0,
      previousCompletedAt: row?.completed_at,
      delta,
      target: habit.target,
      now: new Date().toISOString(),
    });

    await txn.runAsync(
      `INSERT INTO habit_logs (habit_id, log_date, count, completed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (habit_id, log_date)
       DO UPDATE SET count = excluded.count, completed_at = excluded.completed_at`,
      habit.id,
      logDate,
      decision.newCount,
      decision.completedAt,
    );
  });

  // Awarded after the transaction commits: awardTickets opens its own transaction on
  // its own connection, and calling it inside the callback would deadlock.
  const ticketsAwarded = decision.justCompleted
    ? await awardTickets(`habit:${habit.id}`, habit.ticketReward)
    : 0;

  return {
    count: decision.newCount,
    completed: decision.alreadyCompleted || decision.justCompleted,
    ticketsRequested: decision.justCompleted ? habit.ticketReward : 0,
    // Compares granted against requested rather than against zero, so a habit worth
    // more than one ticket still reports a partial clip.
    capReached: decision.justCompleted && ticketsAwarded < habit.ticketReward,
    ticketsAwarded,
  };
}
