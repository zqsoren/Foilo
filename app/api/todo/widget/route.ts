import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db";
import { changeTaskStatus } from "@/lib/todo/status";
import { z } from "zod";
import { dateSchema, taskStatusSchema, shanghaiNow } from "@/lib/todo/model";
import { readTodo, writeTodo, TodoConflict } from "@/lib/todo/store";
import { widgetSnapshot, widgetTokens } from "@/lib/todo/widget";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const userId = widgetTokens(sqlite).authenticate(request.headers.get("authorization"));
  const headers = { "Cache-Control": "private, no-store", "Vary": "Authorization" };
  if (userId === null) return NextResponse.json({ error: "请在日程小组件页面重新生成连接码" }, { status: 401, headers });
  const state = readTodo(userId);
  return NextResponse.json({ ...widgetSnapshot(state.events), revision: state.revision }, { headers });
}

const actionSchema = z.object({ id: z.string().uuid(), occurrenceDate: dateSchema.optional(), date: dateSchema, status: taskStatusSchema, revision: z.number().int().nonnegative(), requestId: z.string().uuid() }).strict();
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "Vary": "Authorization" };
  const userId = widgetTokens(sqlite).authenticate(request.headers.get("authorization"), Date.now(), true);
  if (userId === null) return NextResponse.json({ error: "请在小组件设置中重新生成支持操作的连接码" }, { status: 401, headers });
  const text = await request.text();
  if (text.length > 2048) return NextResponse.json({ error: "请求过长" }, { status: 413, headers });
  try {
    const input = actionSchema.parse(JSON.parse(text));
    if (input.date !== shanghaiNow().date) throw new Error("只能操作今天的任务，请刷新小组件");
    const state = readTodo(userId);
    if (!state.requestIds.includes(input.requestId)) {
      if (state.revision !== input.revision) throw new TodoConflict();
      const events = changeTaskStatus(state.events, input);
      writeTodo(userId, input.revision, input.requestId, { ...state, events, undo: state.events }, "widget");
    }
    const fresh = readTodo(userId);
    return NextResponse.json({ ...widgetSnapshot(fresh.events), revision: fresh.revision }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "操作失败" }, { status: error instanceof TodoConflict ? 409 : 400, headers });
  }
}
