import { today } from '../../lib/date';
import type { Habit, HabitLog } from '../../types';
import { getDatabase, withWriteTransaction } from '../db';
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

// This module used to carry its own JS promise queue, because two fast taps on the
// same quick-add button would otherwise race at the SQL layer. That queue is gone:
// `withWriteTransaction` now serialises every write in the app, which also covers the
// case the local queue could not — a habit tap racing the Summon tab.
export async function adjustHabitCount(habit: Habit, delta: number): Promise<AdjustResult> {
  const logDate = today();

  let decision = resolveAdjust({
    previousCount: 0,
    previousCompletedAt: null,
    delta,
    target: habit.target,
    now: new Date().toISOString(),
  });

  // Read-then-write, so it goes through withWriteTransaction — never
  // db.withExclusiveTransactionAsync directly, which does not serialise callers. Every
  // query below runs on `txn`: a stray `db` call in here deadlocks against the write
  // lock `txn` is holding.
  await withWriteTransaction(async (txn) => {
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
