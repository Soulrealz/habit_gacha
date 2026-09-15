import type { Character, OwnedCharacter } from '../../types';

export type OwnedCopies = Record<string, number>;

export function toOwnedCopies(rows: OwnedCharacter[]): OwnedCopies {
  const copies: OwnedCopies = {};
  for (const row of rows) {
    copies[row.characterId] = row.copies;
  }
  return copies;
}

// Counts roster members the player owns, not rows in the table. Counting rows would
// let the header read "10 / 9" if a character id were ever retired from the roster
// while its owned_characters row survived.
export function countOwned(roster: Character[], owned: OwnedCopies): number {
  return roster.filter((character) => (owned[character.id] ?? 0) > 0).length;
}
