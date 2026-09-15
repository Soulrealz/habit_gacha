import { SummonScreen } from '../SummonScreen';
import { CHARACTERS } from '../../data/characters';
import { press, renderAndSettle, settle, textContent } from '../../test-utils/render';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]),
}));

// In-memory stand-in for the ledger, pity counter, and collection. The roll itself is
// the REAL engine — `rollOne` and `pickCharacter` from src/services/gacha/engine — with
// a deterministic RNG, so this walks the gacha walkthrough against the genuine pity and
// rarity rules rather than a re-implementation of them.
const store = {
  balance: 0,
  pity: 0,
  owned: {} as Record<string, number>,
  rng: () => 0.9,
  failRecord: false,
  inFlight: false,
};

jest.mock('../../services/gacha', () => {
  const { rollOne, pickCharacter } = jest.requireActual('../../services/gacha/engine');
  const { charactersByRarity } = jest.requireActual('../../data/characters');
  const config = { fiveStarRate: 0.005, fourStarRate: 0.15, pityThreshold: 60, dailyTicketCap: 5 };

  return {
    performSummon: async () => {
      if (store.inFlight) {
        return { status: 'busy' };
      }
      store.inFlight = true;
      try {
        if (store.balance <= 0) {
          return { status: 'no_tickets' };
        }
        store.balance -= 1;

        const result = rollOne(store.rng, store.pity, config);
        const character = pickCharacter(store.rng, charactersByRarity(result.rarity));

        if (store.failRecord) {
          return { status: 'failed', ticketSpent: true };
        }

        const isNew = !store.owned[character.id];
        store.owned[character.id] = (store.owned[character.id] ?? 0) + 1;
        store.pity = result.newPity;

        return {
          status: 'success',
          character,
          rarity: result.rarity,
          isNew,
          pityTriggered: result.pityTriggered,
        };
      } finally {
        store.inFlight = false;
      }
    },
  };
});

jest.mock('../../services/tickets', () => ({
  getBalance: async () => store.balance,
}));

const SUMMON = 'Summon one character';

beforeEach(() => {
  store.balance = 0;
  store.pity = 0;
  store.owned = {};
  store.rng = () => 0.9;
  store.failRecord = false;
  store.inFlight = false;
});

// The gacha plan's eight-step walkthrough (Task 6, Step 3). Steps 4 and 5 belong to the
// Collection screen and live in its own file; step 7 (cold restart) needs a device.
describe('Summon screen walkthrough', () => {
  it('step 1: the button is disabled at a balance of zero', async () => {
    const renderer = await renderAndSettle(<SummonScreen />);

    expect(textContent(renderer)).toContain('🎟 0');
    expect(pressable(renderer).disabled).toBe(true);
  });

  it('step 2: a ticket earned elsewhere enables the button on focus', async () => {
    store.balance = 1;
    const renderer = await renderAndSettle(<SummonScreen />);

    expect(textContent(renderer)).toContain('🎟 1');
    expect(pressable(renderer).disabled).toBe(false);
  });

  it('step 3: a pull shows the character, marks it NEW, and spends the ticket', async () => {
    store.balance = 1;
    const renderer = await renderAndSettle(<SummonScreen />);

    await press(renderer, SUMMON);

    const text = textContent(renderer);
    expect(text).toContain('NEW');
    expect(text).toContain('★');
    expect(text).toContain('🎟 0');
    expect(pressable(renderer).disabled).toBe(true);

    const pulled = Object.keys(store.owned);
    expect(pulled).toHaveLength(1);
    expect(text).toContain(CHARACTERS.find((c) => c.id === pulled[0])!.name);
  });

  it('does not mark a duplicate as NEW', async () => {
    store.balance = 2;
    const renderer = await renderAndSettle(<SummonScreen />);

    await press(renderer, SUMMON);
    expect(textContent(renderer)).toContain('NEW');

    await press(renderer, SUMMON);
    expect(textContent(renderer)).not.toContain('NEW');
  });

  it('step 6: a pity-triggered pull is badged GUARANTEED', async () => {
    store.balance = 1;
    store.pity = 59; // the next pull is the 60th
    const renderer = await renderAndSettle(<SummonScreen />);

    await press(renderer, SUMMON);

    const text = textContent(renderer);
    expect(text).toContain('GUARANTEED');
    expect(text).toContain('★★★★★');
    expect(store.pity).toBe(0);
  });

  it('does not badge an ordinary pull as GUARANTEED', async () => {
    store.balance = 1;
    const renderer = await renderAndSettle(<SummonScreen />);

    await press(renderer, SUMMON);

    expect(textContent(renderer)).not.toContain('GUARANTEED');
    expect(store.pity).toBe(1);
  });

  it('step 8: rapid taps with one ticket resolve exactly one pull', async () => {
    store.balance = 1;
    const renderer = await renderAndSettle(<SummonScreen />);

    const button = pressable(renderer);
    // Fired in the same frame, before any state update can re-render the button.
    await actAll([button.onPress, button.onPress, button.onPress]);

    expect(store.balance).toBe(0);
    expect(Object.values(store.owned).reduce((sum, n) => sum + n, 0)).toBe(1);
    expect(textContent(renderer)).toContain('🎟 0');
  });
});

describe('Summon screen messages', () => {
  it('explains an empty wallet rather than failing silently', async () => {
    const renderer = await renderAndSettle(<SummonScreen />);

    // The button is disabled in the UI, so this reaches past it deliberately: the point
    // is that the service's own no_tickets answer is surfaced rather than swallowed.
    await actAll([pressable(renderer).onPress]);

    expect(textContent(renderer)).toContain('No tickets yet');
  });

  it('says so when a pull fails after the ticket was spent', async () => {
    store.balance = 1;
    store.failRecord = true;
    const renderer = await renderAndSettle(<SummonScreen />);

    await press(renderer, SUMMON);

    expect(textContent(renderer)).toContain('your ticket was spent');
  });

  it('clears a stale message when a later pull succeeds', async () => {
    store.balance = 1;
    store.failRecord = true;
    const renderer = await renderAndSettle(<SummonScreen />);
    await press(renderer, SUMMON);
    expect(textContent(renderer)).toContain('your ticket was spent');

    store.failRecord = false;
    store.balance = 1;
    await settle();
    await press(renderer, SUMMON);

    const text = textContent(renderer);
    expect(text).not.toContain('your ticket was spent');
    expect(text).toContain('NEW');
  });
});

function pressable(renderer: Parameters<typeof textContent>[0]) {
  const found = renderer.root.find(
    (instance) =>
      instance.props.accessibilityLabel === SUMMON && typeof instance.props.onPress === 'function',
  );
  return found.props as { onPress: () => void; disabled?: boolean };
}

async function actAll(handlers: (() => void)[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { act } = require('react-test-renderer');
  await act(async () => {
    for (const handler of handlers) {
      handler();
    }
  });
  await settle();
}
