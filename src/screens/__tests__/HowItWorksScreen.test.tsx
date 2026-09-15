import { act } from 'react-test-renderer';
import { HowItWorksScreen, formatPercent } from '../HowItWorksScreen';
import { renderAndSettle, settle, textContent } from '../../test-utils/render';
import type { GachaConfig, Rarity } from '../../types';
import type { RankThresholds } from '../../config/gacha';

// The screen reads its numbers through getGachaConfig(), so swapping that out is the
// only way to pin them down. Everything else in the module is re-exported untouched.
// The name has to start with `mock` or babel refuses to hoist the factory above the
// imports, and the mock never takes effect.
const mockActive: { config: GachaConfig; thresholds: Record<Rarity, RankThresholds> } = {
  config: GACHA_CONFIG_REAL(),
  thresholds: RANK_THRESHOLDS_REAL(),
};

function GACHA_CONFIG_REAL(): GachaConfig {
  return jest.requireActual<typeof import('../../config/gacha')>('../../config/gacha').GACHA_CONFIG;
}

function RANK_THRESHOLDS_REAL() {
  return jest.requireActual<typeof import('../../config/gacha')>('../../config/gacha')
    .RANK_THRESHOLDS;
}

jest.mock('../../config/gacha', () => ({
  ...jest.requireActual<object>('../../config/gacha'),
  getGachaConfig: () => mockActive.config,
  getRankThresholds: () => mockActive.thresholds,
}));

// Controls whether the settings mock's write half succeeds, so the toggle's
// revert-on-failure path can be exercised. Prefixed `mock` for the same hoisting
// reason as `mockActive` above.
const mockSettings = { saveShouldFail: false };

jest.mock('../../services/settings', () => ({
  getShowRankBorders: async () => true,
  setShowRankBorders: async () => {
    if (mockSettings.saveShouldFail) {
      throw new Error('database is locked');
    }
  },
}));

// The screen reads the rank count through MAX_RANK, LORE_RANKS, BORDER_RANK and
// ART_RANK for its prose, so pinning each down the same way as the config is the only
// way to prove none of them is retyped. MAX_RANK is the ladder top; ART_RANK is
// deliberately a separate constant (see src/services/collection/rank.ts) so a future
// rank widening cannot silently move the alternate artwork — the mock keeps them
// independently overridable to prove the screen actually tracks each one on its own.
// The screen calls none of rankFor/copiesToNextRank/unlockedLore, so mocking the whole
// module is safe. Prefixed `mock` for the same hoisting reason as the holders above.
const mockRank: { maxRank: number; loreRanks: number; borderRank: number; artRank: number } =
  RANK_CONSTANTS_REAL();

function RANK_CONSTANTS_REAL(): {
  maxRank: number;
  loreRanks: number;
  borderRank: number;
  artRank: number;
} {
  const actual = jest.requireActual<typeof import('../../services/collection/rank')>(
    '../../services/collection/rank',
  );
  return {
    maxRank: actual.MAX_RANK,
    loreRanks: actual.LORE_RANKS,
    borderRank: actual.BORDER_RANK,
    artRank: actual.ART_RANK,
  };
}

// A plain object-spread with a getter is transpiled through Object.assign, which reads
// (and would prematurely invoke) the getter immediately rather than leaving it lazy.
// Object.defineProperty keeps it a true accessor, evaluated on each future read instead
// of once at mock-construction time, before `mockRank` below even exists.
jest.mock('../../services/collection/rank', () => {
  const mocked: Record<string, unknown> = {
    ...jest.requireActual<object>('../../services/collection/rank'),
  };
  Object.defineProperty(mocked, 'MAX_RANK', {
    enumerable: true,
    get: () => mockRank.maxRank,
  });
  Object.defineProperty(mocked, 'LORE_RANKS', {
    enumerable: true,
    get: () => mockRank.loreRanks,
  });
  Object.defineProperty(mocked, 'BORDER_RANK', {
    enumerable: true,
    get: () => mockRank.borderRank,
  });
  Object.defineProperty(mocked, 'ART_RANK', {
    enumerable: true,
    get: () => mockRank.artRank,
  });
  return mocked;
});

beforeEach(() => {
  mockActive.config = GACHA_CONFIG_REAL();
  mockActive.thresholds = RANK_THRESHOLDS_REAL();
  Object.assign(mockRank, RANK_CONSTANTS_REAL());
  mockSettings.saveShouldFail = false;
});

describe('formatPercent', () => {
  it('renders a rate as a percentage', () => {
    expect(formatPercent(0.005)).toBe('0.5%');
    expect(formatPercent(0.25)).toBe('25%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0)).toBe('0%');
  });

  it('does not leak binary floating point noise', () => {
    // 0.15 * 100 is 15.000000000000002, and 1 - 0.005 - 0.15 is 0.8450000000000001.
    expect(formatPercent(0.15)).toBe('15%');
    expect(formatPercent(1 - 0.005 - 0.15)).toBe('84.5%');
  });
});

describe('How it works screen, on the production economy', () => {
  it('states the real pull rates', async () => {
    const text = textContent(await renderAndSettle(<HowItWorksScreen />));

    expect(text).toContain('0.5%');
    expect(text).toContain('15%');
    expect(text).toContain('84.5%');
  });

  it('states the pity guarantee and the daily cap', async () => {
    const text = textContent(await renderAndSettle(<HowItWorksScreen />));

    expect(text).toContain('60 summons');
    expect(text).toContain('5 tickets');
  });
});

// The reason this screen exists at all. Every number must be read from the config at
// runtime, so a config the app has never shipped must still render correctly. If any of
// these fail, a number has been retyped into the copy.
describe('How it works screen tracks the config rather than hard-coding it', () => {
  const invented: GachaConfig = {
    fiveStarRate: 0.07,
    fourStarRate: 0.23,
    pityThreshold: 33,
    dailyTicketCap: 9,
  };

  beforeEach(() => {
    mockActive.config = invented;
  });

  it('renders the invented rates and none of the real ones', async () => {
    const text = textContent(await renderAndSettle(<HowItWorksScreen />));

    expect(text).toContain('7%');
    expect(text).toContain('23%');
    expect(text).not.toContain('0.5%');
    expect(text).not.toContain('84.5%');
  });

  it('derives the 3★ rate rather than reading a field that does not exist', async () => {
    const text = textContent(await renderAndSettle(<HowItWorksScreen />));

    // 1 - 0.07 - 0.23, which no field in GachaConfig holds.
    expect(text).toContain('70%');
  });

  it('renders the invented pity threshold and daily cap', async () => {
    const text = textContent(await renderAndSettle(<HowItWorksScreen />));

    expect(text).toContain('33 summons');
    expect(text).toContain('9 tickets');
    expect(text).not.toContain('60 summons');
  });

  it('counts the guarantee from the threshold, matching rollOne', async () => {
    const text = textContent(await renderAndSettle(<HowItWorksScreen />));

    // rollOne fires the guarantee when the incoming pity is one below the threshold,
    // so it is the 33rd summon that is guaranteed after 32 without a 5★.
    expect(text).toContain('32 summons in a row');
  });
});

// `__DEV__` is a React Native global with no setter, so the banner can only be exercised
// by writing it on globalThis directly. Cast through `unknown` because the ambient type
// does not declare it.
const devFlag = globalThis as unknown as { __DEV__: boolean };

describe('How it works screen dev-rate banner', () => {
  const realDev = __DEV__;

  afterEach(() => {
    devFlag.__DEV__ = realDev;
  });

  it('warns that a dev build is not the real economy', async () => {
    devFlag.__DEV__ = true;

    expect(textContent(await renderAndSettle(<HowItWorksScreen />))).toContain('Development rates');
  });

  it('shows no banner in a production build', async () => {
    devFlag.__DEV__ = false;

    expect(textContent(await renderAndSettle(<HowItWorksScreen />))).not.toContain(
      'Development rates',
    );
  });
});

describe('the rank border toggle', () => {
  function findSwitch(renderer: Awaited<ReturnType<typeof renderAndSettle>>) {
    return renderer.root.findByProps({ accessibilityLabel: 'Show rank borders' });
  }

  it('leaves the switch off when the save succeeds', async () => {
    const renderer = await renderAndSettle(<HowItWorksScreen />);

    act(() => {
      findSwitch(renderer).props.onValueChange(false);
    });
    await settle();

    expect(findSwitch(renderer).props.value).toBe(false);
  });

  it('reverts the switch when saving the setting fails', async () => {
    mockSettings.saveShouldFail = true;
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const renderer = await renderAndSettle(<HowItWorksScreen />);

    act(() => {
      findSwitch(renderer).props.onValueChange(false);
    });
    await settle();

    expect(findSwitch(renderer).props.value).toBe(true);

    error.mockRestore();
  });
});

describe('the ranks section', () => {
  it('explains what duplicates are for', async () => {
    const text = textContent(await renderAndSettle(<HowItWorksScreen />));

    expect(text).toContain('Duplicates');
    expect(text).toContain('Rank 5');
  });

  it('reads the thresholds from the config rather than hard-coding them', async () => {
    mockActive.thresholds = {
      3: [4, 9, 14, 19, 24],
      4: [3, 6, 9, 12, 15],
      5: [2, 5, 8, 11, 14],
    };

    const text = textContent(await renderAndSettle(<HowItWorksScreen />));

    // The invented 3★ ladder, and none of the real one.
    expect(text).toContain('24');
    expect(text).toContain('14');
    expect(text).not.toContain('40');
    expect(text).not.toContain('25');
  });

  it('reads the ladder-top rank count from MAX_RANK rather than hard-coding it', async () => {
    mockRank.maxRank = 7;

    const text = textContent(await renderAndSettle(<HowItWorksScreen />));

    expect(text).toContain('up to Rank 7');
  });

  // Regression coverage for the MAX_RANK/ART_RANK split: widening the ladder (a future
  // rank 6+) must not silently move the alternate artwork or strand it behind an
  // unreachable rank. See src/services/collection/rank.ts.
  it('reads the artwork rank from ART_RANK independently of MAX_RANK', async () => {
    mockRank.maxRank = 7;
    mockRank.artRank = 6;

    const text = textContent(await renderAndSettle(<HowItWorksScreen />));

    expect(text).toContain('up to Rank 7');
    expect(text).toContain('Rank 6 unlocks alternate artwork');
    expect(text).not.toContain('Rank 7 unlocks alternate artwork');
  });

  it('reads the border rank from BORDER_RANK and the lore count from LORE_RANKS', async () => {
    mockRank.borderRank = 6;
    mockRank.loreRanks = 4;

    const text = textContent(await renderAndSettle(<HowItWorksScreen />));

    expect(text).toContain('Ranks 1 to 4 each reveal something about them');
    expect(text).toContain('Rank 6 unlocks a border');
  });
});
