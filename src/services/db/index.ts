import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from './schema';
import { createWriteQueue } from './writeQueue';

const DATABASE_NAME = 'daily_summoner.db';

// Kept, but do not count it as a line of defence — its remaining surface is nearly
// empty. It is per-connection, so it covers this handle only and never the connections
// expo opens inside withExclusiveTransactionAsync; it does not help the read-then-write
// upgrade conflict at all (see ./writeQueue.ts for the measurements); and every write in
// the app now goes through the queue, so there is no unqueued writer left for it to
// rescue. It costs nothing and protects the one case left: a future bare `db` write.
const BUSY_TIMEOUT_MS = 5000;

let database: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const writeQueue = createWriteQueue();

// True while a queued write callback is running. Guards against a nested write, which
// would deadlock on the process-global queue rather than fail.
let inWriteTask = false;

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const startVersion = row?.user_version ?? 0;

  for (let index = startVersion; index < MIGRATIONS.length; index++) {
    // The migration and its version bump must commit together: a crash midway
    // through a multi-statement migration would otherwise replay statements
    // that already applied, permanently bricking startup.
    //
    // Goes through the queue like every other write. Nothing else should be running
    // this early, but the queue is also where the busy-retry lives, and a migration is
    // the single worst write in the app to lose to a transient lock.
    await withWriteTransaction(async (txn) => {
      await txn.execAsync(MIGRATIONS[index]);
      await txn.execAsync(`PRAGMA user_version = ${index + 1}`);
    }, db);
  }
}

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await db.execAsync(`PRAGMA journal_mode = WAL;`);
    await db.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`);
    await runMigrations(db);
    database = db;
    return db;
  })();

  try {
    return await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!database) {
    throw new Error('Database not initialised. Call initDatabase() first.');
  }
  return database;
}

/**
 * The only supported way to run a read-then-write against this database.
 *
 * Serialises every write in the app through one in-process queue and retries a
 * transient lock conflict. Call it instead of `db.withExclusiveTransactionAsync`,
 * which despite its name does not serialise anything — see `./writeQueue.ts` for the
 * measurements.
 *
 * Every query inside `task` must run on the `txn` handle, never on the outer `db`:
 * `txn` is a separate connection holding the write lock, so a stray `db` call
 * deadlocks against it.
 *
 * @param handle Used during initialisation, before `getDatabase()` will answer.
 */
export function withWriteTransaction<T>(
  task: (txn: SQLite.SQLiteDatabase) => Promise<T>,
  handle?: SQLite.SQLiteDatabase,
): Promise<T> {
  // The queue is process-global, so the rule is not "don't nest a call to this module"
  // but "don't start ANY write from inside ANY write callback". Violating it would wait
  // forever on a queue slot that can only free up once the outer task returns — a
  // permanent hang with no timeout and nothing in the logs. Fail loudly instead.
  if (inWriteTask) {
    // Rejected, not thrown: this function is not `async`, so a synchronous throw would
    // escape a caller's `.catch()` and surface as an unhandled rejection instead.
    return Promise.reject(
      new Error(
        'Nested write transaction: a write was started from inside another write callback. ' +
          'Do the inner work on the same `txn`, or sequence the two writes one after the other.',
      ),
    );
  }

  return writeQueue(async () => {
    // Deliberately not falling back to `await initDatabase()` here. That looks like
    // useful hardening but deadlocks: a task enqueued while migrations are still
    // running would wait on `initPromise`, which cannot resolve until a later migration
    // gets the queue slot sitting behind this very task. A loud throw is better than a
    // silent hang, and `App.tsx` already gates every screen behind init.
    const db = handle ?? getDatabase();
    let result!: T;

    inWriteTask = true;
    try {
      await db.withExclusiveTransactionAsync(async (txn) => {
        result = await task(txn);
      });
    } catch (error) {
      throw translateRollbackMask(error);
    } finally {
      inWriteTask = false;
    }

    return result;
  });
}

// expo's withExclusiveTransactionAsync runs `ROLLBACK` in its catch block without
// guarding it. If `BEGIN` itself was what failed, no transaction is active, that
// ROLLBACK throws, and the throw escapes before the original error is recorded — so the
// real cause is destroyed and replaced by a message the retry cannot recognise.
// Restore it: nothing else makes a fresh connection's BEGIN fail this way.
function translateRollbackMask(error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (!/no transaction is active/i.test(message)) {
    return error;
  }

  console.warn(
    'A failed ROLLBACK masked the real transaction error; treating it as a lock conflict.',
    error,
  );
  return new Error(`database is locked (original error lost to a failed ROLLBACK: ${message})`);
}
