import { getDatabase, withWriteTransaction } from '../db';

/** Whether R4 rank borders are drawn. Global, not per character. */
export const SHOW_RANK_BORDERS = 'show_rank_borders';

export async function getSetting(key: string): Promise<string | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await withWriteTransaction(async (txn) => {
    await txn.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  });
}

/**
 * Defaults to true when the row is absent: a player upgrading into this feature has no
 * row, and hiding a border they just earned would read as a bug rather than a default.
 */
export async function getShowRankBorders(): Promise<boolean> {
  return (await getSetting(SHOW_RANK_BORDERS)) !== 'false';
}

export async function setShowRankBorders(value: boolean): Promise<void> {
  await setSetting(SHOW_RANK_BORDERS, value ? 'true' : 'false');
}
