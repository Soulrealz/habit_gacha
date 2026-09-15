import { createWriteQueue, isBusyError } from '../writeQueue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const busy = () => new Error('Call to function ... failed: database is locked');

describe('isBusyError', () => {
  it('recognises the message expo surfaces for a lock conflict', () => {
    expect(isBusyError(busy())).toBe(true);
  });

  it('recognises the raw SQLite code spellings', () => {
    expect(isBusyError(new Error('SQLITE_BUSY'))).toBe(true);
    expect(isBusyError(new Error('SQLITE_BUSY_SNAPSHOT: snapshot is stale'))).toBe(true);
    expect(isBusyError({ code: 'SQLITE_BUSY' })).toBe(true);
  });

  it('reads a plain object with a message, which is how some natives surface errors', () => {
    expect(isBusyError({ message: 'database is locked' })).toBe(true);
    expect(isBusyError({ message: 'no such column: foo' })).toBe(false);
  });

  it('matches a bare string error', () => {
    expect(isBusyError('database is locked')).toBe(true);
  });

  it('does not treat unrelated failures as retryable', () => {
    expect(isBusyError(new Error('no such table: habit_logs'))).toBe(false);
    expect(isBusyError(new Error('UNIQUE constraint failed'))).toBe(false);
    expect(isBusyError(null)).toBe(false);
    expect(isBusyError(undefined)).toBe(false);
    expect(isBusyError({})).toBe(false);
    expect(isBusyError({ code: 42 })).toBe(false);
  });

  it('does not retry on this project’s own use of the word "busy"', () => {
    // SummonOutcome has a `busy` status and TodayScreen has a `busy` tap guard, so a
    // bare /busy/ pattern here would retry unrelated failures three times over.
    expect(isBusyError(new Error('Summon busy'))).toBe(false);
    expect(isBusyError(new Error('Already summoning'))).toBe(false);
  });
});

describe('createWriteQueue serialisation', () => {
  it('runs one task at a time, in the order submitted', async () => {
    const queue = createWriteQueue({ sleep: async () => undefined });
    const order: string[] = [];
    const first = deferred<void>();

    const a = queue(async () => {
      order.push('a:start');
      await first.promise;
      order.push('a:end');
      return 'a';
    });
    const b = queue(async () => {
      order.push('b:start');
      return 'b';
    });

    // b must not have started while a is still awaiting.
    await Promise.resolve();
    expect(order).toEqual(['a:start']);

    first.resolve();
    await expect(a).resolves.toBe('a');
    await expect(b).resolves.toBe('b');
    expect(order).toEqual(['a:start', 'a:end', 'b:start']);
  });

  it('keeps running later tasks after one fails', async () => {
    const queue = createWriteQueue({ retries: 0, sleep: async () => undefined });

    const failed = queue(async () => {
      throw new Error('no such table: habit_logs');
    });
    const after = queue(async () => 'still works');

    await expect(failed).rejects.toThrow('no such table');
    await expect(after).resolves.toBe('still works');
  });

  it('returns the task result to its own caller', async () => {
    const queue = createWriteQueue({ sleep: async () => undefined });
    await expect(queue(async () => 42)).resolves.toBe(42);
  });
});

describe('createWriteQueue retries', () => {
  it('retries a busy failure and returns the eventual success', async () => {
    const delays: number[] = [];
    const queue = createWriteQueue({
      retries: 3,
      baseDelayMs: 10,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    let attempts = 0;
    const result = await queue(async () => {
      attempts++;
      if (attempts < 3) {
        throw busy();
      }
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
    expect(delays).toHaveLength(2);
  });

  it('backs off for longer on each successive attempt', async () => {
    const delays: number[] = [];
    const queue = createWriteQueue({
      retries: 3,
      baseDelayMs: 10,
      jitter: () => 0,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    await expect(
      queue(async () => {
        throw busy();
      }),
    ).rejects.toThrow('database is locked');

    expect(delays).toEqual([10, 20, 40]);
  });

  it('gives up after the retry budget and rethrows the busy error', async () => {
    const queue = createWriteQueue({ retries: 2, baseDelayMs: 1, sleep: async () => undefined });
    let attempts = 0;

    await expect(
      queue(async () => {
        attempts++;
        throw busy();
      }),
    ).rejects.toThrow('database is locked');

    expect(attempts).toBe(3);
  });

  it('does not retry a failure that is not a lock conflict', async () => {
    const queue = createWriteQueue({ retries: 5, baseDelayMs: 1, sleep: async () => undefined });
    let attempts = 0;

    await expect(
      queue(async () => {
        attempts++;
        throw new Error('UNIQUE constraint failed');
      }),
    ).rejects.toThrow('UNIQUE constraint');

    expect(attempts).toBe(1);
  });

  it('never runs a retry concurrently with the next queued task', async () => {
    const running: string[] = [];
    const queue = createWriteQueue({ retries: 2, baseDelayMs: 1, sleep: async () => undefined });
    let attempts = 0;

    const a = queue(async () => {
      running.push('a');
      attempts++;
      if (attempts < 3) {
        throw busy();
      }
      return 'a';
    });
    const b = queue(async () => {
      running.push('b');
      return 'b';
    });

    await Promise.all([a, b]);
    // Every one of a's attempts must precede b.
    expect(running).toEqual(['a', 'a', 'a', 'b']);
  });
});
