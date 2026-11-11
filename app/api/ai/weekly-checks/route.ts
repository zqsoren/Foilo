import { NextResponse } from "next/server";
import { runPendingProjectWeeklyChecks } from "@/lib/ai/weekly-check";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: "请先登录" }, { status: 401 });
  const result = await runPendingProjectWeeklyChecks(user.id);
  return NextResponse.json({ ok: true, ...result });
}
