import { act } from 'react-test-renderer';
import { DevPanel } from '../DevPanel';
import { press, render, settle, textContent } from '../../test-utils/render';

const mockDev = {
  granted: [] as number[],
  collectionResets: 0,
  pityResets: 0,
  shouldFail: false,
};

jest.mock('../../services/dev', () => ({
  grantTickets: async (amount: number) => {
    if (mockDev.shouldFail) {
      throw new Error('database is locked');
    }
    mockDev.granted.push(amount);
  },
  resetCollection: async () => {
    mockDev.collectionResets += 1;
  },
  resetPity: async () => {
    mockDev.pityResets += 1;
  },
}));

beforeEach(() => {
  mockDev.granted = [];
  mockDev.collectionResets = 0;
  mockDev.pityResets = 0;
  mockDev.shouldFail = false;
  jest.useRealTimers();
});

describe('granting tickets', () => {
  it('grants immediately, with no confirmation — it is not destructive', async () => {
    const renderer = render(<DevPanel />);

    await press(renderer, 'Grant 10 tickets');

    expect(mockDev.granted).toEqual([10]);
  });

  it('offers a larger grant for volume testing', async () => {
    const renderer = render(<DevPanel />);

    await press(renderer, 'Grant 50 tickets');

    expect(mockDev.granted).toEqual([50]);
  });

  it('says what it did', async () => {
    const renderer = render(<DevPanel />);

    await press(renderer, 'Grant 10 tickets');

    expect(textContent(renderer)).toContain('Granted 10');
  });

  it('reports a failure instead of claiming success', async () => {
    mockDev.shouldFail = true;
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const renderer = render(<DevPanel />);

    await press(renderer, 'Grant 10 tickets');

    expect(textContent(renderer)).toContain('failed');
    expect(textContent(renderer)).not.toContain('Granted');

    error.mockRestore();
  });
});

// The whole point of the confirm: these wipe data, and they sit on a screen you open to
// read the rules. One stray tap must not cost a test session.
describe('destructive actions need two taps', () => {
  it('does not reset the collection on the first tap', async () => {
    const renderer = render(<DevPanel />);

    await press(renderer, 'Reset collection');

    expect(mockDev.collectionResets).toBe(0);
    expect(textContent(renderer)).toContain('Tap again to confirm');
  });

  it('resets the collection on the second tap', async () => {
    const renderer = render(<DevPanel />);

    await press(renderer, 'Reset collection');
    await press(renderer, 'Reset collection');

    expect(mockDev.collectionResets).toBe(1);
  });

  it('does not reset the pity counter on the first tap', async () => {
    const renderer = render(<DevPanel />);

    await press(renderer, 'Reset pity counter');

    expect(mockDev.pityResets).toBe(0);
  });

  it('resets the pity counter on the second tap', async () => {
    const renderer = render(<DevPanel />);

    await press(renderer, 'Reset pity counter');
    await press(renderer, 'Reset pity counter');

    expect(mockDev.pityResets).toBe(1);
  });

  // Arming one destructive button must not arm the other, or a confirm tap aimed at one
  // could fire the wrong wipe.
  it('arming one destructive action does not arm the other', async () => {
    const renderer = render(<DevPanel />);

    await press(renderer, 'Reset collection');
    await press(renderer, 'Reset pity counter');

    expect(mockDev.collectionResets).toBe(0);
    expect(mockDev.pityResets).toBe(0);
  });

  it('disarms itself after the confirmation window passes', async () => {
    jest.useFakeTimers();
    const renderer = render(<DevPanel />);

    await press(renderer, 'Reset collection');
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    await settle();

    expect(textContent(renderer)).not.toContain('Tap again to confirm');

    await press(renderer, 'Reset collection');
    expect(mockDev.collectionResets).toBe(0);

    jest.useRealTimers();
  });
});
