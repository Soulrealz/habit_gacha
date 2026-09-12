# Architecture Notes

Living document. Update as real decisions get made — this is not a spec,
just where we record what's true right now.

## The idea

"Daily Summoner" — a gacha-style habit tracker. Completing daily habits
(protein goal, studying, etc.) earns summoning tickets. Tickets are spent
pulling for pixel-art/anime-style character sprites to collect.

## Current state (foundation written, never run)

- Expo (managed workflow) + React Native + TypeScript
- **Foundation layer exists** on `feat/foundation`, uncommitted: SQLite schema and
  migration runner, shared types, tunable config, the ticket ledger, and a
  three-tab navigation shell. Statically verified only — see
  `docs/status/OPEN-ITEMS.md` for what remains unconfirmed.
- No habit tracking, gacha, or ad logic yet. Those are the two vertical plans.

## Open decisions

| Decision              | Status                        | Notes                                                                    |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| Local storage engine  | **Decided: `expo-sqlite`**    | Append-only ticket ledger + habit logs; see spec §4                      |
| Navigation            | **Decided: React Navigation** | Bottom tabs. expo-router rejected — the blank template has no `app/` dir |
| Ad SDK                | Undecided                     | Rewarded ads for extra pulls / streak saves; deferred past v1            |
| Sprite asset pipeline | Undecided                     | Bulk AI-generated sprites, bundled locally; the gacha vertical owns this |
| Duplicate economy     | Undecided                     | What 3★ dupes convert into. `owned_characters.copies` already records it |

## Non-goals for now

- No backend/server — fully local-first
- No account system / auth
- No real-money purchases beyond ad-based monetization (unless revisited)
