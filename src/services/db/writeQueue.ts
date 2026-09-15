// In-process serialisation for database writes.
//
// Why this exists, measured rather than assumed:
//
// `withExclusiveTransactionAsync` does not serialise callers. It opens a *new
// connection* per call and issues a plain DEFERRED `BEGIN`
// (expo-sqlite/build/SQLiteDatabase.js:155-176). Every read-then-write service in this
// project therefore takes a read snapshot, then tries to upgrade to a write. If any
// other connection committed in between, the upgrade fails with SQLITE_BUSY_SNAPSHOT.
//
// `PRAGMA busy_timeout` does NOT help with that. SQLite deliberately skips the busy
// handler for a stale snapshot, because waiting could never make the upgrade succeed —
// measured at 0ms to failure with and without the pragma. Retrying only works if the
// whole transaction is rolled back and the snapshot retaken, which is what the retry
// below does. `busy_timeout` is still set on the main connection in `./index.ts`,
// where it does help: plain write-lock contention with no open snapshot.
//
// So the fix is two-layered:
//   1. This queue, which makes the conflict impossible between our own callers. The
//      app is one process with one JS thread, so a promise chain is a real mutex.
//   2. The retry, for anything that still slips through — a bare `db.runAsync` write
//      outside the queue, or a future second process.

export type WriteQueueOptions = {
  /** Retries after the first attempt. Default 3. */
  retries?: number;
  /** First backoff, doubled each attempt. Default 25ms. */
  baseDelayMs?: number;
  /** Injectable for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for tests; defaults to random jitter up to baseDelayMs. */
  jitter?: () => number;
};

export type WriteQueue = <T>(task: () => Promise<T>) => Promise<T>;

// Deliberately not a bare `busy`: this project uses "busy" as a domain word (a summon
// in progress, a tap arriving while a write is in flight), and a message merely
// containing it must not get silently retried three times with backoff.
// `SQLITE_BUSY` already covers `SQLITE_BUSY_SNAPSHOT` by prefix.
const BUSY_PATTERN = /SQLITE_BUSY|database (?:table )?is locked|database is busy/i;

export function isBusyError(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false;
  }
  if (typeof error === 'string') {
    return BUSY_PATTERN.test(error);
  }
  if (typeof error === 'object') {
    const { message, code } = error as { message?: unknown; code?: unknown };
    if (typeof code === 'string' && BUSY_PATTERN.test(code)) {
      return true;
    }
    if (typeof message === 'string' && BUSY_PATTERN.test(message)) {
      return true;
    }
  }
  return false;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createWriteQueue(options: WriteQueueOptions = {}): WriteQueue {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 25;
  const sleep = options.sleep ?? defaultSleep;
  const jitter = options.jitter ?? (() => Math.random() * baseDelayMs);

  // The tail of the chain. Each task is appended to it, so exactly one runs at a time.
  let tail: Promise<unknown> = Promise.resolve();

  async function runWithRetry<T>(task: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await task();
      } catch (error) {
        // A non-lock failure is the caller's problem, not something to paper over by
        // running their write again.
        if (attempt >= retries || !isBusyError(error)) {
          throw error;
        }
        await sleep(baseDelayMs * 2 ** attempt + jitter());
      }
    }
  }

  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(() => runWithRetry(task));
    // The chain swallows failures on its own copy only, so one rejected write does not
    // poison every write after it. The caller still sees the rejection through `run`.
    tail = run.catch(() => undefined);
    return run;
  };
}
