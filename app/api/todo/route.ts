import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStoredAiProviderConfig } from "@/lib/ai/project-agent";
import { requestSchema } from "@/lib/todo/model";
import { changeTaskStatus } from "@/lib/todo/status";
import { applyOperations } from "@/lib/todo/operations";
import { readTodo, writeTodo, TodoConflict } from "@/lib/todo/store";
import { requestTodoAi } from "@/lib/todo/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const pending = new Set<number>();
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ error: "请先登录人生工作台" }, 401);
  return json({ state: readTodo(user.id), aiConfigured: Boolean(getStoredAiProviderConfig(user.id)) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "登录已过期，请重新登录" }, 401);
  const origin = request.headers.get("origin");
  // Next may normalize request.url to localhost in development. Compare with the
  // actual inbound Host, which also preserves the public host behind a proxy.
  if (origin) {
    try { if (new URL(origin).host !== request.headers.get("host")) return json({ error: "请求来源不正确" }, 403); }
    catch { return json({ error: "请求来源不正确" }, 403); }
  }
  const body = await request.text();
  if (body.length > 20000) return json({ error: "内容过长" }, 413);
  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return json({ error: "请求格式不正确" }, 400); }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "请检查标题、日期和起止时间，结束时间应晚于开始时间" }, 400);
  const input = parsed.data;
  const state = readTodo(user.id);
  if (state.requestIds.includes(input.requestId)) return json({ state });
  if (state.revision !== input.revision) return json({ error: new TodoConflict().message, state }, 409);
  let ownsPending = false;
  try {
    let next = { ...state };
    if (input.action === "chat") {
      if (pending.has(user.id)) return json({ error: "AI 正在安排，请等待当前请求完成" }, 409);
      const config = getStoredAiProviderConfig(user.id);
      if (!config) return json({ error: "请先在人生工作台的设置中配置 AI 接口" }, 400);
      pending.add(user.id); ownsPending = true;
      const output = await requestTodoAi(config, state, input.date, input.content);
      next.events = applyOperations(state.events, output.operations, true);
      next.undo = output.operations.length ? state.events : state.undo;
      const changedIds = output.operations.flatMap((operation) => operation.type === "upsert" ? [operation.event.id] : []);
      next.messages = [...state.messages,
        { id: input.requestId, role: "user" as const, content: input.content },
        { id: crypto.randomUUID(), role: "assistant" as const, content: output.message, eventIds: changedIds },
      ];
    } else if (input.action === "undo") {
      if (!state.undo) return json({ error: "没有可以撤销的修改" }, 400);
      next.events = state.undo; next.undo = null;
      next.messages = [...state.messages, { id: crypto.randomUUID(), role: "assistant", content: "已撤销上一次日程修改。" }];
    } else if (input.action === "status") {
      next = { ...state, undo: state.events, events: changeTaskStatus(state.events, input) };
    } else {
      next = { ...state, undo: state.events, events: applyOperations(state.events, [input.action === "save" ? { type: "upsert", event: input.event } : { type: "delete", id: input.id, occurrenceDate: input.occurrenceDate }]) };
    }
    return json({ state: writeTodo(user.id, input.revision, input.requestId, next, "web") });
  } catch (error) {
    if (error instanceof TodoConflict) return json({ error: error.message, state: readTodo(user.id) }, 409);
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) return json({ error: "AI 请求超时，本次没有修改日程，可以重试" }, 504);
    if (error instanceof TypeError) return json({ error: "AI 网络连接失败，本次没有修改日程，可以重试" }, 502);
    return json({ error: error instanceof Error ? error.message : "暂时无法保存，请重试" }, 400);
  } finally { if (ownsPending) pending.delete(user.id); }
}
