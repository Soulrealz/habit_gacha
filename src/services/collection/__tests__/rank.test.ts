import { getRankThresholds, RANK_THRESHOLDS } from '../../../config/gacha';
import { CHARACTERS } from '../../../data/characters';
import { copiesToNextRank, MAX_RANK, rankFor, unlockedLore } from '../rank';
import type { Rarity } from '../../../types';

const RARITIES: Rarity[] = [3, 4, 5];

describe('RANK_THRESHOLDS config invariants', () => {
  it('covers every rarity with exactly MAX_RANK thresholds', () => {
    for (const rarity of RARITIES) {
      expect(RANK_THRESHOLDS[rarity]).toHaveLength(MAX_RANK);
    }
  });

  // The test that catches a fat-fingered tune. A non-increasing ladder would make a
  // rank unreachable or skippable without any other test noticing.
  it('gives every rarity a strictly increasing ladder starting above one copy', () => {
    for (const rarity of RARITIES) {
      const thresholds = RANK_THRESHOLDS[rarity];
      expect(thresholds[0]).toBeGreaterThan(1);
      for (let i = 1; i < thresholds.length; i++) {
        expect(thresholds[i]).toBeGreaterThan(thresholds[i - 1]);
      }
    }
  });

  it('is not overridden in dev, unlike the rates', () => {
    expect(getRankThresholds()).toEqual(RANK_THRESHOLDS);
  });
});

describe('rankFor', () => {
  it('is rank 0 for an unowned or single-copy character', () => {
    for (const rarity of RARITIES) {
      expect(rankFor(rarity, 0)).toBe(0);
      expect(rankFor(rarity, 1)).toBe(0);
    }
  });

  // Exactly at, one below, and one above every threshold, for every rarity.
  it('advances exactly on each threshold and not before', () => {
    for (const rarity of RARITIES) {
      const thresholds = RANK_THRESHOLDS[rarity];
      thresholds.forEach((threshold, index) => {
        expect(rankFor(rarity, threshold - 1)).toBe(index);
        expect(rankFor(rarity, threshold)).toBe(index + 1);
      });
    }
  });

  it('caps at MAX_RANK however many copies are held', () => {
    for (const rarity of RARITIES) {
      const top = RANK_THRESHOLDS[rarity][MAX_RANK - 1];
      expect(rankFor(rarity, top)).toBe(MAX_RANK);
      expect(rankFor(rarity, top + 1)).toBe(MAX_RANK);
      expect(rankFor(rarity, top + 10_000)).toBe(MAX_RANK);
    }
  });
});

describe('copiesToNextRank', () => {
  it('counts down to the next threshold', () => {
    for (const rarity of RARITIES) {
      const first = RANK_THRESHOLDS[rarity][0];
      expect(copiesToNextRank(rarity, 1)).toBe(first - 1);
      expect(copiesToNextRank(rarity, first - 1)).toBe(1);
    }
  });

  it('returns null at max rank, so callers must handle "nothing left to earn"', () => {
    for (const rarity of RARITIES) {
      const top = RANK_THRESHOLDS[rarity][MAX_RANK - 1];
      expect(copiesToNextRank(rarity, top)).toBeNull();
      expect(copiesToNextRank(rarity, top + 5)).toBeNull();
    }
  });
});

describe('unlockedLore', () => {
  const character = CHARACTERS[0];

  it('reveals nothing at rank 0', () => {
    expect(unlockedLore(character, 1)).toEqual([]);
  });

  it('reveals one entry per rank up to the third', () => {
    const thresholds = RANK_THRESHOLDS[character.rarity];
    expect(unlockedLore(character, thresholds[0])).toEqual([character.lore[0]]);
    expect(unlockedLore(character, thresholds[1])).toEqual([character.lore[0], character.lore[1]]);
    expect(unlockedLore(character, thresholds[2])).toEqual(character.lore);
  });

  // R4 and R5 unlock a border and artwork, not text — lore must not grow past three.
  it('stops at three entries even at max rank', () => {
    const top = RANK_THRESHOLDS[character.rarity][MAX_RANK - 1];
    expect(unlockedLore(character, top)).toHaveLength(3);
  });
});
