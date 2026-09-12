# Decisions Log

Lightweight ADR-style log. One entry per decision that would otherwise get
re-litigated or forgotten. Newest at top.

---

### 2026-09-12 — Foundation layer: SQLite, exclusive transactions, parallel verticals

- **Decision**: Storage is `expo-sqlite` with an append-only `ticket_ledger` rather
  than a balance column, so balance is `SUM(delta)` and the daily cap is a query over
  today's positive rows. Navigation is React Navigation bottom tabs, not expo-router.
- **Decision**: All read-then-write database access uses
  `withExclusiveTransactionAsync` with queries on the `txn` handle.
  `withTransactionAsync` is banned project-wide.
- **Why**: `withTransactionAsync` is a bare `BEGIN`/`COMMIT` on a shared connection and
  is documented as interruptible by other async queries. Overlapping callers corrupt
  each other's transactions, which silently removed the double-spend guarantee the
  design depends on. Caught in final review, after an earlier review had wrongly
  confirmed the original as sound.
- **Decision**: The `__DEV__` config override changes rates and pity only — never
  `dailyTicketCap`. The two vertical plans contradicted each other on this; the spec
  authorises a rate override only, and cap-clipping is a v1 behaviour that must stay
  testable in dev.
- **Status**: Written, statically verified, **never run on a device**. See
  `docs/status/OPEN-ITEMS.md`.

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
