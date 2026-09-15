import type { Character, GachaConfig, Rarity } from '../../types';

export type RollResult = {
  rarity: Rarity;
  newPity: number;
  pityTriggered: boolean;
};

// Pure and RNG-injected on purpose: this is the only place the pity rules live, and
// tests can only pin them down deterministically if the randomness comes from outside.
// No rate, threshold, or cap literal may appear in this file — every number arrives
// on `config`.
export function rollOne(rng: () => number, pity: number, config: GachaConfig): RollResult {
  const nextPity = pity + 1;

  // The guarantee fires when the incoming pity is one below the threshold, because
  // the pull being rolled right now is the threshold-th consecutive one.
  if (nextPity >= config.pityThreshold) {
    return { rarity: 5, newPity: 0, pityTriggered: true };
  }

  const roll = rng();

  if (roll < config.fiveStarRate) {
    return { rarity: 5, newPity: 0, pityTriggered: false };
  }

  if (roll < config.fiveStarRate + config.fourStarRate) {
    return { rarity: 4, newPity: nextPity, pityTriggered: false };
  }

  return { rarity: 3, newPity: nextPity, pityTriggered: false };
}

export function pickCharacter(rng: () => number, pool: Character[]): Character {
  if (pool.length === 0) {
    throw new Error('Cannot pick a character from an empty pool');
  }

  // Clamped because an rng() of exactly 1 would otherwise index off the end.
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[index];
}
