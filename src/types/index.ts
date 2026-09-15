import type { ImageSourcePropType } from 'react-native';

export type HabitCategory = 'gym';

export type Habit = {
  id: string;
  name: string;
  category: HabitCategory;
  target: number;
  unit: string;
  ticketReward: number;
  quickAdd: number[];
};

export type Rarity = 3 | 4 | 5;

export type Character = {
  id: string;
  name: string;
  rarity: Rarity;
  sprite: ImageSourcePropType;
  /**
   * Revealed one entry per rank at R1, R2, R3: epithet, background, personal line.
   * A fixed-length tuple rather than `string[]` on purpose — a character missing an
   * entry is then a compile error instead of a blank panel on the detail screen.
   */
  lore: [string, string, string];
  /** Unlocked at R5. */
  altSprite: ImageSourcePropType;
};

export type HabitLog = {
  habitId: string;
  logDate: string;
  count: number;
  completedAt: string | null;
};

export type OwnedCharacter = {
  characterId: string;
  copies: number;
  firstObtainedAt: string;
};

export type GachaConfig = {
  fiveStarRate: number;
  fourStarRate: number;
  pityThreshold: number;
  dailyTicketCap: number;
};
