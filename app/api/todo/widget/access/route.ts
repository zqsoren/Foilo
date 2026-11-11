import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { widgetSameOrigin, widgetTokens } from "@/lib/todo/widget";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET() {
  const user = await getCurrentUser();
  return user ? json(widgetTokens(sqlite).status(user.id)) : json({ error: "请先登录" }, 401);
}
async function change(request: Request, revoke: boolean) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "登录已过期，请重新登录" }, 401);
  if (!widgetSameOrigin(request)) return json({ error: "请求来源不正确" }, 403);
  const tokens = widgetTokens(sqlite);
  if (revoke) { tokens.revoke(user.id); return json({ connected: false, expiresAt: null }); }
  return json(tokens.issue(user.id));
}
export const POST = (request: Request) => change(request, false);
export const DELETE = (request: Request) => change(request, true);
