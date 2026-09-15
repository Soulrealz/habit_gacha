import { act, type ReactTestRenderer } from 'react-test-renderer';
import { TodayScreen } from '../TodayScreen';
import { GYM_HABITS } from '../../data/habits';
import type { Habit } from '../../types';
import { GACHA_CONFIG } from '../../config/gacha';
import { press, renderAndSettle, settle, textContent } from '../../test-utils/render';

// Mirrors useFocusEffect closely enough for a mounted screen: the real one also keys
// its internal useEffect on the callback identity. Inlined rather than shared, because
// jest hoists this factory above every import.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]),
}));

// An in-memory stand-in for SQLite. Everything above the storage layer is the REAL
// logic — `resolveAdjust` decides completion and `clampAward` clips the cap — so this
// walks the plan's device walkthrough against the genuine rules, not a re-implementation
// of them. Only the part that needs a device is faked.
const store = {
  counts: {} as Record<string, number>,
  completedAt: {} as Record<string, string | null>,
  ledger: [] as { delta: number }[],
};

jest.mock('../../services/habits', () => {
  const { resolveAdjust } = jest.requireActual('../../services/habits/completion');
  const { clampAward } = jest.requireActual('../../services/tickets/cap');
  const { GACHA_CONFIG: config } = jest.requireActual('../../config/gacha');

  return {
    getTodayLogs: async () => {
      const logs: Record<string, unknown> = {};
      for (const [habitId, count] of Object.entries(store.counts)) {
        logs[habitId] = {
          habitId,
          logDate: '2026-09-15',
          count,
          completedAt: store.completedAt[habitId] ?? null,
        };
      }
      return logs;
    },
    adjustHabitCount: async (
      habit: { id: string; target: number; ticketReward: number },
      delta: number,
    ) => {
      const decision = resolveAdjust({
        previousCount: store.counts[habit.id] ?? 0,
        previousCompletedAt: store.completedAt[habit.id],
        delta,
        target: habit.target,
        now: 'COMPLETED-AT',
      });

      store.counts[habit.id] = decision.newCount;
      store.completedAt[habit.id] = decision.completedAt;

      let ticketsAwarded = 0;
      if (decision.justCompleted) {
        const awardedToday = store.ledger
          .filter((row) => row.delta > 0)
          .reduce((sum, row) => sum + row.delta, 0);
        ticketsAwarded = clampAward(habit.ticketReward, awardedToday, config.dailyTicketCap);
        if (ticketsAwarded > 0) {
          store.ledger.push({ delta: ticketsAwarded });
        }
      }

      return {
        count: decision.newCount,
        completed: decision.alreadyCompleted || decision.justCompleted,
        ticketsRequested: decision.justCompleted ? habit.ticketReward : 0,
        ticketsAwarded,
        capReached: decision.justCompleted && ticketsAwarded < habit.ticketReward,
      };
    },
  };
});

jest.mock('../../services/tickets', () => ({
  getBalance: async () => store.ledger.reduce((sum, row) => sum + row.delta, 0),
}));

const PULLUPS = GYM_HABITS.find((habit) => habit.id === 'pullups')!;
const add = (amount: number) => `Add ${amount} ${PULLUPS.unit} to ${PULLUPS.name}`;
const remove = (amount: number) => `Remove ${amount} ${PULLUPS.unit} from ${PULLUPS.name}`;

beforeEach(() => {
  store.counts = {};
  store.completedAt = {};
  store.ledger = [];
});

// Not every habit has a quick-add equal to its target — Push-ups is 30 with a largest
// add of 20 — so completing one means repeating its biggest button.
async function complete(renderer: ReactTestRenderer, habit: Habit): Promise<void> {
  const largest = Math.max(...habit.quickAdd);
  const presses = Math.ceil(habit.target / largest);
  for (let i = 0; i < presses; i++) {
    await press(renderer, `Add ${largest} ${habit.unit} to ${habit.name}`);
  }
}

// The seven-step walkthrough from the habits plan (Task 5, Step 3), minus step 7 —
// persistence across a cold restart genuinely needs a device.
describe('Today screen walkthrough', () => {
  it('step 1: starts every habit at zero with an empty ticket balance', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);
    const text = textContent(renderer);

    expect(text).toContain('🎟 0');
    for (const habit of GYM_HABITS) {
      expect(text).toContain(`0 / ${habit.target} ${habit.unit}`);
    }
    expect(text).not.toContain('✓');
  });

  it('step 2: two +5 taps complete Pull-ups, award a ticket, and say so', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);

    await press(renderer, add(5));
    await press(renderer, add(5));

    const text = textContent(renderer);
    expect(text).toContain('10 / 10 reps');
    expect(text).toContain('Pull-ups ✓');
    expect(text).toContain('Pull-ups complete! +1 ticket');
    expect(text).toContain('🎟 1');
  });

  it('step 3: adding more does not award a second ticket', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);
    await press(renderer, add(10));
    expect(textContent(renderer)).toContain('🎟 1');

    await press(renderer, add(1));

    const text = textContent(renderer);
    expect(text).toContain('11 / 10 reps');
    expect(text).toContain('🎟 1');
  });

  // Amended 2026-09-15 after the first device run. The plan's step 4 originally expected
  // the ✓ to stay as proof that awards are not clawed back; it conflated the two. The
  // earned ticket is what must not be clawed back. The tick is live progress.
  it('step 4: dropping back below the target keeps the ticket but not the tick', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);
    await press(renderer, add(10));

    await press(renderer, remove(1));
    await press(renderer, remove(1));

    const text = textContent(renderer);
    expect(text).toContain('8 / 10 reps');
    expect(text).not.toContain('Pull-ups ✓');
    expect(text).toContain('🎟 1');
  });

  it('steps 5 and 6: the cap binds, and the sixth completion explains why it paid nothing', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);

    const cap = GACHA_CONFIG.dailyTicketCap;
    for (const habit of GYM_HABITS.slice(0, cap)) {
      await complete(renderer, habit);
    }

    expect(textContent(renderer)).toContain(`🎟 ${cap}`);

    const sixth = GYM_HABITS[cap];
    await complete(renderer, sixth);

    const text = textContent(renderer);
    expect(text).toContain(`${sixth.name} ✓`);
    expect(text).toContain('hit today’s ticket cap');
    expect(text).toContain(`🎟 ${cap}`);
  });
});

describe('Today screen failure handling', () => {
  it('reports a failed write instead of silently doing nothing', async () => {
    const habits = jest.requireMock('../../services/habits');
    const original = habits.adjustHabitCount;
    habits.adjustHabitCount = async () => {
      throw new Error('database is locked');
    };
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const renderer = await renderAndSettle(<TodayScreen />);
    await press(renderer, add(5));

    expect(textContent(renderer)).toContain('Could not log Pull-ups');
    expect(textContent(renderer)).toContain('0 / 10 reps');

    error.mockRestore();
    habits.adjustHabitCount = original;
  });
});

describe('Today screen midnight rollover', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 15, 23, 59, 50, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // The fake store is keyed by habit id, so clearing it is what "the log_date moved on"
  // means here — the new day genuinely has no rows yet.
  function theDayTurnsOver() {
    store.counts = {};
    store.completedAt = {};
  }

  async function crossMidnight() {
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await settle();
  }

  it('resets the visible counts and explains why, with no tap', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);
    await press(renderer, add(10));
    expect(textContent(renderer)).toContain('10 / 10 reps');
    expect(textContent(renderer)).toContain('Pull-ups ✓');

    theDayTurnsOver();
    await crossMidnight();

    const text = textContent(renderer);
    expect(text).toContain('0 / 10 reps');
    expect(text).not.toContain('Pull-ups ✓');
    expect(text).toContain('It’s a new day');
  });

  it('leaves the ticket balance alone, because it is not date-scoped', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);
    await press(renderer, add(10));
    expect(textContent(renderer)).toContain('🎟 1');

    theDayTurnsOver();
    await crossMidnight();

    expect(textContent(renderer)).toContain('🎟 1');
  });

  it('counts the next tap from zero instead of appearing to lose work', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);
    await press(renderer, add(10));

    theDayTurnsOver();
    await crossMidnight();

    await press(renderer, add(5));

    const text = textContent(renderer);
    expect(text).toContain('5 / 10 reps');
    expect(text).not.toContain('It’s a new day');
  });
});

// Found on the first device run: the tick stayed on after editing the count back down.
// `completed_at` means "today's ticket is paid" and is deliberately never cleared, so
// the tick must come from live progress instead.
describe('Today screen tick mark tracks live progress', () => {
  it('drops the tick when the count is edited back below the target', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);
    await press(renderer, add(10));
    expect(textContent(renderer)).toContain('Pull-ups ✓');

    await press(renderer, remove(1));

    const text = textContent(renderer);
    expect(text).toContain('9 / 10 reps');
    expect(text).not.toContain('Pull-ups ✓');
  });

  it('brings the tick back when the target is reached again', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);
    await press(renderer, add(10));
    await press(renderer, remove(1));
    expect(textContent(renderer)).not.toContain('Pull-ups ✓');

    await press(renderer, add(1));

    expect(textContent(renderer)).toContain('Pull-ups ✓');
  });

  it('keeps the earned ticket when the tick goes away — progress is editable, earnings are final', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);
    await press(renderer, add(10));
    expect(store.ledger.reduce((sum, row) => sum + row.delta, 0)).toBe(1);

    await press(renderer, remove(1));
    await press(renderer, remove(1));

    expect(textContent(renderer)).not.toContain('Pull-ups ✓');
    expect(store.ledger.reduce((sum, row) => sum + row.delta, 0)).toBe(1);
  });

  it('pays nothing for re-completing, and says why rather than looking broken', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);
    await press(renderer, add(10));
    await press(renderer, remove(1));

    await press(renderer, add(1));

    const text = textContent(renderer);
    expect(text).toContain('today’s ticket is already earned');
    expect(store.ledger.reduce((sum, row) => sum + row.delta, 0)).toBe(1);
  });

  it('does not nag on every increment above the target', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);
    await press(renderer, add(10));

    await press(renderer, add(1));

    expect(textContent(renderer)).not.toContain('already earned');
  });

  it('still says nothing about earnings for an ordinary increment below the target', async () => {
    const renderer = await renderAndSettle(<TodayScreen />);

    await press(renderer, add(5));

    const text = textContent(renderer);
    expect(text).toContain('5 / 10 reps');
    expect(text).not.toContain('already earned');
    expect(text).not.toContain('complete');
  });
});
