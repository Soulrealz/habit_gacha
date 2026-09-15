# Daily Summoner

A gacha-style habit tracker. Completing gym habits earns summoning tickets; tickets buy
pulls for collectible characters. The habit work is the grind, the character pull is the
payoff.

Expo + React Native + TypeScript, fully local — SQLite on device, no backend, no account.

> ## ✅ The loop works on a real phone
>
> First run: 2026-09-15, a physical Android phone via Expo Go. Habit logging, ticket
> earning, the daily cap, summoning and duplicates were all confirmed by hand.
>
> Three things are still unconfirmed on device — cold-restart persistence, rapid-tap
> concurrency, and midnight rollover. See `docs/status/OPEN-ITEMS.md`, which is the file
> to read before trusting anything in `src/`.

## Quick start

```bash
npm install
npx expo start        # then press `a` for Android, or scan the QR with Expo Go
```

```bash
npx jest              # 139 tests
npx tsc --noEmit
npx expo lint
npx prettier --write .
```

Formatting is Prettier-owned — don't hand-format.

## What exists

| Area                                                                  | State                                |
| --------------------------------------------------------------------- | ------------------------------------ |
| Foundation — SQLite schema, migrations, ticket ledger, tab navigation | Merged; runs on device               |
| Habits — catalog, counter logging, ticket awards, Today screen        | Merged; runs on device               |
| Gacha — roll engine with pity, summon, collection, both screens       | Merged; runs on device               |
| Character art                                                         | Generated placeholders, not real art |
| Rewarded ads, streaks, non-gym habits, duplicate economy              | Deferred — v2 design                 |

## How it fits together

```
src/
  config/gacha.ts       every tunable number — rates, pity, daily cap
  lib/                  local-date helper and the date-change hook
  services/
    db/                 init, migrations, and the write queue
    tickets/            the seam both verticals share
    habits/             habit logging and the award rules
    gacha/              roll engine and summon
    collection/         owned characters
  data/                 static habit and character catalogs
  screens/              Today, Summon, Collection
```

Two rules carry most of the weight:

1. **Every tunable number lives in `src/config/gacha.ts`.** Never hard-code a rate, a
   pity threshold, or the daily cap.
2. **Every database write goes through `withWriteTransaction`.** Never call
   `db.withExclusiveTransactionAsync` or `db.withTransactionAsync` directly — neither
   serialises concurrent callers, and this app's read-then-write pattern fails with
   "database is locked" when two overlap. `src/services/db/writeQueue.ts` has the
   measurements.

The habits and gacha halves were built in parallel by two developers and deliberately
share no files except the ticket seam. Anything both need belongs in the foundation,
which means a conversation first rather than a unilateral edit.

## Where the detail lives

Start with `CLAUDE.md` (conventions) and `docs/status/OPEN-ITEMS.md` (what is unverified
right now — read it before trusting anything in `src/`).

- `docs/next-steps.md` — what to do next and why, in order
- `docs/architecture.md` — current state and open technical decisions
- `docs/decisions.md` — the decision log, newest first
- `docs/status/DEVICE-RUN-CHECKLIST.md` — the first-run script
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — designs and the plans built
  from them

## Contributing

`master` is trunk; never commit to it directly. Branch as `feat/<short-description>` or
`bug/<short-description>`, one feature or fix per branch, then PR. CI runs the typecheck,
lint, tests and an Android bundle on every PR.
