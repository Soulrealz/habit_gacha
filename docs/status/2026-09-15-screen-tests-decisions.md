# Screen tests — decisions taken standing in for the device run

Date: 2026-09-15. Taking up the top item in `docs/status/OPEN-ITEMS.md`: **the first
device run.**

---

## 1. The item as written could not be done, so this is the nearest thing that could

`OPEN-ITEMS.md` ranked the first device run first, and it remains the right priority.
This machine cannot do it: no Android SDK, no emulator, no device. Item 2, real
character art, is equally out of reach here.

| Option                                              | Pros                                                                                                                                      | Cons                                                                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Screen tests driving both walkthroughs (chosen)** | Covers 11 of the 15 walkthrough steps. Catches exactly the class of bug the walkthroughs exist to catch, and catches it repeatably in CI. | Not a device run. Cannot prove the native module loads, migrations apply, state survives a restart, or that real SQLite concurrency behaves.                               |
| Run `npx expo start --web`                          | Would technically "launch" something.                                                                                                     | `withExclusiveTransactionAsync` throws on web by design, so init fails at the first write and the app shows its error screen. It would prove nothing and look like a pass. |
| Do nothing and report the item blocked              | Honest, zero risk.                                                                                                                        | Leaves the highest-value item untouched when most of it is reachable without a device.                                                                                     |

**Taken: the screen tests.** They are explicitly a complement to the device pass, not a
substitute. Everything they cannot reach is still listed as unconfirmed.

## 2. Coverage against the two walkthroughs

Habits plan, Task 5 Step 3 — seven steps:

| Step                                           | Covered   |
| ---------------------------------------------- | --------- |
| 1. All habits at 0, balance 🎟 0                | ✅        |
| 2. Two +5 taps complete Pull-ups, +1 ticket    | ✅        |
| 3. Adding more does not award again            | ✅        |
| 4. Decrementing keeps the ✓ and the ticket     | ✅        |
| 5. Five completions reach the cap              | ✅        |
| 6. The sixth explains the cap and pays nothing | ✅        |
| 7. State survives a cold restart               | ❌ device |

Gacha plan, Task 6 Step 3 — eight steps:

| Step                                       | Covered   |
| ------------------------------------------ | --------- |
| 1. Button disabled at a balance of 0       | ✅        |
| 2. Earning a ticket enables it on focus    | ✅        |
| 3. A pull shows the character, NEW, spends | ✅        |
| 4. Collection shows owned vs silhouettes   | ✅        |
| 5. A duplicate shows ×2                    | ✅        |
| 6. A pity pull is badged GUARANTEED        | ✅        |
| 7. State survives a cold restart           | ❌ device |
| 8. Rapid taps resolve exactly one pull     | ✅        |

Plus failure paths none of the walkthroughs specify but both screens now handle: a write
that rejects, a balance read that fails, a collection load that fails, and a stale
message being cleared by a later success.

## 3. Only storage is faked — the rules under test are the real ones

The obvious trap with a test like this is re-implementing the logic in the mock and then
testing the mock. Avoided deliberately:

- The Today walkthrough's fake service calls the **real** `resolveAdjust` and the
  **real** `clampAward`. Award-once, no-clawback and cap-clipping are therefore genuinely
  under test through the UI.
- The Summon walkthrough's fake calls the **real** `rollOne` and `pickCharacter` with a
  deterministic RNG, so the pity boundary and rarity bands are the shipped ones.
- Only the SQLite layer is replaced, because that is the part that actually needs a
  device.

## 4. Dependencies

`react-test-renderer` 19.2.3 already ships with `jest-expo`, so no runtime dependency was
added. It has no bundled types, so `@types/react-test-renderer` was added as a
**devDependency** — dev-only, absent from the app bundle, confirmed by a clean
`expo export`.

`@testing-library/react-native` would have given nicer queries but is a real new
dependency, and the raw renderer needed only two small helpers (find a pressable by
accessibility label, read text content). Not worth it.

Test helpers live in `src/test-utils/render.tsx` — deliberately **not** under a
`__tests__` folder, since jest treats everything in those as a test file.

## 5. Known-minor items cleared

All three from `OPEN-ITEMS.md`:

- `cap.test.ts` now covers `clampAward(10, 0, 5) → 5`, the one request that exceeds the
  whole cap from zero. (Written during the habits vertical, then reverted because
  `src/services/tickets/` was outside that vertical's boundary; no boundary applies now.)
- `src/services/.gitkeep` and `src/types/.gitkeep` deleted — both directories have had
  real files for days.
- `expo-status-bar` uninstalled. It had no import anywhere. Removed rather than adopted,
  since nothing in the app configures the status bar; `expo export` still produces a
  valid bundle without it.

## 6. The spec was wrong in two places and is now corrected

`core-loop-design.md` is the authoritative design, so a stale claim there is worse than a
stale claim anywhere else.

- **§9 said a second concurrent caller "reads 0 and returns `false`".** It never did — it
  throws. Corrected in place, with the correction marked rather than silently overwritten,
  because it is the reason every caller needs an error path.
- **§8 said React Native component tests were "deliberately not part of v1 — low value at
  this stage".** That judgement assumed a device would be available for the manual pass
  instead. None ever was. Revised, with the original reasoning kept visible.

## 7. Not done

- **The four unconfirmed checks and both cold-restart steps.** Still device-only, still
  listed. Nothing here weakens them, and `OPEN-ITEMS.md` has been updated to say exactly
  which walkthrough steps remain open rather than implying all of them do.
- **Midnight rollover**, carried over from the habits vertical: with the app open across
  midnight the screen keeps rendering yesterday's logs while taps write to the new date.
  Still unfixed and still wants a design step, not a drive-by patch. It is now the main
  known defect in the codebase.
- **Real character art.** Nine identical placeholders, at their final paths.

---

## Verified

- `npx jest` — **121/121 passing**, 13 suites (32 new: 7 for `HabitRow`, 6 for the Today
  walkthrough, 10 for Summon, 8 for Collection, 1 for the cap boundary).
- `npx tsc --noEmit` — clean. `npx expo lint` — clean, exit 0.
- `npx expo export --platform android` — valid bundle after the dependency removal, exit 0.

**Still never run on a device.** That has not changed and should not be implied otherwise.
