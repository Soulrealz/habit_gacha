import type { Character, Rarity } from '../types';

export const CHARACTERS: Character[] = [
  {
    id: 'aria_01',
    name: 'Aria',
    rarity: 5,
    sprite: require('../../assets/characters/aria_01.png'),
  },
  {
    id: 'brin_01',
    name: 'Brin',
    rarity: 5,
    sprite: require('../../assets/characters/brin_01.png'),
  },
  {
    id: 'caul_01',
    name: 'Caul',
    rarity: 4,
    sprite: require('../../assets/characters/caul_01.png'),
  },
  { id: 'dax_01', name: 'Dax', rarity: 4, sprite: require('../../assets/characters/dax_01.png') },
  {
    id: 'echo_01',
    name: 'Echo',
    rarity: 4,
    sprite: require('../../assets/characters/echo_01.png'),
  },
  { id: 'fen_01', name: 'Fen', rarity: 3, sprite: require('../../assets/characters/fen_01.png') },
  {
    id: 'gale_01',
    name: 'Gale',
    rarity: 3,
    sprite: require('../../assets/characters/gale_01.png'),
  },
  { id: 'hex_01', name: 'Hex', rarity: 3, sprite: require('../../assets/characters/hex_01.png') },
  {
    id: 'iris_01',
    name: 'Iris',
    rarity: 3,
    sprite: require('../../assets/characters/iris_01.png'),
  },
];

export function charactersByRarity(rarity: Rarity): Character[] {
  return CHARACTERS.filter((character) => character.rarity === rarity);
}

// Lives here, not in either screen: the Summon and Collection screens both need it
// and must never drift apart. A 5★ that is gold on one screen and not the other is
// the kind of bug users notice immediately.
export const RARITY_COLOURS: Record<Rarity, string> = {
  3: '#adb5bd',
  4: '#9775fa',
  5: '#f59f00',
};
