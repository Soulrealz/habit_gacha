import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from './schema';

const DATABASE_NAME = 'daily_summoner.db';

let database: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const startVersion = row?.user_version ?? 0;

  for (let index = startVersion; index < MIGRATIONS.length; index++) {
    // The migration and its version bump must commit together: a crash midway
    // through a multi-statement migration would otherwise replay statements
    // that already applied, permanently bricking startup.
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(MIGRATIONS[index]);
      await txn.execAsync(`PRAGMA user_version = ${index + 1}`);
    });
  }
}

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await db.execAsync('PRAGMA journal_mode = WAL;');
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
