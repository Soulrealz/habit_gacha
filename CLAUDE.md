# Daily Summoner — Project Conventions

Gacha-style habit tracker. See `docs/architecture.md` for the current state
and open decisions, `docs/decisions.md` for the decision log. This file is
conventions only — check those two before assuming something is decided.

**The code in `src/` has never been run on a device.** Read the open-items file
imported below before telling anyone the app works, and before building on the
foundation layer.

@docs/status/OPEN-ITEMS.md

@AGENTS.md

## Stack

- Expo (managed workflow), React Native, TypeScript (strict mode)
- Local-first: no backend. Storage is **SQLite via `expo-sqlite`** — decided and
  implemented in the foundation layer (`src/services/db/`).
- Every tunable game-balance number lives in `src/config/gacha.ts` and nowhere
  else. Never hard-code a rate, pity threshold, or daily cap.
- **Every database write goes through `withWriteTransaction` from
  `src/services/db`**, with all queries on the `txn` handle it passes you. Never
  call `db.withExclusiveTransactionAsync` or `db.withTransactionAsync` directly:
  neither serialises concurrent callers, and the read-then-write pattern this app
  uses everywhere fails with "database is locked" when two overlap. `busy_timeout`
  does not fix that. `src/services/db/writeQueue.ts` has the measurements.
- Monetization: rewarded ads (extra pulls, streak saves). Not yet wired in.

## Code conventions

- Functional components only, no class components.
- No default exports, **except** framework-required entry points
  (`App.tsx`, `index.ts`, and any file whose default export is dictated by
  Expo/React Native itself). Everything else: named exports.
- Strict TypeScript — avoid `any`; prefer explicit types on public
  function signatures.
- Formatting is Prettier-owned (`.prettierrc.json`) — don't hand-format,
  run `npx prettier --write .`. Lint via `npx expo lint` (eslint-config-expo).

## Folder layout

```
App.tsx              # entry point
src/
  components/         # shared/reusable UI components
  services/           # non-UI logic: storage, ads, gacha rolls, etc.
  types/              # shared TypeScript types/interfaces
docs/
  architecture.md      # current state + open technical decisions
  decisions.md          # decision log (ADR-lite)
```

Feature code (once habit tracking / gacha / collection screens exist) goes
under `src/`, grouped by feature once there's enough of it to justify
subfolders — don't pre-create empty feature folders.

## Git workflow

- `master` is the trunk. Never commit directly to it — branch, then PR/merge back.
- Branch naming:
  - New features: `feat/<short-description>` (e.g. `feat/gacha-pull-animation`)
  - Bug fixes: `bug/<short-description>` (e.g. `bug/streak-reset-off-by-one`)
  - Use kebab-case, short enough to read in a branch list, descriptive
    enough that a teammate knows what it's for without opening it.
- One feature or fix per branch. Don't bundle unrelated changes.
- CI (`.github/workflows/ci.yml`) runs the typecheck, lint, tests and an Android
  bundle on every push and PR to `master`. Run `npx jest`, `npx tsc --noEmit` and
  `npx expo lint` before pushing rather than finding out from a red PR.

## Working conventions (for both devs + Claude)

- This is a scaffold. No habit-tracking, gacha, or ad logic exists yet —
  don't assume it does when reading the code.
- New features go through a design step before implementation (see the
  project's brainstorming/writing-plans process if using Claude Code) —
  record resulting decisions in `docs/decisions.md`.
- Keep `docs/architecture.md` current when a listed "open decision" gets
  resolved — move it out of the table into prose or into `decisions.md`.
