"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, destroyAuthSession } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import {
  dateSchema,
  eventSchema,
  statusOf,
  taskStatusSchema,
} from "@/lib/todo/model";
import { widgets, type Widget } from "@/lib/todo/dashboard";
import { dashboardData } from "@/lib/todo/dashboard-store";
import { applyOperations } from "@/lib/todo/operations";
import { changeTaskStatus } from "@/lib/todo/status";
import { occurrenceOn } from "@/lib/todo/recurrence";
import { readTodo, writeTodo, TodoConflict } from "@/lib/todo/store";

const identity = {
  id: z.string().uuid(),
  date: dateSchema,
  occurrenceDate: dateSchema.optional(),
};
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), event: eventSchema }),
  z.object({
    action: z.literal("edit"),
    ...identity,
    patch: z.object({
      title: z.string().trim().min(1).max(160).optional(),
      notes: z.string().max(2000).optional(),
      start: z.string().nullable().optional(),
      end: z.string().nullable().optional(),
    }),
  }),
  z.object({
    action: z.literal("status"),
    ...identity,
    status: taskStatusSchema,
    targetDate: dateSchema.optional(),
  }),
  z.object({ action: z.literal("purge"), ...identity }),
  z.object({
    action: z.literal("layout"),
    layout: z
      .array(z.enum(Object.keys(widgets) as [Widget, ...Widget[]]))
      .max(8)
      .refine((v) => new Set(v).size === v.length),
  }),
]);
export type BoardCommand = z.input<typeof command>;
async function account() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user.id;
}
export async function refreshBoard() {
  return dashboardData(await account());
}
export async function signOutBoard() {
  await destroyAuthSession();
  redirect("/login");
}

export async function updateBoard(
  raw: BoardCommand,
  revision: number,
  requestId: string,
) {
  const uid = await account();
  const parsed = command.safeParse(raw);
  if (
    !parsed.success ||
    !Number.isSafeInteger(revision) ||
    !z.string().uuid().safeParse(requestId).success
  )
    return {
      error: "请检查任务名称、日期和起止时间。",
      data: dashboardData(uid),
    };
  const c = parsed.data;
  try {
    sqlite.transaction(() => {
      if (c.action === "layout") {
        const old = sqlite
          .prepare(
            "SELECT revision, layout FROM todo_dashboard_layouts WHERE user_id=?",
          )
          .get(uid) as { revision: number; layout: string } | undefined;
        const layout = JSON.stringify(c.layout);
        if (old?.layout === layout) return;
        if ((old?.revision ?? 0) !== revision) throw new TodoConflict();
        sqlite
          .prepare(
            `INSERT INTO todo_dashboard_layouts(user_id,layout,revision) VALUES(?,?,?)
          ON CONFLICT(user_id) DO UPDATE SET layout=excluded.layout, revision=excluded.revision`,
          )
          .run(uid, layout, revision + 1);
        return;
      }
      const state = readTodo(uid);
      if (state.requestIds.includes(requestId)) return;
      if (state.revision !== revision) throw new TodoConflict();
      let events = state.events;
      if (c.action === "save") {
        events = applyOperations(events, [{ type: "upsert", event: c.event }]);
      } else if (c.action === "edit") {
        const root = events.find((e) => e.id === c.id);
        const task = root && occurrenceOn(root, c.date);
        if (!task || (root?.repeat && c.occurrenceDate !== c.date))
          throw new Error("这条任务已变更，请重新选择");
        events = applyOperations(events, [
          { type: "upsert", event: { ...task, ...c.patch } },
        ]);
      } else if (c.action === "status") {
        events = changeTaskStatus(events, c);
      } else {
        const root = events.find((e) => e.id === c.id);
        const task = root && occurrenceOn(root, c.date);
        if (
          !task ||
          (root?.repeat && c.occurrenceDate !== c.date) ||
          statusOf(task) !== "cancelled"
        )
          throw new Error("请先取消这条任务");
        events = applyOperations(events, [
          { type: "delete", id: c.id, occurrenceDate: task.occurrenceDate },
        ]);
      }
      writeTodo(
        uid,
        revision,
        requestId,
        { ...state, events, undo: c.action === "purge" ? null : state.events },
        "web",
      );
      if (c.action === "purge") {
        sqlite
          .prepare(
            "DELETE FROM todo_activity WHERE user_id=? AND task_id=? AND occurrence_date IS ?",
          )
          .run(uid, c.id, c.occurrenceDate ?? null);
      }
    })();
    return { error: null, data: dashboardData(uid) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "保存失败，请重试。",
      data: dashboardData(uid),
    };
  }
}
