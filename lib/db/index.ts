import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { migrations } from "./migrations";

const databasePath =
  process.env.MY_LIFE_DB_PATH ??
  path.join(process.cwd(), "data", "life-workbench.sqlite");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("busy_timeout = 5000");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )
`);

const applied = new Set(
  sqlite
    .prepare("SELECT version FROM schema_migrations")
    .all()
    .map((row) => (row as { version: number }).version),
);

for (const migration of migrations) {
  if (applied.has(migration.version)) continue;
  sqlite.transaction(() => {
    // Another worker may have migrated while this connection waited for the writer lock.
    if (sqlite.prepare("SELECT 1 FROM schema_migrations WHERE version=?").get(migration.version)) return;
    sqlite.exec(migration.sql);
    sqlite
      .prepare(
        "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
      )
      .run(migration.version, migration.name, Date.now());
  }).immediate();
}

const now = Date.now();
const settingsColumns = sqlite.prepare("PRAGMA table_info(app_settings)").all() as Array<{ name: string }>;
if (settingsColumns.some((column) => column.name === "user_id")) {
  sqlite.prepare(
    `INSERT OR IGNORE INTO app_settings(
      user_id, timezone, day_boundary_hour, daily_work_target_minutes,
      weekly_workout_target, created_at, updated_at
    ) VALUES (1, 'Asia/Shanghai', 4, 330, 3, ?, ?)`,
  ).run(now, now);
} else {
  sqlite.prepare(
    `INSERT OR IGNORE INTO app_settings(
      id, timezone, day_boundary_hour, daily_work_target_minutes,
      weekly_workout_target, created_at, updated_at
    ) VALUES (1, 'Asia/Shanghai', 4, 330, 3, ?, ?)`,
  ).run(now, now);
}

export const db = drizzle(sqlite, { schema });
export { sqlite, databasePath };
