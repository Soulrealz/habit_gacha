import { DEV_GACHA_CONFIG, GACHA_CONFIG } from '../../config/gacha';
import { GYM_HABITS } from '../habits';

describe('GYM_HABITS', () => {
  it('has unique ids', () => {
    const ids = GYM_HABITS.map((habit) => habit.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every habit a positive target and reward', () => {
    for (const habit of GYM_HABITS) {
      expect(habit.target).toBeGreaterThan(0);
      expect(habit.ticketReward).toBeGreaterThan(0);
    }
  });

  it('offers at least one quick-add amount per habit', () => {
    for (const habit of GYM_HABITS) {
      expect(habit.quickAdd.length).toBeGreaterThan(0);
      expect(habit.quickAdd.every((amount) => amount > 0)).toBe(true);
    }
  });

  it('offers more total tickets than the daily cap, so the cap stays meaningful', () => {
    const total = GYM_HABITS.reduce((sum, habit) => sum + habit.ticketReward, 0);
    expect(total).toBeGreaterThan(GACHA_CONFIG.dailyTicketCap);
  });

  it('uses whole numbers only, because habit_logs.count is an INTEGER column', () => {
    for (const habit of GYM_HABITS) {
      expect(Number.isInteger(habit.target)).toBe(true);
      expect(habit.quickAdd.every((amount) => Number.isInteger(amount))).toBe(true);
    }
  });

  it('is measured against a dev cap that matches production, so cap clipping stays testable', () => {
    expect(DEV_GACHA_CONFIG.dailyTicketCap).toBe(GACHA_CONFIG.dailyTicketCap);
  });
});
