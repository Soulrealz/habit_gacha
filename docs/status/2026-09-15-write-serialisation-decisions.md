# Write serialisation — decisions taken while fixing the lock conflict

Date: 2026-09-15. Taking up the `busy_timeout` item that
`docs/status/OPEN-ITEMS.md` had flagged red since the habits vertical landed.

**Headline: the fix that item prescribed does not work.** It was a reasonable
inference from Expo's own wording, but it had never been measured. Measuring it first
is what this change is mostly about.

---

## 1. Why `PRAGMA busy_timeout = 5000` was the wrong fix

The open item said the durable fix was one line next to `journal_mode = WAL` in
`initDatabase()`. Two independent reasons it would not have worked, both measured
against real SQLite (Node 22's `node:sqlite`, same engine family as the one
expo-sqlite vendors — 3.50.3):

**Reason 1 — it does not apply to the read-then-write upgrade, which is the only
pattern this app uses.** `withExclusiveTransactionAsync` issues a _deferred_ `BEGIN`,
so a transaction takes a read snapshot at its `SELECT` and only then tries to upgrade
to a write. If another connection committed in between, SQLite returns
`SQLITE_BUSY_SNAPSHOT` and **deliberately does not invoke the busy handler** — waiting
could never make a stale snapshot valid. Measured:

| Scenario                                           | Result                                   |
| -------------------------------------------------- | ---------------------------------------- |
| read-then-write upgrade, no `busy_timeout`         | fails in **0 ms** — "database is locked" |
| read-then-write upgrade, `busy_timeout = 5000`     | fails in **0 ms** — identical            |
| plain write-lock contention, no `busy_timeout`     | fails in 3 ms                            |
| plain write-lock contention, `busy_timeout = 2000` | waits **2258 ms**, then fails            |

The pragma works exactly as documented. It just does not apply to our case.

**Reason 2 — it is per-connection, and it would never have reached the transactions.**
`Transaction.createAsync` (`expo-sqlite/build/SQLiteDatabase.js:561`) builds each
transaction's connection with `{...db.options, useNewConnection: true}` and calls
`initAsync()` on it. No pragmas are replayed. `journal_mode = WAL` survives only
because it is persisted in the database file; `busy_timeout` is a runtime setting on
one connection and is not. So setting it in `initDatabase()` configures the one handle
that never runs a transaction.

## 2. What the bug was actually costing

A probe reproducing the app's exact shape — fresh connection per transaction, deferred
`BEGIN`, read, then write — running 8 concurrent `awardTickets`-style calls against a
daily cap of 5:

|        | calls that threw | final balance |
| ------ | ---------------- | ------------- |
| Before | **7 of 8**       | **1**         |
| After  | 0 of 8           | **5** ✅      |

That is the rapid-tap case from walkthrough step 8, and it was not a rare edge: with
overlapping calls it was the normal outcome.

## 3. The fix chosen

| Option                                                                | Pros                                                                                                                                                                                                                                            | Cons                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **In-process write queue in the foundation + bounded retry (chosen)** | Makes the conflict _impossible_ between our own callers rather than recovering from it — one process, one JS thread, so a promise chain is a real mutex. One rule, one place, covers both verticals and anything added later. Measured to work. | A global mutex means one slow write blocks every other write. Acceptable here: writes are single-row and local. Introduces a deadlock risk if a queued task ever awaits the queue (checked; none does).                        |
| `busy_timeout` alone                                                  | One line.                                                                                                                                                                                                                                       | Does not work — §1.                                                                                                                                                                                                            |
| Retry-on-busy with no queue                                           | Simpler; no global serialisation.                                                                                                                                                                                                               | Recovers from a collision instead of preventing it, so every write path needs to tolerate being run twice, and contention still costs real latency under rapid taps.                                                           |
| Keep per-module JS queues (the habits vertical's approach)            | No foundation change; no shared-file conversation needed.                                                                                                                                                                                       | Cannot serialise across modules, which is the case that actually matters — a habit tap racing a summon. Requires every new module to remember to do it.                                                                        |
| `BEGIN IMMEDIATE` instead of deferred                                 | The textbook fix — takes the write lock up front, and `busy_timeout` then applies.                                                                                                                                                              | Not reachable. `withExclusiveTransactionAsync` hardcodes `BEGIN`, and hand-rolling it would mean giving up expo's transaction handling and running on the shared connection, which is the banned `withTransactionAsync` shape. |

**Taken: the queue, plus the retry as a second layer, plus `busy_timeout` on the main
connection** for the one case it genuinely helps (a bare non-transactional query
waiting on a write lock — row 4 of the table in §1).

The retry only fires for lock errors, and only on transactions expo has already rolled
back, so nothing double-applies. A non-lock failure — a constraint violation, a missing
table — is rethrown on the first attempt rather than papered over by running the
caller's write again.

## 4. What changed

- **New** `src/services/db/writeQueue.ts` — `createWriteQueue()` (promise-chain mutex +
  exponential backoff with jitter) and `isBusyError()`. Both pure and injectable, so
  the retry and serialisation behaviour is unit-tested without the native module:
  11 tests.
- **`src/services/db/index.ts`** — exports `withWriteTransaction(task, handle?)`. The
  optional `handle` exists only for the migration runner, which runs before
  `getDatabase()` will answer.
- **All five write sites migrated**: `awardTickets`, `spendTicket`, `adjustHabitCount`,
  `recordCharacter`, `writePity`. `writePity` was a bare `db.runAsync` and is now
  queued too — it is atomic on its own, but queueing it removes the last write that
  could contend for the lock.
- **The migration runner is queued**, so a transient lock cannot fail the one write in
  the app that would brick startup.
- **The habits vertical's local JS queue was removed.** It is subsumed, and it never
  covered the cross-module case.
- **`CLAUDE.md`'s database rule was rewritten.** It said to use
  `withExclusiveTransactionAsync`; it now says `withWriteTransaction` and explicitly
  bans calling either expo transaction helper directly.

## 5. Judgement calls inside the fix

- **Retry budget: 3 retries, 25 ms base, doubling, with jitter.** Worst case about
  350 ms before giving up — long enough to ride out a contended write, short enough
  that a genuinely stuck database still surfaces an error rather than hanging the UI.
  Not derived from anything; revise it once there is device evidence.
- **`busy_timeout = 5000`** on the main connection. Generous, because the only thing it
  can delay is a non-transactional read or write that would otherwise fail outright.
- **A failed write does not poison the queue.** The chain keeps its own swallowed copy
  of each result, so one rejected write does not stop every later one; the caller still
  sees its own rejection.
- **The queue is not exported.** Callers get `withWriteTransaction`, not the raw queue,
  so there is no way to enqueue something that is not a transaction.

## 6. Hardening added after review

- **A stale `spent` could survive a retry.** `spendTicket` assigned `spent = true` only
  on its success branch, but the queue re-runs the _same closure_ on a retry — so an
  aborted attempt that had already set the flag could leave it `true` while the retry
  committed nothing, handing out a summon with no debit in the ledger. Latent rather
  than live (the rollback restores the balance, and nothing else writes in-process), but
  it is one line: `spent` is now recomputed on every attempt. The other four call sites
  were checked for the same shape and all assign unconditionally.
- **A nested write would have hung forever.** The queue is process-global, so the
  re-entrancy rule is no longer "don't call this module from its own callback" but
  "don't start _any_ write from inside _any_ write callback". Nothing violates it today,
  but a violation would wait on a slot that can only free when the outer task returns —
  no timeout, nothing in the logs. `withWriteTransaction` now rejects loudly instead.
- **expo can destroy the error the retry needs to see.** Its `ROLLBACK` is not guarded,
  so if `BEGIN` was what failed, the `ROLLBACK` throws first and replaces the original
  busy error with `no transaction is active` — which `isBusyError` does not recognise,
  so the retry silently never fires. That case is now translated back and logged.
- **`isBusyError` was too broad.** Its pattern had a bare `busy` alternative, and this
  project uses "busy" as a domain word (`SummonOutcome`'s `busy` status, `TodayScreen`'s
  tap guard). A message merely containing it would have been retried three times with
  backoff. Tightened, with a test that pins it.
- **Tests for the wiring, not just the queue.** `withWriteTransaction` itself had none:
  14 new tests now cover the handle parameter, `txn` versus `db`, result propagation,
  the nested guard, the rollback translation, that a retry re-runs the task from the top
  and discards the failed attempt, and — as a permanent regression test — the 8
  concurrent awards against a cap of 5 from §2, asserting the balance lands on 5 and no
  two tasks ever overlap.

One review suggestion was **not** taken: falling back to `await initDatabase()` when no
handle is passed. It reads like useful hardening but introduces a real deadlock — a task
enqueued while migrations are still running would wait on `initPromise`, which cannot
resolve until a later migration gets the queue slot sitting behind that very task. A
loud throw is better than a silent hang, and `App.tsx` already gates every screen behind
init. The reasoning is recorded in a comment at the call site.

## 7. Not done

- **The spec is now wrong and was left alone.** `core-loop-design.md` §concurrency says
  a second concurrent caller "reads 0 and returns false". It never did — it threw, and
  now it queues. Correcting the authoritative spec felt like it deserves its own pass
  rather than a drive-by edit; `OPEN-ITEMS.md` records the discrepancy.
- **The gacha vertical's `performSummon` still spends, rolls, and persists across three
  separate queued writes** rather than one. Collapsing them would need `spendTicket` to
  become a callback-taking variant, which is a wider refactor of the ticket seam that
  both verticals depend on. The persistence order there was already arranged so the
  residual window fails in the player's favour — see
  `2026-09-15-gacha-vertical-decisions.md` §1.

---

## Verified, and not

Verified on this machine:

- `npx jest` — **89/89 passing**, 9 suites (25 new: 11 for the write queue, 14 for
  `withWriteTransaction` itself).
- `npx tsc --noEmit` — clean. `npx expo lint` — clean, exit 0.
- Both measurement tables above, run against real SQLite in WAL mode.
- `grep` confirms no `withExclusiveTransactionAsync` or `withTransactionAsync` call
  remains anywhere in `src/` outside `src/services/db/` — only comments referencing them.

**Not verified — still nobody has run this app.** The queue, the retry, and the pragma
have never executed against the native module. The probes model expo's behaviour
faithfully but they are not expo. Walkthrough step 8 (rapid taps with one ticket) and
item 4 of the unconfirmed list remain the real gate.
