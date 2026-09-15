import { getShowRankBorders, getSetting, setSetting, setShowRankBorders } from '../index';

type Row = { key: string; value: string };

const rows: Row[] = [];

// The write queue and expo-sqlite are not available under jest, so the db module is
// faked at the seam the service actually uses. `withWriteTransaction` hands the callback
// a `txn` exactly as the real one does.
//
// Named `mockTxn` rather than `txn`: babel-plugin-jest-hoist forbids a jest.mock()
// factory from closing over an out-of-scope variable unless its name is prefixed
// `mock` (case-insensitive) — a plain `txn` fails to even parse.
const mockTxn = {
  runAsync: async (_sql: string, key: string, value: string) => {
    const existing = rows.find((row) => row.key === key);
    if (existing) {
      existing.value = value;
    } else {
      rows.push({ key, value });
    }
  },
};

jest.mock('../../db', () => ({
  getDatabase: () => ({
    getFirstAsync: async (_sql: string, key: string) => rows.find((row) => row.key === key) ?? null,
  }),
  withWriteTransaction: (task: (handle: typeof mockTxn) => Promise<unknown>) => task(mockTxn),
}));

beforeEach(() => {
  rows.length = 0;
});

describe('settings', () => {
  it('returns null for a key that was never written', async () => {
    await expect(getSetting('nothing_here')).resolves.toBeNull();
  });

  it('reads back what it wrote', async () => {
    await setSetting('colour', 'blue');
    await expect(getSetting('colour')).resolves.toBe('blue');
  });

  it('overwrites rather than duplicating a key', async () => {
    await setSetting('colour', 'blue');
    await setSetting('colour', 'green');

    await expect(getSetting('colour')).resolves.toBe('green');
    expect(rows).toHaveLength(1);
  });
});

describe('the rank border flag', () => {
  // Default-on matters: an existing player upgrading into this feature has no row, and
  // hiding a reward they just earned would read as a bug.
  it('defaults to on when no row exists', async () => {
    await expect(getShowRankBorders()).resolves.toBe(true);
  });

  it('round-trips off and back on', async () => {
    await setShowRankBorders(false);
    await expect(getShowRankBorders()).resolves.toBe(false);

    await setShowRankBorders(true);
    await expect(getShowRankBorders()).resolves.toBe(true);
  });
});
