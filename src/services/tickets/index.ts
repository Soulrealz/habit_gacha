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

export async function spendTicket(): Promise<boolean> {
  let spent = false;

  await withWriteTransaction(async (txn) => {
    const row = await txn.getFirstAsync<{ balance: number | null }>(
      'SELECT SUM(delta) AS balance FROM ticket_ledger',
    );

    // Recomputed on every attempt, never left over from an aborted one: the queue
    // may re-run this same closure after a rollback, and a stale `true` here would
    // hand out a summon with no debit in the ledger.
    spent = false;

    if ((row?.balance ?? 0) > 0) {
      await txn.runAsync(
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
