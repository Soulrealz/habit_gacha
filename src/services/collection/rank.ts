import { getRankThresholds } from '../../config/gacha';
import type { Character, Rarity } from '../../types';

/** R1–R5. Rank 0 is "owned, not yet ranked". */
export const MAX_RANK = 5;

/** R1-R3 each reveal one lore entry. */
export const LORE_RANKS = 3;
/** R4 unlocks the decorative border. */
export const BORDER_RANK = 4;
/** R5 swaps in the alternate artwork. Distinct from MAX_RANK on purpose: they coincide today,
 *  but a future R6 must widen the ladder without silently moving the artwork. */
export const ART_RANK = 5;

/**
 * The single place rank is computed. Pure and I/O-free on purpose: rank is derived from
 * `owned_characters.copies` rather than stored, so there is no second source of truth to
 * drift, and every case is testable without the native SQLite module.
 */
export function rankFor(rarity: Rarity, copies: number): number {
  const thresholds = getRankThresholds()[rarity];
  let rank = 0;
  for (const threshold of thresholds) {
    if (copies < threshold) {
      break;
    }
    rank++;
  }
  return rank;
}

/** Copies still needed for the next rank, or null when there is nothing left to earn. */
export function copiesToNextRank(rarity: Rarity, copies: number): number | null {
  const rank = rankFor(rarity, copies);
  if (rank >= MAX_RANK) {
    return null;
  }
  return getRankThresholds()[rarity][rank] - copies;
}

/** The lore entries unlocked so far, in order. Empty at rank 0. */
export function unlockedLore(character: Character, copies: number): string[] {
  const revealed = Math.min(rankFor(character.rarity, copies), LORE_RANKS);
  return character.lore.slice(0, revealed);
}
