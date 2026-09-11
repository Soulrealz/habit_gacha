# Architecture Notes

Living document. Update as real decisions get made — this is not a spec,
just where we record what's true right now.

## The idea

"Daily Summoner" — a gacha-style habit tracker. Completing daily habits
(protein goal, studying, etc.) earns summoning tickets. Tickets are spent
pulling for pixel-art/anime-style character sprites to collect.

## Current state (scaffold only)

- Expo (managed workflow) + React Native + TypeScript
- No habit tracking, gacha, or ad logic implemented yet — blank app shell only
- Storage engine not yet chosen (candidates: expo-sqlite, AsyncStorage) —
  decide when habit-tracking data model work starts
- Ad SDK not yet chosen (candidates: AdMob via expo, react-native-google-mobile-ads)
  — decide when monetization work starts

## Open decisions (fill in as they're made)

| Decision              | Status    | Notes                                                         |
| --------------------- | --------- | ------------------------------------------------------------- |
| Local storage engine  | Undecided | SQLite likely, for structured habit/streak/collection queries |
| Ad SDK                | Undecided | Rewarded ads for extra pulls / streak saves                   |
| Navigation            | Undecided | Likely expo-router once there's more than one screen          |
| Sprite asset pipeline | Undecided | Bulk AI-generated sprites, bundled locally                    |

## Non-goals for now

- No backend/server — fully local-first
- No account system / auth
- No real-money purchases beyond ad-based monetization (unless revisited)
