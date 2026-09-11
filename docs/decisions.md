# Decisions Log

Lightweight ADR-style log. One entry per decision that would otherwise get
re-litigated or forgotten. Newest at top.

---

### 2026-09-12 — Scaffold: Expo + TypeScript, plain Markdown docs

- **Decision**: Use Expo (managed) + React Native + TypeScript as the base.
  Project context lives in `docs/` as plain Markdown (no Obsidian vault) —
  portable and greppable, works for any collaborator or tool.
- **Why**: Fastest path to iOS + Android builds without native tooling
  overhead; TypeScript for shared conventions with a second dev; plain
  Markdown avoids adding vault tooling before it's needed.
- **Scope**: Skeleton app only — no database, navigation, gacha, or ad logic
  yet. Those are separate future design cycles.
