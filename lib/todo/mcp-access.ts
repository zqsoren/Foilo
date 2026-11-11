import { createHash, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
export const TODO_MCP_URL = "https://life-152-32-131-4.nip.io/api/todo/mcp";
export type McpAccessStatus = { enabled: boolean; expiresAt: number | null; createdAt: number | null; lastUsedAt: number | null; lastTool: string | null; calls: number };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function mcpAccess(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS todo_mcp_keys (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    last_used_at INTEGER, last_tool TEXT, calls INTEGER NOT NULL DEFAULT 0
  )`);
  return {
    status(userId: number, now = Date.now()): McpAccessStatus {
      const row = db.prepare(`SELECT created_at AS createdAt, expires_at AS expiresAt,
        last_used_at AS lastUsedAt, last_tool AS lastTool, calls FROM todo_mcp_keys WHERE user_id = ?`).get(userId) as Omit<McpAccessStatus, "enabled"> | undefined;
      return row ? { ...row, enabled: row.expiresAt! > now } : { enabled: false, createdAt: null, expiresAt: null, lastUsedAt: null, lastTool: null, calls: 0 };
    },
    issue(userId: number, now = Date.now()) {
      const key = `xipo_mcp_${randomBytes(32).toString("base64url")}`;
      db.prepare(`INSERT INTO todo_mcp_keys(user_id,token_hash,created_at,expires_at) VALUES(?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,expires_at=excluded.expires_at,
        last_used_at=NULL,last_tool=NULL,calls=0`).run(userId, hash(key), now, now + 365 * 86400000);
      return { ...this.status(userId, now), key };
    },
    revoke(userId: number) { db.prepare("DELETE FROM todo_mcp_keys WHERE user_id=?").run(userId); },
    authenticate(authorization: string | null, now = Date.now()): number | null {
      const token = /^Bearer (xipo_mcp_[A-Za-z0-9_-]{43})$/.exec(authorization ?? "")?.[1];
      if (!token) return null;
      const row = db.prepare(`SELECT k.user_id AS id FROM todo_mcp_keys k JOIN users u ON u.id=k.user_id
        WHERE k.token_hash=? AND k.expires_at>? AND u.is_active=1`).get(hash(token), now) as { id: number } | undefined;
      return row?.id ?? null;
    },
    recordCall(userId: number, tool: string) {
      db.prepare("UPDATE todo_mcp_keys SET last_used_at=?,last_tool=?,calls=calls+1 WHERE user_id=?").run(Date.now(), tool, userId);
    },
  };
}
