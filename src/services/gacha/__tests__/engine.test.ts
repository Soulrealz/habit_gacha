import { pickCharacter, rollOne } from '../engine';
import { DEV_GACHA_CONFIG, GACHA_CONFIG } from '../../../config/gacha';
import type { Character, GachaConfig } from '../../../types';

const CONFIG: GachaConfig = {
  fiveStarRate: 0.005,
  fourStarRate: 0.15,
  pityThreshold: 60,
  dailyTicketCap: 5,
};

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const always = (value: number) => () => value;

describe('rollOne rarity bands', () => {
  it('returns a 5★ when the roll falls under the five-star rate', () => {
    const result = rollOne(always(0.001), 0, CONFIG);
    expect(result.rarity).toBe(5);
    expect(result.pityTriggered).toBe(false);
  });

  it('returns a 4★ when the roll falls in the four-star band', () => {
    expect(rollOne(always(0.1), 0, CONFIG).rarity).toBe(4);
  });

  it('returns a 3★ when the roll falls above both bands', () => {
    expect(rollOne(always(0.9), 0, CONFIG).rarity).toBe(3);
  });
});

describe('rollOne pity', () => {
  it('increments pity on a non-five-star pull', () => {
    expect(rollOne(always(0.9), 12, CONFIG).newPity).toBe(13);
  });

  it('resets pity to zero on a natural five-star', () => {
    const result = rollOne(always(0.001), 30, CONFIG);
    expect(result.newPity).toBe(0);
    expect(result.pityTriggered).toBe(false);
  });

  it('does not trigger the guarantee on the 59th consecutive pull', () => {
    const result = rollOne(always(0.9), 58, CONFIG);
    expect(result.rarity).toBe(3);
    expect(result.newPity).toBe(59);
  });

  it('triggers the guarantee on the 60th consecutive pull', () => {
    const result = rollOne(always(0.9), 59, CONFIG);
    expect(result.rarity).toBe(5);
    expect(result.pityTriggered).toBe(true);
    expect(result.newPity).toBe(0);
  });
});

describe('rollOne distribution', () => {
  it('averages roughly 52 pulls per five-star and never exceeds the guarantee', () => {
    const rng = createSeededRng(20260912);
    const pullsPerFiveStar: number[] = [];
    let pity = 0;
    let sinceLast = 0;

    for (let i = 0; i < 200000; i++) {
      const result = rollOne(rng, pity, CONFIG);
      pity = result.newPity;
      sinceLast++;

      if (result.rarity === 5) {
        pullsPerFiveStar.push(sinceLast);
        sinceLast = 0;
      }
    }

    const average =
      pullsPerFiveStar.reduce((sum, value) => sum + value, 0) / pullsPerFiveStar.length;

    expect(pullsPerFiveStar.length).toBeGreaterThan(3000);
    expect(average).toBeGreaterThan(48);
    expect(average).toBeLessThan(56);
    expect(Math.max(...pullsPerFiveStar)).toBeLessThanOrEqual(CONFIG.pityThreshold);
  });
});

describe('pickCharacter', () => {
  const pool: Character[] = [
    { id: 'a', name: 'A', rarity: 3, sprite: 1, altSprite: 4, lore: ['a1', 'a2', 'a3'] },
    { id: 'b', name: 'B', rarity: 3, sprite: 2, altSprite: 5, lore: ['b1', 'b2', 'b3'] },
    { id: 'c', name: 'C', rarity: 3, sprite: 3, altSprite: 6, lore: ['c1', 'c2', 'c3'] },
  ];

  it('picks the first character when the roll is at the bottom', () => {
    expect(pickCharacter(always(0), pool).id).toBe('a');
  });

  it('picks the last character when the roll is near the top', () => {
    expect(pickCharacter(always(0.999), pool).id).toBe('c');
  });

  it('throws on an empty pool rather than returning undefined', () => {
    expect(() => pickCharacter(always(0), [])).toThrow('empty pool');
  });
});

describe('rarity bands stay reachable in every shipped config', () => {
  // A balance tweak that pushes the two rates past 1 would silently delete the 3★
  // tier — the band is computed as the remainder, so it would go negative with no
  // type error and no crash.
  it.each([
    ['production', GACHA_CONFIG],
    ['dev', DEV_GACHA_CONFIG],
  ])('leaves a positive three-star band in the %s config', (_name, config) => {
    expect(config.fiveStarRate).toBeGreaterThan(0);
    expect(config.fourStarRate).toBeGreaterThan(0);
    expect(config.fiveStarRate + config.fourStarRate).toBeLessThan(1);
  });

  it.each([
    ['production', GACHA_CONFIG],
    ['dev', DEV_GACHA_CONFIG],
  ])('reaches all three rarities in the %s config', (_name, config) => {
    const belowFive = config.fiveStarRate / 2;
    const inFourBand = (config.fiveStarRate + config.fourStarRate) / 2;
    const aboveBoth = (config.fiveStarRate + config.fourStarRate + 1) / 2;

    expect(rollOne(always(belowFive), 0, config).rarity).toBe(5);
    expect(rollOne(always(inFourBand), 0, config).rarity).toBe(4);
    expect(rollOne(always(aboveBoth), 0, config).rarity).toBe(3);
  });
});

describe('the pity boundary holds at any threshold', () => {
  // The two tests above hardcode 58/59. This one would catch an off-by-one
  // reintroduced by anyone "simplifying" >= into >.
  it.each([2, 5, 60])(
    'guarantees the %i-th consecutive pull and not the one before',
    (threshold) => {
      const config: GachaConfig = { ...CONFIG, pityThreshold: threshold };

      const beforeGuarantee = rollOne(always(0.9), threshold - 2, config);
      expect(beforeGuarantee.rarity).toBe(3);
      expect(beforeGuarantee.pityTriggered).toBe(false);
      expect(beforeGuarantee.newPity).toBe(threshold - 1);

      const guaranteed = rollOne(always(0.9), threshold - 1, config);
      expect(guaranteed.rarity).toBe(5);
      expect(guaranteed.pityTriggered).toBe(true);
      expect(guaranteed.newPity).toBe(0);
    },
  );
});

describe('rollOne under the dev config', () => {
  it('never exceeds the dev guarantee, which the device walkthrough depends on', () => {
    const rng = createSeededRng(20260915);
    let pity = 0;
    let sinceLast = 0;
    let longestGap = 0;
    let fiveStars = 0;

    for (let i = 0; i < 20000; i++) {
      const result = rollOne(rng, pity, DEV_GACHA_CONFIG);
      pity = result.newPity;
      sinceLast++;

      if (result.rarity === 5) {
        fiveStars++;
        longestGap = Math.max(longestGap, sinceLast);
        sinceLast = 0;
      }
    }

    expect(fiveStars).toBeGreaterThan(0);
    expect(longestGap).toBeLessThanOrEqual(DEV_GACHA_CONFIG.pityThreshold);
  });
});
