import type { Character, Rarity } from '../types';

export const CHARACTERS: Character[] = [
  {
    id: 'aria_01',
    name: 'Aria',
    rarity: 5,
    sprite: require('../../assets/characters/aria_01.png'),
    altSprite: require('../../assets/characters/aria_01_alt.png'),
    lore: [
      'The First Light',
      'Kept the lamp on the last road out of the valley, and never once let it go out — not in storms, not in the years nobody came.',
      '"Get up. The morning is not waiting for either of us."',
    ],
  },
  {
    id: 'brin_01',
    name: 'Brin',
    rarity: 5,
    sprite: require('../../assets/characters/brin_01.png'),
    altSprite: require('../../assets/characters/brin_01_alt.png'),
    lore: [
      'The Unbroken Vow',
      'Made one promise, to one person, a very long time ago. Has structured every day since around keeping it.',
      '"I am not stronger than you. I have just been at this longer."',
    ],
  },
  {
    id: 'caul_01',
    name: 'Caul',
    rarity: 4,
    sprite: require('../../assets/characters/caul_01.png'),
    altSprite: require('../../assets/characters/caul_01_alt.png'),
    lore: [
      'The Quiet Hour',
      'Works before dawn, when the halls are empty and there is nobody to perform for. Insists this is the only honest time of day.',
      '"Nobody is watching. That is rather the point."',
    ],
  },
  {
    id: 'dax_01',
    name: 'Dax',
    rarity: 4,
    sprite: require('../../assets/characters/dax_01.png'),
    altSprite: require('../../assets/characters/dax_01_alt.png'),
    lore: [
      'The Iron Count',
      'Counts everything — steps, breaths, repetitions. Claims the counting is not discipline but company.',
      '"Eight. Nine. See? Already further than yesterday."',
    ],
  },
  {
    id: 'echo_01',
    name: 'Echo',
    rarity: 4,
    sprite: require('../../assets/characters/echo_01.png'),
    altSprite: require('../../assets/characters/echo_01_alt.png'),
    lore: [
      'The Second Wind',
      'Turns up precisely when someone has decided to stop, and has never been thanked for it at the time.',
      '"You said that five minutes ago and you are still going."',
    ],
  },
  {
    id: 'fen_01',
    name: 'Fen',
    rarity: 3,
    sprite: require('../../assets/characters/fen_01.png'),
    altSprite: require('../../assets/characters/fen_01_alt.png'),
    lore: [
      'The Early Riser',
      'Has never needed an alarm and finds the concept faintly insulting. Is insufferable about this.',
      '"It is a beautiful morning. It has been for three hours."',
    ],
  },
  {
    id: 'gale_01',
    name: 'Gale',
    rarity: 3,
    sprite: require('../../assets/characters/gale_01.png'),
    altSprite: require('../../assets/characters/gale_01_alt.png'),
    lore: [
      'The Long Walk',
      'Measures journeys in days rather than distance, and has opinions about people who sprint the first mile.',
      '"Slower. You are racing someone who is not here."',
    ],
  },
  {
    id: 'hex_01',
    name: 'Hex',
    rarity: 3,
    sprite: require('../../assets/characters/hex_01.png'),
    altSprite: require('../../assets/characters/hex_01_alt.png'),
    lore: [
      'The Stubborn Ember',
      'Refuses, with some style, to go out. Has been written off more times than anyone has bothered to count.',
      '"Still here. Annoying, is it not?"',
    ],
  },
  {
    id: 'iris_01',
    name: 'Iris',
    rarity: 3,
    sprite: require('../../assets/characters/iris_01.png'),
    altSprite: require('../../assets/characters/iris_01_alt.png'),
    lore: [
      'The Patient Bloom',
      'Plants things that will not flower for years, and considers this entirely reasonable.',
      '"You will not see today\'s work today. Do it anyway."',
    ],
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
