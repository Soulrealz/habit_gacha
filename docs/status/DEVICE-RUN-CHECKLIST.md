# Device run — the one checklist

**First completed 2026-09-15** — physical Android phone, Expo Go, by the repo owner.
Everything below passed, including cold-restart persistence and the rapid-tap
concurrency checks. The only thing it surfaced was the tick mark staying on after a
count was edited back down, which is now fixed.

Keep this as the ordered re-run script after any significant change. It merges the
foundation checks with both vertical walkthroughs into one pass, ordered so that a
failure tells you where to look.

---

## Before you start

```bash
npm install
npx expo-doctor          # 21/21 passed as of 2026-09-15
npx expo start
```

Then press `a` for Android (or scan the QR with Expo Go).

Dev build note: `__DEV__` is true, so `DEV_GACHA_CONFIG` applies — a **25% 5★ rate and
pity at 5**, which is what makes the GUARANTEED badge reachable in one sitting. The daily
ticket cap stays at **5** in dev deliberately, because the habits walkthrough needs it to
bind. If you need more than five pulls in one sitting, raise `dailyTicketCap` in
`src/config/gacha.ts` as a local uncommitted edit and revert it before any PR.

---

## Phase 1 — Does it start at all? (the four unconfirmed checks)

If the app dies here, suspect the foundation, not either vertical.

- [ ] **1. The app gets past the spinner.** If it shows "Could not load your data"
      instead, `initDatabase()` rejected — the native `expo-sqlite` module failed to load
      or a migration threw. Check the Metro logs for the error printed by `App.tsx`. A
      successful bundle does **not** prove the native module loads.
- [ ] **2. The three bottom tabs render and navigate.** Today, Summon, Collection.
- [ ] **3. Migrations applied.** Nothing visible to check directly; proven by the
      cold-restart steps, Phase 2 step 7 and Phase 3 step 7.
- [ ] **4. Concurrency under rapid taps.** Covered by Phase 2 step 8 and Phase 3 step 8 —
      do not skip them, this is the check that matters most.

## Phase 2 — Habits (plan Task 5, Step 3)

Steps 1–6 are covered by screen tests and should already work; you are confirming they
hold against real SQLite. Step 7 is the one nothing has ever tested.

- [ ] 1. Today tab: every habit reads `0 / target`, empty progress bar, balance `🎟 0`.
- [ ] 2. Tap `+5` on Pull-ups twice → `10 / 10 reps`, a ✓, full bar, notice
      "Pull-ups complete! +1 ticket", balance `🎟 1`.
- [ ] 3. Tap `+1` again → count 11, balance **stays** 1. (Award-once.)
- [ ] 4. Tap `−1` until below 10 → the ✓ **goes away** (live progress) but the balance
      stays 1. (Progress is editable; earnings are final.)
- [ ] 5. Complete four more habits → balance reaches `🎟 5`.
- [ ] 6. Complete a sixth → it shows complete, the notice says the cap is hit, balance
      stays `🎟 5`. (Cap clipping.)
- [ ] 7. **Fully close and reopen the app.** All counts, ✓ marks, and the balance of 5 are
      still there. ← _never tested by anything_
- [ ] 8. **Spam the quick-add buttons.** The count must never go wrong and no tap may
      silently do nothing. A red "Could not log …" banner here means the write queue did
      not hold — capture the Metro log.

## Phase 3 — Gacha (plan Task 6, Step 3)

- [ ] 1. Summon tab at balance 0: the button is greyed out and does nothing.
- [ ] 2. Earn a ticket on Today, return to Summon → balance reads `🎟 1` and the button
      enables. (This is the `useFocusEffect` path; with `useEffect` it would stay stuck.)
- [ ] 3. Tap Summon → a character appears with name, stars and a **NEW** badge; balance
      drops to `🎟 0`; the button disables.
- [ ] 4. Collection tab → the pulled character is in colour, every other is a faded
      silhouette labelled `???`, header reads `1 / 9`.
- [ ] 5. Pull until you get a duplicate → that character's cell shows `×2`.
- [ ] 6. Pull until a **GUARANTEED** badge appears (dev pity is 5, so within five pulls if
      no natural 5★ lands first).
- [ ] 7. **Fully close and reopen, then open Collection.** Every owned character and
      duplicate count is still there. ← _never tested by anything_
- [ ] 8. **Tap Summon rapidly with exactly one ticket.** Exactly one pull resolves and the
      balance never goes negative.

## Phase 3b — Character ranks (2026-09-16, never run on a device)

Everything below is new since the last device run and is unit-tested only. Dev pity (5)
gets you a 5★ fast, but **R4 and R5 on a 5★ need 5–6 copies of the same 5★**, which the
daily cap makes impossible in one sitting even with pity maxed every day — `RANK_THRESHOLDS`
in `src/config/gacha.ts` is deliberately not dev-overridden (see `docs/status/OPEN-ITEMS.md`
"Decisions made under uncertainty"). The practical route to seeing R4/R5 is **temporarily
lowering `RANK_THRESHOLDS`** as a local uncommitted edit — e.g. `5: [1, 1, 2, 2, 3]` — and
reverting before any PR, same pattern as raising `dailyTicketCap` above.

- [ ] 1. From the Collection grid, **tap an owned character.** It navigates to a detail
      screen (`CharacterDetailScreen`) showing its art, name, rarity and copy count. ←
      _Collection → Detail navigation has never been mounted by any test — this is the
      first time it runs at all, on real `@react-navigation/native-stack`._
- [ ] 2. **Tap an unowned (`???`) cell.** Nothing happens — no navigation, no crash.
- [ ] 3. Pull duplicates of the same character until it crosses a rank threshold (lower
      `RANK_THRESHOLDS` per the note above to make this fast). Reopen its detail screen:
      the newly-unlocked lore entry appears, and locked future ranks still read "Locked".
- [ ] 4. In the Collection grid, an owned character shows **rank pips** next to its cell
      matching its current rank. An unowned cell shows neither pips nor a NEW badge.
- [ ] 5. Push a character to rank 4. Its detail screen shows the decorative border. (The
      grid never shows it — the grid renders rank pips only.)
- [ ] 6. On the How it works tab, toggle **"Show rank borders" off.** The rank-4+ border
      disappears from the detail screen without a restart. Toggle it back on — it
      reappears. ← _the `settings` table (migration 1) backing this toggle has only ever
      been exercised through a mocked db module; this is its first real SQLite write._
- [ ] 7. **Fully close and reopen the app** after toggling the border off. The setting is
      still off. (Proves the `settings` migration actually persisted, not just the in-memory
      state.)
- [ ] 8. Push a character to rank 5. Its detail screen shows the alternate artwork in place
      of the normal sprite.
- [ ] 9. On the How it works tab, the new **"Duplicates and ranks"** section (above
      "Display") shows a copies-per-rank row for ★★★★★ / ★★★★ / ★★★ matching the numbers in
      `RANK_THRESHOLDS` — including any local edit made for step 3 above, which is the
      point: this screen must never show numbers that don't match what the game is actually
      running.

## Phase 4 — The cross-vertical race

Nothing has ever exercised this, and it is the one case the in-process write queue was
built for but has never had to handle against real SQLite.

- [ ] Earn a ticket, then **alternate rapidly** between quick-adding a habit on Today and
      summoning on Summon. Neither should error, and the balance must stay consistent with
      what you did.

---

## What to do with the result

**If it all passes:** delete the "⚠️ Still unconfirmed" section from `OPEN-ITEMS.md`,
update "Where the project actually stands" to say the app has been run and on what device
and OS version, and note the date. That sentence has been false since the project started
and it will be a relief to delete it.

**If something fails:** the docs will tell you what was assumed. In rough order of how
likely each is to be the culprit:

1. `expo-sqlite` loading or migrations — `src/services/db/`.
2. The write queue under real contention — `src/services/db/writeQueue.ts`, and
   `docs/status/2026-09-15-write-serialisation-decisions.md` for the measurements it was
   built from. Note that those measurements come from `node:sqlite`, **not** expo — this
   is the first time the real thing is involved.
3. Your own vertical.

Everything statically verified so far: 139/139 tests, `tsc --noEmit`, `expo lint`,
`expo-doctor` 21/21, and a valid Android bundle. None of that touches the native module.

## What the sprites are

`assets/characters/` holds **generated placeholders**, not art: each character's initial
on its rarity colour, produced by `scripts/generate-placeholder-sprites.mjs`. They exist so
Phase 3 steps 4 and 5 are checkable — before them all nine images were identical copies of
the splash icon, so "the pulled one is in colour and the rest are silhouettes" could not be
confirmed by eye. Real art drops in at the same paths with no code change; delete the
script when it does.
