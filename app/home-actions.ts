"use server";
import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { enableModule } from "@/lib/home/store";
export async function enableHomeModule(module: unknown): Promise<{ ok: boolean; message?: string }> {
  try {
    const user = await requireActionUser();
    enableModule(sqlite, user.id, module);
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "添加失败，请重试" };
  }
}
