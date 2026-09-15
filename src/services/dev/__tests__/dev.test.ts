import { grantTickets, resetCollection, resetPity } from '../index';

type Call = { sql: string; args: unknown[] };

const mockCalls: Call[] = [];

// The db module is faked at the same seam every other service test uses — expo-sqlite
// cannot run under jest. `withWriteTransaction` hands the callback a `txn` exactly as the
// real one does, so what we assert on is the SQL each function actually issues.
jest.mock('../../db', () => ({
  withWriteTransaction: (task: (txn: unknown) => Promise<unknown>) =>
    task({
      runAsync: async (sql: string, ...args: unknown[]) => {
        mockCalls.push({ sql, args });
      },
    }),
}));

const realDev = __DEV__;
const devFlag = globalThis as unknown as { __DEV__: boolean };

beforeEach(() => {
  mockCalls.length = 0;
  devFlag.__DEV__ = true;
});

afterEach(() => {
  devFlag.__DEV__ = realDev;
});

describe('grantTickets', () => {
  it('writes a positive ledger row for the amount asked for', async () => {
    await grantTickets(10);

    expect(mockCalls).toHaveLength(1);
    expect(mockCalls[0].sql).toContain('INSERT INTO ticket_ledger');
    expect(mockCalls[0].args[0]).toBe(10);
  });

  it('labels the row so it is identifiable in the ledger', async () => {
    await grantTickets(10);

    expect(mockCalls[0].args[1]).toBe('dev_grant');
  });

  // The subtle one, and the reason this function exists rather than calling awardTickets.
  // awardTickets sums positive rows for TODAY to enforce the daily cap. A dev grant dated
  // today would eat that cap and stop real habit completions paying out — corrupting the
  // exact behaviour you granted the tickets to test. The sentinel date keeps the grant out
  // of every day's cap while still counting toward the balance, which sums the whole ledger.
  it('dates the row outside any real day, so it can never consume a daily cap', async () => {
    await grantTickets(50);

    expect(mockCalls[0].args[2]).toBe('1970-01-01');
    expect(mockCalls[0].args[2]).not.toBe(new Date().toISOString().slice(0, 10));
  });

  it('refuses an amount that is not a positive whole number', async () => {
    await expect(grantTickets(0)).rejects.toThrow();
    await expect(grantTickets(-5)).rejects.toThrow();
    await expect(grantTickets(1.5)).rejects.toThrow();

    expect(mockCalls).toHaveLength(0);
  });
});

describe('resetCollection', () => {
  it('clears every owned character', async () => {
    await resetCollection();

    expect(mockCalls).toHaveLength(1);
    expect(mockCalls[0].sql).toContain('DELETE FROM owned_characters');
  });

  it('leaves the ticket ledger alone', async () => {
    await resetCollection();

    expect(mockCalls[0].sql).not.toContain('ticket_ledger');
  });
});

describe('resetPity', () => {
  it('puts the pity counter back to zero on the single player_state row', async () => {
    await resetPity();

    expect(mockCalls).toHaveLength(1);
    expect(mockCalls[0].sql).toContain('UPDATE player_state');
    expect(mockCalls[0].sql).toContain('pity_counter = 0');
    expect(mockCalls[0].sql).toContain('WHERE id = 1');
  });
});

// The load-bearing guarantee. The UI gate is one misplaced edit away from failing open,
// so the service itself must refuse rather than trusting its caller.
describe('production safety', () => {
  beforeEach(() => {
    devFlag.__DEV__ = false;
  });

  it('refuses every operation outside a dev build, and writes nothing', async () => {
    await expect(grantTickets(10)).rejects.toThrow(/production/i);
    await expect(resetCollection()).rejects.toThrow(/production/i);
    await expect(resetPity()).rejects.toThrow(/production/i);

    expect(mockCalls).toHaveLength(0);
  });
});
