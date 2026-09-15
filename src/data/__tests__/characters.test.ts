import { CHARACTERS, RARITY_COLOURS, charactersByRarity } from '../characters';
import type { Rarity } from '../../types';

describe('CHARACTERS', () => {
  it('has unique ids', () => {
    const ids = CHARACTERS.map((character) => character.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only uses rarities 3, 4, and 5', () => {
    for (const character of CHARACTERS) {
      expect([3, 4, 5]).toContain(character.rarity);
    }
  });

  it('gives every character a sprite', () => {
    for (const character of CHARACTERS) {
      expect(character.sprite).toBeDefined();
    }
  });
});

describe('charactersByRarity', () => {
  it('returns a non-empty pool for every rarity', () => {
    const rarities: Rarity[] = [3, 4, 5];
    for (const rarity of rarities) {
      expect(charactersByRarity(rarity).length).toBeGreaterThan(0);
    }
  });

  it('returns only characters of the requested rarity', () => {
    for (const character of charactersByRarity(5)) {
      expect(character.rarity).toBe(5);
    }
  });
});

describe('RARITY_COLOURS', () => {
  // The Record<Rarity, string> type covers this statically today, but the file's own
  // comment says the two screens must never drift apart on rarity colour — this
  // survives the type being loosened.
  it('has a colour for every rarity in the roster', () => {
    for (const character of CHARACTERS) {
      expect(RARITY_COLOURS[character.rarity]).toBeDefined();
    }
  });

  it('gives each rarity a distinct colour', () => {
    const colours = Object.values(RARITY_COLOURS);
    expect(new Set(colours).size).toBe(colours.length);
  });
});
