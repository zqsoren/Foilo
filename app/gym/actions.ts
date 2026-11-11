"use server";
import { getCurrentUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { dashboard, mutate, workout } from "@/lib/gym/store";
import type { Command } from "@/lib/gym/commands";
import type { Dashboard } from "@/lib/gym/model";

export async function readGym(month: string) {
  const user = await getCurrentUser();
  if (!user) throw Error("请重新登录");
  return dashboard(sqlite, user.id, month);
}
export async function readWorkout(id: number) {
  const user = await getCurrentUser();
  if (!user || !Number.isSafeInteger(id)) throw Error("无法读取这次训练");
  return workout(sqlite, user.id, id);
}
type Result =
  | { ok: true; id: number; data: Dashboard }
  | { ok: false; message: string; login?: boolean };
export async function changeGym(
  requestId: string,
  month: string,
  command: Command,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "请重新登录", login: true };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return { ok: false, message: "月份无效" };
  try {
    const id = mutate(sqlite, user.id, requestId, command);
    return { ok: true, id, data: dashboard(sqlite, user.id, month) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      ok: false,
      message: /^[\u3400-\u9fff]/.test(message)
        ? message
        : "保存失败，请刷新后重试",
    };
  }
}
