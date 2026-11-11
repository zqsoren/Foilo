import { z } from "zod";
import { loginAction } from "@/app/auth-actions";
import { destroyAuthSession, getCurrentUser } from "@/lib/auth";
import { widgetSameOrigin } from "@/lib/todo/widget";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
const credentials = z.object({ phone: z.string().max(20).transform(v => v.replace(/[\s-]/g, "")).pipe(z.string().regex(/^1[3-9]\d{9}$/)), password: z.string().min(1).max(128) }).strict();
export async function POST(request: Request) {
  if (!widgetSameOrigin(request)) return json({ error: "请求来源不正确" }, 403);
  const text = await request.text();
  if (text.length > 2048) return json({ error: "请求过长" }, 413);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return json({ error: "请求格式不正确" }, 400); }
  const parsed = credentials.safeParse(raw);
  if (!parsed.success) return json({ error: "请输入正确的手机号和密码" }, 400);
  // Same password hashing, failed-attempt lockout and HttpOnly session as the web app.
  const result = await loginAction(parsed.data);
  if (!result.ok) return json({ error: result.message }, 401);
  return json({ ok: true });
}
export async function DELETE(request: Request) {
  if (!widgetSameOrigin(request)) return json({ error: "请求来源不正确" }, 403);
  await destroyAuthSession();
  return json({ ok: true });
}
export async function GET() {
  const user = await getCurrentUser();
  return user ? json({ name: user.name }) : json({ error: "请先登录" }, 401);
}
