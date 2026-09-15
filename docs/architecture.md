# Architecture Notes

Living document. Update as real decisions get made — this is not a spec,
just where we record what's true right now.

## The idea

"Daily Summoner" — a gacha-style habit tracker. Completing daily habits
(protein goal, studying, etc.) earns summoning tickets. Tickets are spent
pulling for pixel-art/anime-style character sprites to collect.

## Current state

- Expo (managed workflow) + React Native + TypeScript
- **Foundation layer is on `master`**: SQLite schema and migration runner, shared types,
  tunable config, the ticket ledger, and a four-tab bottom navigation shell (Today,
  Summon, Collection, How it works).
- **Habits vertical is on `master`**: the gym habit catalog
  (`src/data/habits.ts`), the pure award rules and logging service
  (`src/services/habits/`), `HabitRow`, and a real `TodayScreen`.
- **Gacha vertical is on `master`**: the character roster
  and rarity colours (`src/data/characters.ts`), the pure roll engine with pity
  (`src/services/gacha/engine.ts`), the summon service (`src/services/gacha/`), the
  collection service (`src/services/collection/`), and real `SummonScreen` and
  `CollectionScreen`. Sprites are placeholders at their final paths.
- The core loop is complete in code: earn tickets on Today, spend them on
  Summon, view results in Collection. No ad logic yet — deferred past v1.
- `TodayScreen` watches the local date through `useCurrentDate` (`src/lib/`), so crossing
  midnight resets the day's counts on screen with a notice rather than silently, after
  the user's next tap.
- **The loop has been run on a physical Android phone** (2026-09-15, Expo Go): habit
  logging, ticket earning, the daily cap, summoning, duplicates, cold-restart
  persistence, rapid-tap concurrency and midnight rollover are all confirmed by hand.
- **Character ranks are on this branch**: duplicate pulls raise a character's rank 0-5,
  derived from `owned_characters.copies` rather than stored
  (`src/services/collection/rank.ts`). R1-R3 each reveal a lore entry, R4 unlocks a
  decorative border (`src/components/RankBorder.tsx`), and R5 swaps in alternate
  artwork. The `Collection` tab is now a stack (`src/navigation/CollectionStack.tsx`): a
  grid screen showing rank pips per character, pushing to `CharacterDetailScreen` for
  the full view. A `settings` table (migration 1, `src/services/settings/`) backs a
  "show rank borders" toggle surfaced on the How it works screen, which is why that
  screen now reads and writes the database instead of being purely presentational.

## Open decisions

| Decision              | Status                         | Notes                                                                                            |
| ---------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Local storage engine  | **Decided: `expo-sqlite`**    | Append-only ticket ledger + habit logs; see spec §4                      |
| Navigation            | **Decided: React Navigation** | Bottom tabs, plus a native stack for Collection → Character detail; expo-router rejected — the blank template has no `app/` dir |
| Ad SDK                | Undecided                     | Rewarded ads for extra pulls / streak saves; deferred past v1            |
| Sprite asset pipeline | Undecided                     | Nine placeholders now sit at their final paths in `assets/characters/`, plus alternate-art variants for R5 |

## Non-goals for now

- No backend/server — fully local-first
- No account system / auth
- No real-money purchases beyond ad-based monetization (unless revisited)
