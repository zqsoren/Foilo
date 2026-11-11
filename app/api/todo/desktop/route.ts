import { getCurrentUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { desktopCompletion, desktopSchedule } from "@/lib/todo/desktop";
import { TodoConflict } from "@/lib/todo/repository";
import { widgetSameOrigin } from "@/lib/todo/widget";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ error: "登录已过期，请重新登录" }, 401);
  return json(desktopSchedule(sqlite, user.id).read());
}
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "登录已过期，请重新登录" }, 401);
  if (!widgetSameOrigin(request)) return json({ error: "请求来源不正确" }, 403);
  const text = await request.text();
  if (text.length > 2048) return json({ error: "请求过长" }, 413);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return json({ error: "请求格式不正确" }, 400); }
  const parsed = desktopCompletion.safeParse(raw);
  if (!parsed.success) return json({ error: "请刷新日程后重试" }, 400);
  try { return json(desktopSchedule(sqlite, user.id).complete(parsed.data)); }
  catch (error) {
    if (error instanceof TodoConflict) return json({ error: error.message }, 409);
    return json({ error: error instanceof Error && !("code" in error) ? error.message : "暂时无法保存" }, 400);
  }
}
