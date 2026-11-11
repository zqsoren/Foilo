"use server";

import { redirect } from "next/navigation";
import { createAuthSession, destroyAuthSession, hashPassword, verifyPassword } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { seedOwnerTimelines, seedSampleProject } from "@/lib/user-bootstrap";

export type AuthResult = { ok: true } | { ok: false; message: string };

function cleanPhone(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export async function registerAction(input: {
  name: string;
  phone: string;
  password: string;
}): Promise<AuthResult> {
  try {
    const name = input.name.trim();
    const phone = cleanPhone(input.phone);
    if (!name || [...name].length > 30) throw new Error("姓名需要在 1 到 30 个字之间");
    if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error("请输入正确的 11 位手机号");
    if (input.password.length < 8 || input.password.length > 128) throw new Error("密码需要在 8 到 128 个字符之间");
    if (sqlite.prepare("SELECT id FROM users WHERE phone = ?").get(phone)) throw new Error("这个手机号已经注册");

    const passwordHash = await hashPassword(input.password);
    const now = Date.now();
    const activeCount = (sqlite.prepare(
      "SELECT count(*) AS count FROM users WHERE is_active = 1",
    ).get() as { count: number }).count;
    const firstUser = activeCount === 0;
    const userId = sqlite.transaction(() => {
      const legacy = firstUser ? sqlite.prepare(
        "SELECT id FROM users WHERE phone = '__legacy__' AND is_active = 0 LIMIT 1",
      ).get() as { id: number } | undefined : undefined;
      let id: number;
      if (legacy) {
        sqlite.prepare(
          `UPDATE users SET name = ?, phone = ?, password_hash = ?, is_active = 1,
           failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?`,
        ).run(name, phone, passwordHash, now, legacy.id);
        id = legacy.id;
      } else {
        const result = sqlite.prepare(
          `INSERT INTO users(name, phone, password_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(name, phone, passwordHash, now, now);
        id = Number(result.lastInsertRowid);
      }
      sqlite.prepare(
        `INSERT OR IGNORE INTO app_settings(
          user_id, timezone, day_boundary_hour, daily_work_target_minutes,
          weekly_workout_target, created_at, updated_at
        ) VALUES (?, 'Asia/Shanghai', 4, 330, 3, ?, ?)`,
      ).run(id, now, now);
      return id;
    })();
    seedSampleProject(userId);
    if (firstUser) seedOwnerTimelines(userId);
    await createAuthSession(userId);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "注册失败，请重试" };
  }
}

export async function loginAction(input: { phone: string; password: string }): Promise<AuthResult> {
  try {
    const phone = cleanPhone(input.phone);
    const user = sqlite.prepare(
      `SELECT id, password_hash AS passwordHash, failed_login_count AS failedCount,
              locked_until AS lockedUntil
       FROM users WHERE phone = ? AND is_active = 1`,
    ).get(phone) as { id: number; passwordHash: string; failedCount: number; lockedUntil: number | null } | undefined;
    const genericError = new Error("手机号或密码不正确");
    if (!user) {
      await hashPassword(input.password || "invalid-password");
      throw genericError;
    }
    const now = Date.now();
    if (user.lockedUntil && user.lockedUntil > now) throw new Error("尝试次数过多，请 15 分钟后再试");
    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      const failures = user.failedCount + 1;
      sqlite.prepare(
        "UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?",
      ).run(failures >= 5 ? 0 : failures, failures >= 5 ? now + 15 * 60 * 1000 : null, now, user.id);
      throw genericError;
    }
    sqlite.prepare(
      "UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?",
    ).run(now, user.id);
    await createAuthSession(user.id);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "登录失败，请重试" };
  }
}

export async function logoutAction(): Promise<never> {
  await destroyAuthSession();
  redirect("/login");
}
