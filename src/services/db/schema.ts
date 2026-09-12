// Append only, never edit: the array index is the schema version, and a device
// that already ran a migration will never run it again.
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS habit_logs (
    habit_id     TEXT NOT NULL,
    log_date     TEXT NOT NULL,
    count        INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    PRIMARY KEY (habit_id, log_date)
  );

  CREATE TABLE IF NOT EXISTS ticket_ledger (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    delta      INTEGER NOT NULL,
    reason     TEXT NOT NULL,
    log_date   TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ticket_ledger_log_date
    ON ticket_ledger (log_date);

  CREATE TABLE IF NOT EXISTS player_state (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    pity_counter INTEGER NOT NULL DEFAULT 0
  );

  INSERT OR IGNORE INTO player_state (id, pity_counter) VALUES (1, 0);

  CREATE TABLE IF NOT EXISTS owned_characters (
    character_id      TEXT PRIMARY KEY,
    copies            INTEGER NOT NULL DEFAULT 1,
    first_obtained_at TEXT NOT NULL
  );
  `,
];
