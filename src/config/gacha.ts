import type { GachaConfig } from '../types';

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
