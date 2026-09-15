import type * as SQLite from 'expo-sqlite';
import { getGachaConfig } from '../../config/gacha';
import { charactersByRarity } from '../../data/characters';
import type { Character, Rarity } from '../../types';
import { recordCharacterOn } from '../collection';
import { withWriteTransaction } from '../db';
import { spendTicketOn } from '../tickets';
import { pickCharacter, rollOne } from './engine';

export type SummonOutcome =
  | { status: 'no_tickets' }
  | { status: 'busy' }
  | { status: 'failed' }
  | {
      status: 'success';
      character: Character;
      rarity: Rarity;
      isNew: boolean;
      pityTriggered: boolean;
    };

let inFlight = false;

async function readPityOn(txn: SQLite.SQLiteDatabase): Promise<number> {
  const row = await txn.getFirstAsync<{ pity_counter: number }>(
    'SELECT pity_counter FROM player_state WHERE id = 1',
  );
  return row?.pity_counter ?? 0;
}

async function writePityOn(txn: SQLite.SQLiteDatabase, value: number): Promise<void> {
  await txn.runAsync('UPDATE player_state SET pity_counter = ? WHERE id = 1', value);
}

// The only place in this vertical that calls getGachaConfig() or Math.random.
//
// The whole summon — spend, roll, grant, pity — is ONE transaction. It used to be three
// separate committed writes, which left a window where the ticket was debited and the
// character never landed: a lost ticket, permanently, in an app whose entire currency is
// tickets. Now any failure rolls the debit back with everything else, so that window
// does not exist and there is no "your ticket was spent, sorry" state to report.
//
// Two consequences worth knowing:
//
// - The services are called through their `…On(txn)` forms. Calling the public
//   `spendTicket()` or `recordCharacter()` here would throw: `withWriteTransaction` is a
//   process-global mutex and rejects a nested write rather than deadlocking on itself.
// - The write queue re-runs its callback after a lock conflict, so a retried summon
//   re-rolls the dice. That is sound because nothing was committed, but it does mean a
//   roll is not fixed until it commits.
//
// `inFlight` rejects a second concurrent call outright. It is not the double-spend
// guard — `spendTicketOn` reading the balance inside this transaction is — but it stops
// a queue of taps building up behind a slow write.
export async function performSummon(): Promise<SummonOutcome> {
  if (inFlight) {
    return { status: 'busy' };
  }

  inFlight = true;

  try {
    return await withWriteTransaction<SummonOutcome>(async (txn) => {
      const spent = await spendTicketOn(txn);
      if (!spent) {
        return { status: 'no_tickets' };
      }

      const config = getGachaConfig();
      const pity = await readPityOn(txn);
      const result = rollOne(Math.random, pity, config);
      const character = pickCharacter(Math.random, charactersByRarity(result.rarity));

      const isNew = await recordCharacterOn(txn, character.id);
      await writePityOn(txn, result.newPity);

      return {
        status: 'success',
        character,
        rarity: result.rarity,
        isNew,
        pityTriggered: result.pityTriggered,
      };
    });
  } catch (error) {
    // The transaction rolled back, so the ticket was not spent. Reported rather than
    // thrown so the screen can say exactly that.
    console.error('Summon failed', error);
    return { status: 'failed' };
  } finally {
    inFlight = false;
  }
}
