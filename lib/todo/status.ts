import { randomUUID } from "node:crypto";
import { addDays } from "../life-date";
import { dateSchema, statusOf, type TaskStatus, type TodoEvent } from "./model";
import { occurrenceOn } from "./recurrence";
import { applyOperations } from "./operations";

// One atomic state change retains the source and creates tomorrow's untimed copy.
export function changeTaskStatus(events: TodoEvent[], input: { id: string; occurrenceDate?: string; date: string; status: TaskStatus; targetDate?: string }, now = new Date()): TodoEvent[] {
  const root = events.find(event => event.id === input.id);
  if (!root) throw new Error("找不到这个账号的日程");
  if (root.repeat && input.occurrenceDate !== input.date) throw new Error("请指定重复日程的具体日期");
  const event = occurrenceOn(root, input.date);
  if (!event || (input.occurrenceDate && input.occurrenceDate !== event.date)) throw new Error("该日期没有此日程");
  const destination = input.targetDate ?? addDays(event.date, 1);
  if (input.targetDate && (!dateSchema.safeParse(destination).success || destination <= event.date)) throw new Error("请选择任务日期之后的一天");
  const previous = statusOf(event);
  if (previous === input.status && !input.targetDate) return events;
  if (previous === "deferred") {
    const target = events.find(item => item.id === event.deferredTo);
    const legacyChanged = target && target.deferredEdited === undefined &&
      (target.title !== event.title || target.notes !== event.notes || target.start !== null || target.end !== null || target.repeat);
    if (target && (target.deferredEdited || legacyChanged || statusOf(target) !== "pending" || target.date !== (target.origin?.deferredDate ?? addDays(event.date, 1)))) {
      throw new Error(`${target.date} 的后续任务已修改或完成，请到那一天处理`);
    }
    if (input.status === "deferred" && target && input.targetDate) {
      return events.map(item => item.id === target.id ? {
        ...target, date: destination, deferredEdited: false, origin: { ...(target.origin ?? { kind: "deferred", rootTaskId: event.origin?.rootTaskId ?? event.id, parentTaskId: event.id, parentOccurrenceDate: event.date, createdAt: null }), deferredDate: destination },
      } : item);
    }
    if (input.status === "deferred") throw new Error("找不到推迟产生的任务");
    return applyOperations(events, [
      { type: "upsert", event: { ...event, completed: input.status === "completed", status: input.status, deferredTo: undefined } },
      ...(target ? [{ type: "delete" as const, id: target.id }] : []),
    ], false, now, true);
  }
  const target = input.status === "deferred" ? randomUUID() : undefined;
  const deferredAt = now.getTime();
  return applyOperations(events, [
    { type: "upsert", event: { ...event, status: input.status, completed: input.status === "completed", deferredTo: target } },
    ...(target ? [{ type: "upsert" as const, event: { ...event, id: target, date: destination, start: null, end: null, completed: false, status: "pending" as const, repeat: null, occurrenceDate: undefined, deferredTo: undefined, origin: { kind: "deferred" as const, rootTaskId: event.origin?.rootTaskId ?? event.id, parentTaskId: event.id, parentOccurrenceDate: event.date, createdAt: deferredAt, deferredDate: destination } } }] : []),
  ], false, now, true);
}
