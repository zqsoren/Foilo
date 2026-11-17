"use server";
import { requireActionUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { readDesktop, saveDesktop } from "@/lib/gym/desktop-store";
import { mutate } from "@/lib/gym/store";
import type { DesktopSettings } from "@/lib/gym/desktop";
import type { Command } from "@/lib/gym/commands";

export async function refreshGymDesktop() {
  const user = await requireActionUser();
  return readDesktop(sqlite, user.id);
}
export async function saveGymDesktop(
  settings: DesktopSettings,
  revision: number,
  requestId: string,
) {
  const user = await requireActionUser();
  try {
    saveDesktop(sqlite, user.id, settings, revision, requestId);
    return { ok: true as const, data: readDesktop(sqlite, user.id) };
  } catch (e) {
    return {
      ok: false as const,
      error:
        e instanceof Error && /^[\u3400-\u9fff]/.test(e.message)
          ? e.message
          : "保存失败，请稍后重试",
      data: readDesktop(sqlite, user.id),
    };
  }
}
export async function saveDesktopPlan(
  command: Extract<Command, { type: "savePlan" }>,
  requestId: string,
) {
  const user = await requireActionUser();
  if (command.type !== "savePlan") throw Error("操作无效");
  try {
    const id = mutate(sqlite, user.id, requestId, command);
    return { ok: true as const, id, data: readDesktop(sqlite, user.id) };
  } catch (e) {
    return {
      ok: false as const,
      error:
        e instanceof Error && /^[\u3400-\u9fff]/.test(e.message)
          ? e.message
          : "计划保存失败",
    };
  }
}
