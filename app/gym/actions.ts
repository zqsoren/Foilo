"use server";
import { getCurrentUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { dashboard, mutate, previousExercise, workout } from "@/lib/gym/store";
import type { Command } from "@/lib/gym/commands";
import type { Dashboard } from "@/lib/gym/model";

export async function readGym(month: string) {
  const user = await getCurrentUser();
  if (!user) throw Error("请重新登录");
  return dashboard(sqlite, user.id, month);
}
export async function readPlanHistory(planId:number) {
  const user=await getCurrentUser();
  if (!user || !Number.isSafeInteger(planId)) throw Error("无法读取计划");
  return sqlite.prepare(`SELECT w.id,w.day,w.name FROM gym_workouts w JOIN gym_plans p ON p.id=w.plan_id
    WHERE w.user_id=? AND p.user_id=w.user_id AND p.archived=1 AND p.id=? AND w.finished IS NOT NULL ORDER BY w.started DESC,w.id DESC`)
    .all(user.id,planId) as {id:number;day:string;name:string}[];
}

export async function readWorkout(id: number) {
  const user = await getCurrentUser();
  if (!user || !Number.isSafeInteger(id)) throw Error("无法读取这次训练");
  return workout(sqlite, user.id, id);
}
export async function readPreviousExercise(exerciseId: number) {
  const user = await getCurrentUser();
  if (!user || !Number.isSafeInteger(exerciseId)) throw Error("无法读取上次记录");
  return previousExercise(sqlite,user.id,exerciseId);
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
