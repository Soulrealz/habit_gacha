import { getGachaConfig } from '../../config/gacha';
import { charactersByRarity } from '../../data/characters';
import type { Character, Rarity } from '../../types';
import { recordCharacter } from '../collection';
import { getDatabase, withWriteTransaction } from '../db';
import { spendTicket } from '../tickets';
import { pickCharacter, rollOne } from './engine';

export type SummonOutcome =
  | { status: 'no_tickets' }
  | { status: 'busy' }
  | { status: 'failed'; ticketSpent: boolean }
  | {
      status: 'success';
      character: Character;
      rarity: Rarity;
      isNew: boolean;
      pityTriggered: boolean;
    };

let inFlight = false;

async function readPity(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ pity_counter: number }>(
    'SELECT pity_counter FROM player_state WHERE id = 1',
  );
  return row?.pity_counter ?? 0;
}

// Goes through the write queue even though a blind single-statement UPDATE is already
// atomic on its own: it keeps this, the last write in the app, from contending for the
// lock with a queued transaction at all.
async function writePity(value: number): Promise<void> {
  await withWriteTransaction(async (txn) => {
    await txn.runAsync('UPDATE player_state SET pity_counter = ? WHERE id = 1', value);
  });
}

// The only place in this vertical that calls getGachaConfig() or Math.random.
//
// Ordering notes, all from spec §9.1:
//
// - `inFlight` rejects a second concurrent call outright, but it is not the
//   double-spend guard. `spendTicket` is: it reads the balance and inserts its debit
//   inside one exclusive transaction, so two concurrent calls against a balance of 1
//   cannot both succeed.
// - Spend, roll, and persist deliberately do not share one transaction, because
//   `spendTicket` owns its own and SQLite cannot nest them. The residual risk is a
//   crash between spending and persisting: that can lose a ticket, but it can never
//   duplicate a character or grant one free.
// - The character is recorded BEFORE pity is advanced, and the order matters. Both are
//   separate auto-committing writes, and either can throw SQLITE_BUSY (see the red
//   section of docs/status/OPEN-ITEMS.md). Failing between them must land on the
//   user's side of the ledger: this way a failure leaves pity un-advanced with the
//   character already granted, which is mildly generous and self-corrects on the next
//   pull. The reverse order would reset pity to 0 on a guaranteed 5★ and then fail to
//   grant it — roughly 52 pulls of progress destroyed, silently and unrecoverably.
export async function performSummon(): Promise<SummonOutcome> {
  if (inFlight) {
    return { status: 'busy' };
  }

  inFlight = true;
  let ticketSpent = false;

  try {
    const spent = await spendTicket();
    if (!spent) {
      return { status: 'no_tickets' };
    }
    ticketSpent = true;

    const config = getGachaConfig();
    const pity = await readPity();
    const result = rollOne(Math.random, pity, config);
    const character = pickCharacter(Math.random, charactersByRarity(result.rarity));

    const isNew = await recordCharacter(character.id);
    await writePity(result.newPity);

    return {
      status: 'success',
      character,
      rarity: result.rarity,
      isNew,
      pityTriggered: result.pityTriggered,
    };
  } catch (error) {
    // Reported rather than thrown so the screen can say whether the ticket was
    // actually consumed. `ticketSpent: true` is the case worth telling the user
    // about — the debit committed but the character never landed.
    console.error('Summon failed', error);
    return { status: 'failed', ticketSpent };
  } finally {
    inFlight = false;
  }
}
