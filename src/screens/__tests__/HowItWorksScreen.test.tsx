import { HowItWorksScreen, formatPercent } from '../HowItWorksScreen';
import { render, textContent } from '../../test-utils/render';
import type { GachaConfig } from '../../types';

// The screen reads its numbers through getGachaConfig(), so swapping that out is the
// only way to pin them down. Everything else in the module is re-exported untouched.
// The name has to start with `mock` or babel refuses to hoist the factory above the
// imports, and the mock never takes effect.
const mockActive: { config: GachaConfig } = { config: GACHA_CONFIG_REAL() };

function GACHA_CONFIG_REAL(): GachaConfig {
  return jest.requireActual<typeof import('../../config/gacha')>('../../config/gacha').GACHA_CONFIG;
}

jest.mock('../../config/gacha', () => ({
  ...jest.requireActual<object>('../../config/gacha'),
  getGachaConfig: () => mockActive.config,
}));

beforeEach(() => {
  mockActive.config = GACHA_CONFIG_REAL();
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
  it('states the real pull rates', () => {
    const text = textContent(render(<HowItWorksScreen />));

    expect(text).toContain('0.5%');
    expect(text).toContain('15%');
    expect(text).toContain('84.5%');
  });

  it('states the pity guarantee and the daily cap', () => {
    const text = textContent(render(<HowItWorksScreen />));

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

  it('renders the invented rates and none of the real ones', () => {
    const text = textContent(render(<HowItWorksScreen />));

    expect(text).toContain('7%');
    expect(text).toContain('23%');
    expect(text).not.toContain('0.5%');
    expect(text).not.toContain('84.5%');
  });

  it('derives the 3★ rate rather than reading a field that does not exist', () => {
    const text = textContent(render(<HowItWorksScreen />));

    // 1 - 0.07 - 0.23, which no field in GachaConfig holds.
    expect(text).toContain('70%');
  });

  it('renders the invented pity threshold and daily cap', () => {
    const text = textContent(render(<HowItWorksScreen />));

    expect(text).toContain('33 summons');
    expect(text).toContain('9 tickets');
    expect(text).not.toContain('60 summons');
  });

  it('counts the guarantee from the threshold, matching rollOne', () => {
    const text = textContent(render(<HowItWorksScreen />));

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

  it('warns that a dev build is not the real economy', () => {
    devFlag.__DEV__ = true;

    expect(textContent(render(<HowItWorksScreen />))).toContain('Development rates');
  });

  it('shows no banner in a production build', () => {
    devFlag.__DEV__ = false;

    expect(textContent(render(<HowItWorksScreen />))).not.toContain('Development rates');
  });
});
