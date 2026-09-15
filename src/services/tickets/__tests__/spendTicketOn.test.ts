import type * as SQLite from 'expo-sqlite';
import { spendTicketOn } from '../index';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

/**
 * A transaction handle backed by an in-memory ledger. Splitting the read-then-write out
 * of `withWriteTransaction` is what makes this testable at all — before the split there
 * was no seam here that did not need the native module.
 */
function fakeTxn(ledger: number[]) {
  const inserted: unknown[][] = [];

  const txn = {
    getFirstAsync: async () => ({ balance: ledger.reduce((sum, d) => sum + d, 0) }),
    runAsync: async (_sql: string, ...params: unknown[]) => {
      inserted.push(params);
      ledger.push(params[0] as number);
    },
  };

  return { txn: txn as unknown as SQLite.SQLiteDatabase, inserted };
}

describe('spendTicketOn', () => {
  it('spends a ticket when the balance is positive', async () => {
    const ledger = [3];
    const { txn, inserted } = fakeTxn(ledger);

    await expect(spendTicketOn(txn)).resolves.toBe(true);
    expect(inserted).toHaveLength(1);
    expect(ledger.reduce((sum, d) => sum + d, 0)).toBe(2);
  });

  it('writes a debit of exactly one, tagged as a summon', async () => {
    const { txn, inserted } = fakeTxn([1]);

    await spendTicketOn(txn);

    const [delta, reason] = inserted[0];
    expect(delta).toBe(-1);
    expect(reason).toBe('summon');
  });

  it('refuses and writes nothing at a balance of zero', async () => {
    const ledger = [1, -1];
    const { txn, inserted } = fakeTxn(ledger);

    await expect(spendTicketOn(txn)).resolves.toBe(false);
    expect(inserted).toHaveLength(0);
    expect(ledger.reduce((sum, d) => sum + d, 0)).toBe(0);
  });

  it('refuses rather than going negative', async () => {
    const { txn, inserted } = fakeTxn([]);

    await expect(spendTicketOn(txn)).resolves.toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it('spends only once per call, so a balance of 1 cannot cover two summons', async () => {
    const ledger = [1];
    const { txn } = fakeTxn(ledger);

    await expect(spendTicketOn(txn)).resolves.toBe(true);
    await expect(spendTicketOn(txn)).resolves.toBe(false);
    expect(ledger.reduce((sum, d) => sum + d, 0)).toBe(0);
  });
});
