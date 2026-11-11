import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { sqlite } from "./db";
import { loginUrl } from "./login-routing";
import { sessionCookiePolicy } from "./session-cookie";

const scrypt = promisify(nodeScrypt);

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthUser = { id: number; name: string; phone: string };

async function cookiePolicy() {
  const localPreview = process.env.DIGTODO_LOCAL_HTTP_PREVIEW === "1";
  const requestHeaders = localPreview ? await headers() : null;
  return sessionCookiePolicy(
    process.env.NODE_ENV === "production", localPreview, process.env.HOSTNAME,
    requestHeaders?.get("host") ?? null, requestHeaders?.get("x-forwarded-proto") ?? null,
  );
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, encoded] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !encoded) return false;
  const expected = Buffer.from(encoded, "base64url");
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createAuthSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  sqlite.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(now);
  sqlite.prepare(
    `INSERT INTO auth_sessions(user_id, token_hash, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(userId, tokenHash(token), now + SESSION_TTL_MS, now, now);
  const jar = await cookies();
  const { name, secure } = await cookiePolicy();
  jar.set(name, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function destroyAuthSession(): Promise<void> {
  const jar = await cookies();
  const { name } = await cookiePolicy();
  const token = jar.get(name)?.value;
  if (token) sqlite.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(tokenHash(token));
  jar.delete(name);
}

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const { name } = await cookiePolicy();
  const token = (await cookies()).get(name)?.value;
  if (!token) return null;
  const now = Date.now();
  const row = sqlite.prepare(
    `SELECT u.id, u.name, u.phone, s.id AS sessionId
     FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1`,
  ).get(tokenHash(token), now) as (AuthUser & { sessionId: number }) | undefined;
  if (!row) return null;
  sqlite.prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?").run(now, row.sessionId);
  return { id: row.id, name: row.name, phone: row.phone };
});

export async function requireUser(returnTo = "/"): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl(returnTo));
  return user;
}

export async function requireActionUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("登录已过期，请重新登录");
  return user;
}
