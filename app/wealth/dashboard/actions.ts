"use server";
import { requireActionUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { readWealth } from "@/lib/wealth/read";
import { saveWealth, type WealthCommand } from "@/lib/wealth/store";
export async function refreshWealth() {
  const user = await requireActionUser();
  return readWealth(sqlite, user.id);
}
export async function writeWealth(command: WealthCommand, requestId: string) {
  try {
    const user = await requireActionUser();
    const result = saveWealth(sqlite, user.id, requestId, command);
    return {
      ok: true as const,
      ...result,
      data: await readWealth(sqlite, user.id),
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error && /^[\u3400-\u9fff]/.test(error.message)
          ? error.message
          : "保存失败，请稍后重试",
    };
  }
}
