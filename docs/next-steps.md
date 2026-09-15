# Next steps

Written 2026-09-15, right after the app ran on a real phone for the first time. This is
the forward-looking plan: what to do next, in order, and why that order.

If you are starting cold, read this file and `docs/status/OPEN-ITEMS.md`. Between them
you have the whole picture.

---

## Where things stand in one paragraph

Daily Summoner is a gacha habit tracker: complete gym habits, earn summoning tickets,
spend tickets pulling collectible characters. Expo + React Native + TypeScript, fully
local on SQLite, no backend. **v1 is built and it works on a real device** — habit
logging, the 5/day ticket cap, summoning with a pity guarantee, duplicates, and a
collection screen. 150 tests pass, plus typecheck, lint, `expo-doctor` and an Android
bundle, and CI runs all of it on every PR.

v1's stated purpose was to prove one thing: **that the loop is satisfying.** The
machinery question is now answered. What is left is a design question — what the pulls
are actually _for_.

## The one thing to understand before touching the economy

**Expo Go runs `__DEV__`, so the app you have been playing is not the game.**

|                   | Dev (Expo Go) | Production |
| ----------------- | ------------- | ---------- |
| 5★ rate           | 25%           | 0.5%       |
| Pity guarantee    | pull 5        | pull 60    |
| Effective 5★ rate | **32.8%**     | **1.93%**  |
| Mean pulls per 5★ | **3.05**      | **51.95**  |

The daily cap is 5 tickets in both. In dev that means **every day ends in a guaranteed
5★** — pity fires on exactly the fifth pull. Pulling a 5★ in five pulls is not luck and
not a bug; it is certain.

This matters because judging whether the loop feels good from a dev build will mislead
you in both directions: rewards feel far too frequent, and the collection exhausts
immediately. To playtest the real economy, temporarily make `getGachaConfig()` in
`src/config/gacha.ts` return `GACHA_CONFIG` regardless of `__DEV__` — and revert before
committing, because the dev rates are what make the walkthrough in
`docs/status/DEVICE-RUN-CHECKLIST.md` completable in one sitting.

The production numbers were chosen deliberately after the maths was reviewed: ~52 pulls
per 5★ is 10–11 days at the cap. A faster 2%/pity-50 option was rejected for burning
through the roster. Do not tune them casually.

## Order of work, and why

### 1. Real character art — start now, runs in parallel

The nine sprites in `assets/characters/` are generated placeholders: each character's
initial on its rarity colour, from `scripts/generate-placeholder-sprites.mjs`.

This is the cheapest large win available. The whole premise is that the payoff moment
feels good, and right now the payoff is a letter on a coloured square.

**It costs no code.** Drop PNGs at the same paths — `aria_01.png`, `brin_01.png`,
`caul_01.png`, `dax_01.png`, `echo_01.png`, `fen_01.png`, `gale_01.png`, `hex_01.png`,
`iris_01.png` — and delete the generator script. Nothing imports it. Squares around
256×256 work with the current layout (160px on the summon reveal, 80px in the collection
grid).

Plan for a **much larger roster than nine** before generating in bulk. Nine characters
against a ~52-pull average means the collection completes in roughly a month and then the
loop has nowhere to go. Rarity split is currently 2 × 5★, 3 × 4★, 4 × 3★; adding
characters is a pure data change in `src/data/characters.ts` plus files, with no
migration. Decide the target roster size _before_ commissioning art, not after.

### 2. The economy: duplicates and what the collection is for

**Do these as one design conversation.** They are the same question:

- Pulling a character you own increments `copies` and shows `×2`. Nothing consumes it.
- Which means: what _is_ the reward? Right now it is a picture. Whether that sustains
  depends on what the pictures are for.

Duplicates without a purpose is a counter that goes up. What they convert into depends
entirely on what there is to spend on, so designing the conversion first would be
designing blind.

Good news: `owned_characters.copies` has tracked duplicates since the first migration
specifically so this could be designed later **without one**.

Prior art worth considering, none of it decided: duplicates into a soft currency that
buys targeted pulls; duplicates into character upgrades; duplicates into cosmetic
variants. v1 deliberately deferred this as the "trash pull economy".

### 3. Streaks — after the economy, not before

Wanted: consecutive days logged in, and/or consecutive days the ticket cap was maxed.

Sequence it after §2, because it is **not independent of it**. A streak that pays tickets
multiplies the whole economy, so its design depends on what tickets buy. Designing it
first means picking numbers with nothing to calibrate against.

Note also that the ledger already records `log_date` on every row, so "days the cap was
maxed" is answerable from existing data with no schema change. "Days logged in" is not —
nothing currently records app opens.

### 4. ✅ A screen explaining the rules — done

Built 2026-09-15 as `src/screens/HowItWorksScreen.tsx`, a fourth bottom tab. It states
the daily ticket cap, the three pull rates and the pity guarantee, and it is purely
presentational — no database reads, so no spinner and no error path.

The hard constraint held: every number is read from `getGachaConfig()` at render time and
none is retyped into the copy. The 3★ rate is derived as `1 - fiveStarRate -
fourStarRate`, since no config field holds it. A test renders the screen against a config
the app has never shipped and asserts the text tracks it, so hard-coding a number turns
the suite red.

`__DEV__` builds get a banner saying the rates on screen are not the real economy —
`getGachaConfig()` honestly returns 25% and pity 5 there, which is exactly the misreading
this file warns about above.

Still unseen on a device: whether a fourth tab crowds the tab bar at narrow widths.

See `docs/decisions.md`, entry of the same date.

## Things deliberately not being done

- **Rewarded ads.** Named as the monetisation plan, deferred past v1, no SDK chosen.
- **Non-gym habit categories.** The `HabitCategory` type is `'gym'` only today.
- **Any backend, accounts, or cloud sync.** Local-first is a design commitment, not a
  stage — it is what makes the app work offline with no privacy surface.
- **Closing the midnight micro-window.** `adjustHabitCount` captures the date once, so
  midnight falling between the log write and the ticket award puts them on different
  days. Sub-millisecond, self-correcting, and closing it means a breaking change to the
  shared ticket seam. Recorded and accepted.

## How to work on this repo

Read `CLAUDE.md` first — it is short and it is the conventions. The parts that bite:

- **Never commit to `master`.** Branch `feat/…` or `bug/…`, then PR. CI runs typecheck,
  lint, tests and an Android bundle on every PR.
- **Every tunable number lives in `src/config/gacha.ts`.** Never hard-code a rate, a pity
  threshold or the daily cap anywhere else.
- **Every database write goes through `withWriteTransaction`** from `src/services/db`.
  Never call `db.withExclusiveTransactionAsync` or `db.withTransactionAsync` directly —
  neither serialises concurrent callers, and this app's read-then-write pattern fails
  with "database is locked" when two overlap. `src/services/db/writeQueue.ts` carries the
  measurements. It is a process-global mutex that _rejects_ nested writes, so a service
  that needs to compose with another exposes a `…On(txn)` form (see `spendTicketOn`).
- **New behaviour goes through a design step** before implementation, and the resulting
  decision goes in `docs/decisions.md`.
- Named exports only; strict TypeScript; Prettier owns formatting.

The habits and gacha halves were built in parallel by two developers and share no files
except the ticket seam in `src/services/tickets/`. Anything both need belongs in the
foundation, which means a conversation first rather than a unilateral edit.

## Two traps that already caught us once

- **`completed_at` means "today's ticket is paid", not "this habit is done."** It is
  deliberately never cleared, so the award cannot be farmed by crossing the target twice.
  The ✓ renders from live progress (`count >= target`) instead. Rendering it from
  `completed_at` was the one defect the first device run found. Progress is editable;
  earnings are final.
- **A retried write re-runs its whole callback.** The write queue retries lock conflicts,
  so a retried summon re-rolls the dice. Sound, because nothing was committed — but any
  callback you write must be safe to run twice, and must not carry state between attempts.

## Where the detail lives

- `docs/status/OPEN-ITEMS.md` — current status; read before trusting anything in `src/`
- `docs/decisions.md` — the decision log, newest first, with the reasoning
- `docs/architecture.md` — current state and open technical decisions
- `docs/status/DEVICE-RUN-CHECKLIST.md` — the ordered re-run script for device testing
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — designs and the plans built
  from them
- `docs/status/2026-09-15-*-decisions.md` — what was decided while building each piece,
  with the alternatives that were rejected and why
