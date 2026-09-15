import type { OwnedCharacter } from '../../types';
import { getDatabase, withWriteTransaction } from '../db';

type OwnedCharacterRow = {
  character_id: string;
  copies: number;
  first_obtained_at: string;
};

function toOwnedCharacter(row: OwnedCharacterRow): OwnedCharacter {
  return {
    characterId: row.character_id,
    copies: row.copies,
    firstObtainedAt: row.first_obtained_at,
  };
}

export async function getCollection(): Promise<OwnedCharacter[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<OwnedCharacterRow>(
    'SELECT character_id, copies, first_obtained_at FROM owned_characters ORDER BY first_obtained_at DESC',
  );
  return rows.map(toOwnedCharacter);
}

// Returns true when the character was newly obtained rather than a duplicate.
//
// A duplicate increments `copies` and leaves `first_obtained_at` untouched, which is
// what keeps the deferred duplicate economy possible later without a migration.
//
// Read-then-write, so it goes through withWriteTransaction — never
// db.withExclusiveTransactionAsync directly, which does not serialise callers. Every
// query below runs on `txn`: a stray `db` call in here deadlocks against the write
// lock `txn` holds.
export async function recordCharacter(characterId: string): Promise<boolean> {
  let isNew = false;

  await withWriteTransaction(async (txn) => {
    const existing = await txn.getFirstAsync<{ copies: number }>(
      'SELECT copies FROM owned_characters WHERE character_id = ?',
      characterId,
    );

    if (existing) {
      await txn.runAsync(
        'UPDATE owned_characters SET copies = copies + 1 WHERE character_id = ?',
        characterId,
      );
      isNew = false;
    } else {
      await txn.runAsync(
        'INSERT INTO owned_characters (character_id, copies, first_obtained_at) VALUES (?, 1, ?)',
        characterId,
        new Date().toISOString(),
      );
      isNew = true;
    }
  });

  return isNew;
}
