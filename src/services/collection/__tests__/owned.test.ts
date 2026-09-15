import { countOwned, toOwnedCopies } from '../owned';
import type { Character, OwnedCharacter } from '../../../types';

const roster: Character[] = [
  { id: 'a', name: 'A', rarity: 3, sprite: 1 },
  { id: 'b', name: 'B', rarity: 4, sprite: 2 },
  { id: 'c', name: 'C', rarity: 5, sprite: 3 },
];

function row(characterId: string, copies: number): OwnedCharacter {
  return { characterId, copies, firstObtainedAt: '2026-09-15T00:00:00.000Z' };
}

describe('toOwnedCopies', () => {
  it('returns an empty map for no rows', () => {
    expect(toOwnedCopies([])).toEqual({});
  });

  it('keys copies by character id', () => {
    expect(toOwnedCopies([row('a', 1), row('b', 3)])).toEqual({ a: 1, b: 3 });
  });
});

describe('countOwned', () => {
  it('counts nothing when the collection is empty', () => {
    expect(countOwned(roster, {})).toBe(0);
  });

  it('counts a character once however many copies are held', () => {
    expect(countOwned(roster, { a: 1, b: 7 })).toBe(2);
  });

  it('ignores owned ids that are no longer in the roster', () => {
    expect(countOwned(roster, { a: 1, retired_01: 4 })).toBe(1);
  });

  it('never exceeds the roster size', () => {
    const owned = { a: 2, b: 2, c: 2, retired_01: 2, retired_02: 2 };
    expect(countOwned(roster, owned)).toBeLessThanOrEqual(roster.length);
    expect(countOwned(roster, owned)).toBe(3);
  });
});
