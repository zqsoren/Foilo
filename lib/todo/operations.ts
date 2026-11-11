import { eventSchema, isPending, minutes, shanghaiNow, type TodoEvent, type TodoOperation } from "./model";
import { collisionDates, occurrenceOn } from "./recurrence";

export function applyOperations(events: TodoEvent[], operations: TodoOperation[], ai = false, now = new Date(), trustedDeferredOrigin = false): TodoEvent[] {
  const next = new Map(events.map((event) => [event.id, event]));
  const changed = new Map<string, Set<string> | null>();
  const seen = new Set<string>();
  const current = shanghaiNow(now);
  for (const operation of operations) {
    const input = operation.type === "upsert" ? eventSchema.parse(operation.event) : null;
    const id = input?.id ?? (operation as { id: string }).id;
    const occurrenceDate = input?.occurrenceDate ?? (operation.type === "delete" ? operation.occurrenceDate : undefined);
    const key = `${id}:${occurrenceDate ?? "series"}`;
    if (seen.has(key) || seen.has(`${id}:series`) || (!occurrenceDate && [...seen].some((key) => key.startsWith(`${id}:`)))) throw new Error("同一个日程不能重复修改，请重新描述");
    seen.add(key);
    const root = next.get(id);
    const previous = occurrenceDate && root ? occurrenceOn(root, occurrenceDate) : root;
    if (occurrenceDate && (!root?.repeat || !previous)) throw new Error("这次重复日程已不存在，请刷新后重试");
    if (ai && root?.repeat && !occurrenceDate) throw new Error("请指定要修改的重复日程日期；整组修改可在编辑页完成");
    if (ai && previous && previous.date < current.date) throw new Error("AI 不能修改或删除过去日期的日程");
    if (ai && previous && !isPending(previous)) throw new Error("AI 不能修改或删除已完成的日程，请手动编辑");
    if (operation.type === "delete") {
      if (!root) throw new Error("日程已不存在，请刷新后重试");
      if (occurrenceDate) next.set(id, { ...root, exceptions: { ...root.exceptions, [occurrenceDate]: null } });
      else next.delete(id);
      continue;
    }
    const event = input!;
    event.origin = previous?.origin ?? (previous
      ? { kind: "legacy", rootTaskId: root?.origin?.rootTaskId ?? root?.id ?? event.id, createdAt: null }
      : trustedDeferredOrigin && event.origin?.kind === "deferred"
        ? event.origin
        : { kind: "new", rootTaskId: event.id, createdAt: now.getTime() });
    event.deferredEdited = previous?.deferredEdited;
    if (previous?.origin?.kind === "deferred" && (["title", "notes", "date", "start", "end", "repeat", "completed", "status"] as const)
      .some(field => JSON.stringify(previous[field]) !== JSON.stringify(event[field]))) {
      event.deferredEdited = true;
    }
    if (ai && event.status && !["pending", "completed"].includes(event.status)) throw new Error("请通过任务状态操作取消或推迟日程");
    if (ai && event.date < current.date) throw new Error("AI 不能将日程安排到过去日期");
    if (ai && !previous && event.completed) throw new Error("AI 不能把新任务标记为已完成");
    const timingChanged = !previous || (["date", "start", "end"] as const).some((key) => previous[key] !== event[key]);
    if (ai && !previous && event.start && `${event.date}T${event.start}` < `${current.date}T${current.clock}`) throw new Error("AI 安排到了过去的时间，请重新安排");
    if (occurrenceDate && root) {
      if (event.date !== occurrenceDate) throw new Error("单次重复日程不能移动日期，请新建日程或修改整个重复日程");
      const { title, start, end, completed, notes, status, deferredTo } = event;
      next.set(id, { ...root, fixed: false, exceptions: { ...root.exceptions, [occurrenceDate]: { title, start, end, completed, notes, status, deferredTo } } });
    } else {
      next.set(id, { ...event, fixed: false, occurrenceDate: undefined, exceptions: event.repeat ? root?.exceptions : undefined });
    }
    if (timingChanged || (previous?.completed && !event.completed) || JSON.stringify(previous?.repeat) !== JSON.stringify(event.repeat)) {
      if (!occurrenceDate) changed.set(id, null);
      else { const dates = changed.get(id) ?? new Set<string>(); dates.add(occurrenceDate); changed.set(id, dates); }
    }
  }
  if (next.size > 2000) throw new Error("日程数量已达上限，请整理旧日程");
  // Overlap and buffer rules apply to AI scheduling. Manual saves may overlap.
  if (ai) for (const [id, dates] of changed) {
    const a = next.get(id)!;
    for (const b of next.values()) {
      if (a.id === b.id) continue;
      for (const date of dates ?? collisionDates(a, b)) {
        const left = occurrenceOn(a, date), right = occurrenceOn(b, date);
        if (!left?.start || !right?.start || !isPending(left) || !isPending(right)) continue;
        const [first, second] = left.start <= right.start ? [left, right] : [right, left];
        const gap = minutes(second.start!) - minutes(first.end!);
        if (gap < 0) throw new Error(`${date}「${first.title}」与「${second.title}」时间重叠，请调整时间`);
        if (ai && gap < 5) throw new Error(`「${first.title}」与「${second.title}」之间需要留出 5 分钟缓冲`);
      }
    }
  }
  return [...next.values()].sort((a, b) => `${a.date}${a.start ?? "99:99"}`.localeCompare(`${b.date}${b.start ?? "99:99"}`));
}
