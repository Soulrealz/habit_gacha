import { getGachaConfig } from '../../config/gacha';
import { today } from '../../lib/date';
import { getDatabase } from '../db';
import { clampAward } from './cap';

export async function getBalance(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ balance: number | null }>(
    'SELECT SUM(delta) AS balance FROM ticket_ledger',
  );
  return row?.balance ?? 0;
}

export async function awardTickets(reason: string, amount: number): Promise<number> {
  const db = getDatabase();
  const dailyCap = getGachaConfig().dailyTicketCap;
  const logDate = today();
  let granted = 0;

  await db.withExclusiveTransactionAsync(async (txn) => {
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
  const db = getDatabase();
  let spent = false;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync<{ balance: number | null }>(
      'SELECT SUM(delta) AS balance FROM ticket_ledger',
    );

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
