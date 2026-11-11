import { z } from "zod";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "日期无效");
export const repeatSchema = z.object({
  frequency: z.enum(["daily", "weekly", "custom"]),
  days: z.array(z.number().int().min(0).max(6)).max(7),
}).refine((rule) => rule.frequency !== "custom" || rule.days.length > 0, "请选择至少一个星期");
const clockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const taskStatusSchema = z.enum(["pending", "completed", "cancelled", "deferred"]);
export const taskOriginSchema = z.object({
  kind: z.enum(["new", "deferred", "legacy"]),
  rootTaskId: z.string().uuid(),
  parentTaskId: z.string().uuid().optional(),
  parentOccurrenceDate: dateSchema.optional(),
  createdAt: z.number().int().nonnegative().nullable(),
  deferredDate: dateSchema.optional(),
});
export const eventSchema = z.object({
  id: z.string().uuid(), title: z.string().trim().min(1).max(160), date: dateSchema,
  start: clockSchema.nullable(), end: clockSchema.nullable(),
  fixed: z.boolean().default(false), repeat: repeatSchema.nullable().optional(), occurrenceDate: dateSchema.optional(), completed: z.boolean(), status: taskStatusSchema.optional(), deferredTo: z.string().uuid().optional(), notes: z.string().max(2000),
  origin: taskOriginSchema.optional(),
  deferredEdited: z.boolean().optional(),
}).refine((event) => (event.start === null && event.end === null) ||
  (event.start !== null && event.end !== null && event.end > event.start), "结束时间必须晚于开始时间");
export type OccurrenceOverride = Pick<z.infer<typeof eventSchema>, "title" | "start" | "end" | "completed" | "notes" | "status" | "deferredTo">;
export type TodoEvent = z.infer<typeof eventSchema> & { exceptions?: Record<string, OccurrenceOverride | null> };
export type TodoMessage = { id: string; role: "user" | "assistant"; content: string; eventIds?: string[] };
export type TodoState = {
  revision: number; events: TodoEvent[]; messages: TodoMessage[];
  undo: TodoEvent[] | null; requestIds: string[];
};
export const emptyState = (): TodoState => ({ revision: 0, events: [], messages: [], undo: null, requestIds: [] });
export const operationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("upsert"), event: eventSchema }),
  z.object({ type: z.literal("delete"), id: z.string().uuid(), occurrenceDate: dateSchema.optional() }),
]);
export const aiResponseSchema = z.object({
  message: z.string().trim().min(1).max(4000), operations: z.array(operationSchema).max(100),
  readDates: z.array(dateSchema).max(14).optional(),
}).refine((response) => !response.readDates?.length || response.operations.length === 0, "读取日程时不能同时提交修改");
export type TodoOperation = z.infer<typeof operationSchema>;
export const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), revision: z.number().int().nonnegative(), requestId: z.string().uuid(), id: z.string().uuid(), occurrenceDate: dateSchema.optional(), date: dateSchema, status: taskStatusSchema }),
  z.object({ action: z.literal("save"), revision: z.number().int().nonnegative(), requestId: z.string().uuid(), event: eventSchema }),
  z.object({ action: z.literal("delete"), revision: z.number().int().nonnegative(), requestId: z.string().uuid(), id: z.string().uuid(), occurrenceDate: dateSchema.optional() }),
  z.object({ action: z.literal("undo"), revision: z.number().int().nonnegative(), requestId: z.string().uuid() }),
  z.object({ action: z.literal("chat"), revision: z.number().int().nonnegative(), requestId: z.string().uuid(), date: dateSchema, content: z.string().trim().min(1).max(4000) }),
]);
export type TodoRequest = z.infer<typeof requestSchema>;
export function minutes(clock: string): number {
  const [hours, mins] = clock.split(":").map(Number);
  return hours * 60 + mins;
}
export function durationLabel(event: Pick<TodoEvent, "start" | "end">): string {
  if (!event.start || !event.end) return "待安排时间";
  const duration = minutes(event.end) - minutes(event.start);
  return [Math.floor(duration / 60) ? `${Math.floor(duration / 60)} 小时` : "", duration % 60 ? `${duration % 60} 分钟` : ""].filter(Boolean).join(" ");
}
export function shanghaiNow(now = new Date()): { date: string; clock: string } {
  const value = new Date(now.getTime() + 8 * 3600_000).toISOString();
  return { date: value.slice(0, 10), clock: value.slice(11, 16) };
}


export type TaskStatus = z.infer<typeof taskStatusSchema>;
export function statusOf(event: { completed: boolean; status?: TaskStatus }): TaskStatus { return event.completed ? "completed" : event.status ?? "pending"; }
export function isPending(event: { completed: boolean; status?: TaskStatus }) { return statusOf(event) === "pending"; }
