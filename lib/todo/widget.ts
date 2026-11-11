import { createHash, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { statusOf, isPending, shanghaiNow, type TodoEvent } from "./model";
import { eventsForDate } from "./recurrence";

const TOKEN_TTL = 365 * 24 * 60 * 60 * 1000;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export function widgetTokens(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS todo_widget_tokens (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
  )`);
  const columns = db.prepare("PRAGMA table_info(todo_widget_tokens)").all() as { name: string }[];
  if (!columns.some(column => column.name === "can_write")) db.exec("ALTER TABLE todo_widget_tokens ADD COLUMN can_write INTEGER NOT NULL DEFAULT 0");
  return {
    status(userId: number, now = Date.now()) {
      const row = db.prepare("SELECT expires_at AS expiresAt, can_write AS canWrite FROM todo_widget_tokens WHERE user_id = ? AND expires_at > ?").get(userId, now) as { expiresAt: number; canWrite: number } | undefined;
      return { connected: Boolean(row), expiresAt: row?.expiresAt ?? null, canWrite: Boolean(row?.canWrite) };
    },
    issue(userId: number, now = Date.now()) {
      const token = `xipo_${randomBytes(32).toString("base64url")}`;
      const expiresAt = now + TOKEN_TTL;
      db.prepare(`INSERT INTO todo_widget_tokens(user_id, token_hash, created_at, expires_at, can_write) VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at, expires_at = excluded.expires_at, can_write = 1`).run(userId, digest(token), now, expiresAt);
      return { token, connected: true, expiresAt, canWrite: true };
    },
    revoke(userId: number) { db.prepare("DELETE FROM todo_widget_tokens WHERE user_id = ?").run(userId); },
    authenticate(authorization: string | null, now = Date.now(), write = false): number | null {
      const match = /^Bearer (xipo_[A-Za-z0-9_-]{43})$/.exec(authorization ?? "");
      if (!match) return null;
      const row = db.prepare(`SELECT t.user_id AS userId FROM todo_widget_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ? AND t.expires_at > ? AND u.is_active = 1 AND (? = 0 OR t.can_write = 1)`).get(digest(match[1]), now, write ? 1 : 0) as { userId: number } | undefined;
      return row?.userId ?? null;
    },
  };
}

// Only today's display fields leave this endpoint. Never expose notes, chat,
// account identifiers or the user's AI provider credentials to a widget.
export function widgetSnapshot(events: TodoEvent[], now = new Date()) {
  const { date, clock } = shanghaiNow(now);
  const today = eventsForDate(events, date);
  const ordered = today;
  return {
    date, clock, timeZone: "Asia/Shanghai", updatedAt: now.toISOString(),
    total: today.length, pending: today.filter(isPending).length, completed: today.filter(e => e.completed).length,
    events: ordered.slice(0, 20).map(e => ({ id: e.id, date: e.date, occurrenceDate: e.occurrenceDate, status: statusOf(e), title: e.title, start: e.start, end: e.end, completed: e.completed })),
  };
}

export function widgetSameOrigin(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    return ["https:", "http:"].includes(origin.protocol) && origin.host === request.headers.get("host");
  } catch { return false; }
}
