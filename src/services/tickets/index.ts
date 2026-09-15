import type * as SQLite from 'expo-sqlite';
import { getGachaConfig } from '../../config/gacha';
import { today } from '../../lib/date';
import { getDatabase, withWriteTransaction } from '../db';
import { clampAward } from './cap';

export async function getBalance(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ balance: number | null }>(
    'SELECT SUM(delta) AS balance FROM ticket_ledger',
  );
  return row?.balance ?? 0;
}

export async function awardTickets(reason: string, amount: number): Promise<number> {
  const dailyCap = getGachaConfig().dailyTicketCap;
  const logDate = today();
  let granted = 0;

  await withWriteTransaction(async (txn) => {
    const row = await txn.getFirstAsync<{ awarded: number | null }>(
      'SELECT SUM(delta) AS awarded FROM ticket_ledger WHERE delta > 0 AND log_date = ?',
      logDate,
    );

    granted = clampAward(amount, row?.awarded ?? 0, dailyCap);

    if (granted > 0) {
      await txn.runAsync(
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

/**
 * Spends one ticket on a caller's existing transaction, returning false if the balance
 * is zero.
 *
 * Exists so a caller can make the spend atomic with whatever it is spending on — the
 * summon flow needs the debit and the character grant to commit together, and
 * `withWriteTransaction` is a process-global mutex that rejects a nested write, so
 * calling `spendTicket()` from inside another transaction is a loud error rather than
 * an option.
 *
 * Every query here runs on the caller's `txn`. Holds no state between calls, so the
 * write queue re-running its callback after a rollback cannot carry a stale result over.
 */
export async function spendTicketOn(txn: SQLite.SQLiteDatabase): Promise<boolean> {
  const row = await txn.getFirstAsync<{ balance: number | null }>(
    'SELECT SUM(delta) AS balance FROM ticket_ledger',
  );

  if ((row?.balance ?? 0) <= 0) {
    return false;
  }

  await txn.runAsync(
    'INSERT INTO ticket_ledger (delta, reason, log_date, created_at) VALUES (?, ?, ?, ?)',
    -1,
    'summon',
    today(),
    new Date().toISOString(),
  );
  return true;
}

/** Spends one ticket in a transaction of its own. */
export async function spendTicket(): Promise<boolean> {
  return withWriteTransaction((txn) => spendTicketOn(txn));
}
