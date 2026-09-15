import type * as SQLite from 'expo-sqlite';
import { withWriteTransaction } from '../index';

// Hoisted above the imports by babel-jest. The real module pulls in native code (and
// expo-asset, which is not installed) the moment it is loaded. Nothing here needs it:
// these tests drive `withWriteTransaction` with a fake handle, which is exactly what
// the `handle` parameter exists for.
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

// A stand-in for expo's SQLiteDatabase that behaves the way the real one does: the
// callback receives a SEPARATE handle (`txn`), and the outer handle is not it.
function fakeDatabase(options: { failTimes?: number; error?: unknown } = {}) {
  const calls: string[] = [];
  let remainingFailures = options.failTimes ?? 0;

  const txn = {
    __handle: 'txn',
    runAsync: async (sql: string) => {
      calls.push(sql);
    },
  };

  const db = {
    __handle: 'db',
    withExclusiveTransactionAsync: async (task: (handle: unknown) => Promise<void>) => {
      await task(txn);
      if (remainingFailures > 0) {
        remainingFailures--;
        // Models a COMMIT that loses the lock: the task already ran, and expo's
        // ROLLBACK then discards everything it did before the error is rethrown.
        calls.length = 0;
        throw options.error ?? new Error('database is locked');
      }
    },
  };

  return { db: db as unknown as SQLite.SQLiteDatabase, txn, calls };
}

describe('withWriteTransaction wiring', () => {
  it('passes the transaction handle to the task, not the outer database', async () => {
    const { db, txn } = fakeDatabase();
    let received: unknown;

    await withWriteTransaction(async (handle) => {
      received = handle;
    }, db);

    expect(received).toBe(txn);
    expect(received).not.toBe(db);
  });

  it('propagates the task result back to the caller', async () => {
    const { db } = fakeDatabase();
    await expect(withWriteTransaction(async () => 'the result', db)).resolves.toBe('the result');
  });

  it('uses the supplied handle instead of the uninitialised global one', async () => {
    const { db } = fakeDatabase();
    // getDatabase() would throw here; passing a handle is what lets migrations run
    // before initDatabase() has finished.
    await expect(withWriteTransaction(async () => 'ok', db)).resolves.toBe('ok');
  });

  it('throws a clear error when no handle is given and the database is not initialised', async () => {
    await expect(withWriteTransaction(async () => 'ok')).rejects.toThrow('not initialised');
  });

  it('rejects rather than throwing synchronously, so callers can catch it', () => {
    const result = withWriteTransaction(async () => 'ok');
    expect(result).toBeInstanceOf(Promise);
    return expect(result).rejects.toThrow('not initialised');
  });
});

describe('withWriteTransaction retries', () => {
  it('re-runs the whole task from the top, discarding the failed attempt', async () => {
    const { db, calls } = fakeDatabase({ failTimes: 1 });
    const attempts: number[] = [];
    let attempt = 0;

    await withWriteTransaction(async (txn) => {
      attempt++;
      attempts.push(attempt);
      await txn.runAsync(`INSERT ${attempt}`);
    }, db);

    // Two attempts ran, but only the surviving one's work is present.
    expect(attempts).toEqual([1, 2]);
    expect(calls).toEqual(['INSERT 2']);
  });

  it('restores a lock error that expo destroyed with a failed ROLLBACK', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { db } = fakeDatabase({
      failTimes: 1,
      error: new Error('cannot rollback - no transaction is active'),
    });

    // Without the translation this would be unrecognised and never retried.
    await expect(withWriteTransaction(async () => 'recovered', db)).resolves.toBe('recovered');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('withWriteTransaction nested-write guard', () => {
  it('rejects a write started from inside another write instead of deadlocking', async () => {
    const { db } = fakeDatabase();

    await expect(
      withWriteTransaction(async () => {
        // The queue is process-global, so this could never get a slot.
        await withWriteTransaction(async () => 'inner', db);
      }, db),
    ).rejects.toThrow('Nested write transaction');
  });

  it('releases the guard so later writes still work', async () => {
    const { db } = fakeDatabase();

    await expect(
      withWriteTransaction(async () => {
        await withWriteTransaction(async () => 'inner', db);
      }, db),
    ).rejects.toThrow('Nested write transaction');

    await expect(withWriteTransaction(async () => 'after', db)).resolves.toBe('after');
  });
});

describe('withWriteTransaction serialisation (the regression this change exists for)', () => {
  // Reproduces the measured probe: 8 concurrent read-then-write awards against a cap of
  // 5. Before the queue, overlapping callers threw and the balance came out at 1.
  it('keeps 8 concurrent capped awards correct and non-overlapping', async () => {
    let ledger = 0;
    let concurrent = 0;
    let maxConcurrent = 0;
    const CAP = 5;

    const { db } = fakeDatabase();

    const award = () =>
      withWriteTransaction(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);

        const balance = ledger;
        // Forces interleaving: without serialisation every caller reads the same value.
        await new Promise<void>((resolve) => setImmediate(() => resolve()));
        const granted = Math.max(0, Math.min(1, CAP - balance));
        ledger = balance + granted;

        concurrent--;
        return granted;
      }, db);

    const results = await Promise.all(Array.from({ length: 8 }, award));

    expect(maxConcurrent).toBe(1);
    expect(ledger).toBe(CAP);
    expect(results.reduce((sum, granted) => sum + granted, 0)).toBe(CAP);
  });
});
