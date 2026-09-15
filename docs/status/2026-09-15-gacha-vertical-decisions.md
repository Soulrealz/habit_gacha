# Gacha vertical — decisions taken during implementation

Date: 2026-09-15. Built by a Claude Code session from
`docs/superpowers/plans/core-loop/September_2026/2026-09-12-gacha-vertical.md`,
with two review agents (code review; Expo SDK 57 API + probability verification
against the versioned docs, as `AGENTS.md` requires).

Same purpose as the sibling doc, `2026-09-15-habits-vertical-decisions.md`: record the
judgement calls made without a human in the loop so they can be overturned cheaply.

> **Partly superseded (2026-09-15).** §3 concluded that `spendTicket` did not need a JS
> queue. It now has one anyway, app-wide: `withWriteTransaction` serialises every write.
> The reasoning in §3 about retryability still holds and is why no extra handling was
> needed on top. See `2026-09-15-write-serialisation-decisions.md`.

---

## 1. 🔴 The severe one: persistence order inside `performSummon`

The plan wrote the pity counter and then recorded the character:

```ts
await writePity(result.newPity);
const isNew = await recordCharacter(character.id);
```

Both are separate auto-committing writes on separate connections, and per the red item
in `OPEN-ITEMS.md` either can throw `SQLITE_BUSY` immediately — nothing sets
`busy_timeout`. So this ordering has a window with a very bad shape:

> The player is at `pity_counter = 59`. They tap Summon. The roll returns the
> **guaranteed 5★** with `newPity: 0`. `writePity(0)` commits. A habit write from the
> Today tab is still flushing, so `recordCharacter` throws. Ticket gone, pity reset to
> zero, **no character.** In production that is roughly 52 pulls — ten or eleven days
> at the daily cap — destroyed silently and unrecoverably.

The plan's own comment claimed the opposite (_"a crash mid-summon leaves the counter
unchanged rather than corrupted"_), which is true before `writePity` and false after it.

| Option                                                        | Pros                                                                                                                                                                                                                    | Cons                                                                                                                                                                         |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Swap the two writes — record the character first (chosen)** | Free. Every residual failure now lands on the player's side: character granted, pity not yet advanced, which is mildly generous and self-corrects on the next pull. The catastrophic direction stops being expressible. | Does not eliminate the window, only reorients it. A failure now means one extra guaranteed pull in the player's favour.                                                      |
| Wrap both writes in one exclusive transaction                 | Genuinely atomic.                                                                                                                                                                                                       | `recordCharacter` owns its own transaction and SQLite cannot nest them. Would mean inlining it, duplicating the upsert, and breaking the collection service's encapsulation. |
| `PRAGMA busy_timeout = 5000` in `initDatabase()`              | The real fix; removes the `SQLITE_BUSY` premise entirely.                                                                                                                                                               | Foundation file, shared with the other developer. Already written up as a red item in `OPEN-ITEMS.md`; not mine to apply unilaterally.                                       |

**Taken: the swap.** It is strictly better under every failure mode and costs nothing.
The `busy_timeout` item remains the real fix and is still open.

## 2. Added a `failed` outcome the plan did not have

The plan's `SummonOutcome` was `no_tickets | busy | success`, with no error path — so
under the `SQLITE_BUSY` reality every `await` in `performSummon` would have surfaced as
an unhandled promise rejection and the tap would appear to do nothing.

**Taken:** added `{ status: 'failed'; ticketSpent: boolean }`. `ticketSpent` is accurate
at every failure point — it is set only after `spendTicket()` resolved `true`, and expo
rolls the debit back on any throw inside its exclusive transaction. The screen uses it
to distinguish "try again, you lost nothing" from "your ticket was spent, sorry".

This is a deviation from the plan's stated interface, recorded here because
`SummonScreen` is the only consumer and it was updated in the same change.

## 3. Deliberately did **not** put a JS promise queue around `spendTicket`

The habits vertical added one around `adjustHabitCount`, and `OPEN-ITEMS.md` left the
question of doing the same for `spendTicket` to "whoever picks it up". This is that
decision.

| Option                                  | Pros                                                                                                                                                                                                                                               | Cons                                                                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Catch and report, no queue (chosen)** | A failed summon is fully retryable — `spendTicket` either committed its debit or rolled it back, never half. Unlike the habits award-once rule, nothing latches to block a retry. The `inFlight` guard already serialises summons with each other. | A habit tap racing a summon can still fail one of them; the user sees an error and retries.                                                                                    |
| Mirror the habits JS queue              | Symmetry between the two verticals.                                                                                                                                                                                                                | Would only serialise summons against summons, which `inFlight` already does. It cannot serialise against the habits module — different queue, different module. Pure ceremony. |

The asymmetry with habits is intentional and rests on retryability, not on taste.

## 4. Other review findings acted on

- **The Summon button re-enabled mid-pull.** `disabled` derived from the `pulling`
  _state_, which does not apply until the next render, so two taps in one frame both
  entered the handler; the second returned `busy` and its own `finally` re-enabled the
  button while the first was still awaiting SQLite. Worse, nothing cleared `message` on
  success, so a successful pull could render captioned "Already summoning." Fixed with
  a `useRef` re-entry guard and an explicit clear. This is walkthrough step 8, so it
  would have looked like a bug on the device run.
- **A false-enable window after a successful pull** — `setPulling(false)` ran before the
  balance re-read, so the button was briefly live against a pre-spend number. Re-enabling
  now happens after the refresh.
- **A failed balance read rendered as a genuine zero.** `setBalance(0)` in the catch is
  indistinguishable from an empty wallet. Now it keeps the balance unset and says so.
- **`ownedCount` could exceed the roster size** — it counted rows in `owned_characters`,
  so a retired character id would make the header read `10 / 9`. Now counts roster
  members the player owns.
- **The Collection fold is now a pure function.** `toOwnedCopies` and `countOwned` moved
  into `src/services/collection/owned.ts` with six tests, per spec §8's rule that logic
  lives outside components.

## 5. Findings deliberately **not** acted on

- **A natural 5★ on the threshold pull is labelled GUARANTEED.** `rollOne` returns
  before calling `rng()`, so a roll that would have won on its own is still reported as
  pity-triggered. It slightly under-reports the player's luck. Cosmetic, and changing it
  would mean rolling first and discarding — noted here rather than changed.
- **Pity is a read-modify-write spanning awaits with no transaction around it**, guarded
  only by the in-process `inFlight` flag. That holds today because `performSummon` is
  the sole reader and writer of `pity_counter` and JS is single-threaded. It becomes a
  real lost-update the moment a second call site appears. Flagged for the concurrency
  walkthrough rather than fixed, since the fix is the same `busy_timeout`/transaction
  conversation as §1.
- **The rng stream desynchronises from the pull index on guaranteed pulls** (one `rng()`
  call is skipped). No statistical bias — verified by simulation — but it means a future
  seeded-replay or deterministic-history feature cannot assume "pull _n_ uses draw _n_".
  Worth knowing before anyone builds one.

## 6. Deviations from the plan's literal code

- Persistence order swapped (§1) and the misleading comment corrected.
- `SummonOutcome` gained the `failed` variant (§2).
- `SummonScreen` gained the ref guard, the message clear, the post-refresh re-enable,
  and honest handling of a failed balance read (§4).
- `CollectionScreen` gained a catch, and its fold moved to `src/services/collection/owned.ts`.
- `recordCharacter` assigns `isNew` on both branches rather than relying on the
  initialiser — the duplicate path is now explicit rather than implied.

## 7. Boundary

Clean. `git diff --stat` shows real content changes in only `src/screens/SummonScreen.tsx`
and `src/screens/CollectionScreen.tsx`; every other new file is untracked and inside
`src/data/characters.ts`, `src/services/gacha/`, `src/services/collection/`, or
`assets/characters/`. Nothing in `src/services/habits/`, `src/data/habits.ts`,
`src/screens/TodayScreen.tsx`, `src/components/HabitRow.tsx`, or any foundation file.
Both screens keep their named exports, so `src/navigation/index.tsx` needed no edit.

The `M` flags on other files in `git status` are CRLF noise from `core.autocrlf=true`,
not edits — check with `git diff --stat` before believing them.

---

## Verified, and not

Verified on this machine:

- `npx jest` — **65/65 passing**, 7 suites (16 new for the roster and engine, 6 for the
  owned-map helper, plus the added config and boundary pins).
- `npx tsc --noEmit` — clean. `npx expo lint` — clean, exit 0.
- `npx expo export --platform android` — valid bundle including the nine sprites, exit 0.
- **The pity boundary was independently re-derived: the guarantee fires on exactly the
  60th consecutive pull, not the 59th.** Incoming `pity = 59` means 59 failures already
  banked, so the pull being resolved is the 60th.
- **The distribution test's 48–56 range is correct and cannot flake.** The analytic mean
  is `(1 − 0.995⁶⁰)/0.005` = **51.95** pulls per 5★, confirmed by a 5-million-pull
  simulation (52.04, max streak 60). The rng is seeded, so the test is deterministic
  anyway; even unseeded the bounds sit ~15σ out.
- **Effective 5★ rate is 1.93%, not the nominal 0.5%** — pity dominates, producing 74%
  of all 5★s. That matches the economy the project chose deliberately; it is written
  down here because the nominal rate alone is misleading.
- Dev config: effective 5★ rate **32.8%**, guarantee on the 5th pull, all three rarity
  bands reachable. With `dailyTicketCap` left at 5 in dev, a full five-ticket session
  ends on the guarantee unless a natural 5★ resets it first — which is what makes
  walkthrough step 6 reachable in one sitting.
- Asset handling: `require()` of bundled PNGs is the correct SDK 57 pattern, survives
  the `jest-expo` transform, needs no `metro.config.js`, and `resizeMode` as a prop is
  not deprecated in RN 0.86.

**Not verified — nobody has run this app.** Unchanged from the foundation's status:

1. Everything touching SQLite: `recordCharacter`, `readPity`/`writePity`, and the
   `spendTicket` call inside `performSummon`.
2. The eight-step device walkthrough in Task 6 of the plan — where the NEW badge,
   duplicates, the GUARANTEED badge, persistence across a cold restart, and rapid-tap
   behaviour actually get proven.
3. Every sprite is a copy of `splash-icon.png`. The Collection grid and the pull reveal
   will look identical for all nine characters until real art lands at those paths.
