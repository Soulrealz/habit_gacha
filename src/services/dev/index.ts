import { withWriteTransaction } from '../db';

/**
 * Dev grants are dated outside any real day on purpose.
 *
 * `awardTickets` enforces the daily cap by summing positive ledger rows whose `log_date`
 * is today. A grant dated today would count against that cap, so granting 50 tickets to
 * test summoning would silently stop real habit completions paying out — corrupting the
 * exact behaviour you granted them to test. Dated this way the grant still counts toward
 * the balance (`getBalance` sums the whole ledger, unfiltered) but can never consume a
 * day's cap.
 *
 * The alternative — teaching `awardTickets` to exclude `dev_grant` — would mean editing
 * the ticket seam the habits vertical shares, which is not a unilateral change to make.
 */
const DEV_LOG_DATE = '1970-01-01';

const DEV_GRANT_REASON = 'dev_grant';

/**
 * The guarantee that matters. The UI gates this panel behind `__DEV__` too, but that is
 * one misplaced edit away from failing open, and every operation here is destructive or
 * economy-altering. Refusing at the service is what makes it safe.
 */
function assertDevBuild(): void {
  if (!__DEV__) {
    throw new Error('Dev tools are not available in a production build.');
  }
}

/** Grants tickets outright, ignoring the daily cap. Dev builds only. */
export async function grantTickets(amount: number): Promise<void> {
  assertDevBuild();

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Ticket grants must be a positive whole number, got ${amount}.`);
  }

  await withWriteTransaction(async (txn) => {
    await txn.runAsync(
      'INSERT INTO ticket_ledger (delta, reason, log_date, created_at) VALUES (?, ?, ?, ?)',
      amount,
      DEV_GRANT_REASON,
      DEV_LOG_DATE,
      new Date().toISOString(),
    );
  });
}

/**
 * Empties the collection so the grid returns to silhouettes. Dev builds only.
 *
 * Deliberately leaves the ticket ledger and the pity counter alone — they are separate
 * resets, so a collection wipe does not quietly hand back the tickets it took to fill.
 */
export async function resetCollection(): Promise<void> {
  assertDevBuild();

  await withWriteTransaction(async (txn) => {
    await txn.runAsync('DELETE FROM owned_characters');
  });
}

/** Puts the pity counter back to zero, so the guarantee can be tested from a known state. */
export async function resetPity(): Promise<void> {
  assertDevBuild();

  await withWriteTransaction(async (txn) => {
    await txn.runAsync('UPDATE player_state SET pity_counter = 0 WHERE id = 1');
  });
}
