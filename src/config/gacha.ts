import type { GachaConfig, Rarity } from '../types';

export const GACHA_CONFIG: GachaConfig = {
  fiveStarRate: 0.005,
  fourStarRate: 0.15,
  pityThreshold: 60,
  dailyTicketCap: 5,
};

export const DEV_GACHA_CONFIG: GachaConfig = {
  ...GACHA_CONFIG,
  fiveStarRate: 0.25,
  fourStarRate: 0.4,
  pityThreshold: 5,
};

export function getGachaConfig(): GachaConfig {
  return __DEV__ ? DEV_GACHA_CONFIG : GACHA_CONFIG;
}

/** One copy threshold per rank, R1 through R5. Fixed length so a short ladder is a compile error. */
export type RankThresholds = [number, number, number, number, number];

/**
 * Copies required to REACH each rank, inclusive of the first copy that granted the
 * character. Rarer characters need fewer copies: 3★ pulls are ~84.5% of all pulls and
 * would otherwise be noise, so their ladders are long enough to absorb the flood, while
 * a 5★ duplicate arrives every few weeks and must therefore be an event.
 *
 * ⚠ Supply-sensitive to roster size. Every character added to `src/data/characters.ts`
 * dilutes per-character copies within its rarity — doubling the 5★ roster doubles the
 * time to R5 on any given 5★. Growing the roster and re-checking these numbers are the
 * same task. See the spec's §3 for the derivation.
 */
export const RANK_THRESHOLDS: Record<Rarity, RankThresholds> = {
  3: [3, 8, 15, 25, 40],
  4: [2, 4, 7, 11, 16],
  5: [2, 3, 4, 5, 6],
};

/**
 * Deliberately NOT dev-overridden, unlike the rates: the same precedent as
 * `dailyTicketCap`. Exists as a function anyway so callers read thresholds exactly the
 * way they read rates, and so the How it works screen can be tested against values the
 * app has never shipped.
 */
export function getRankThresholds(): Record<Rarity, RankThresholds> {
  return RANK_THRESHOLDS;
}
