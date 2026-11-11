import type Database from "better-sqlite3";
import { z } from "zod";
import { dateSchema, isPending, statusOf, taskStatusSchema, shanghaiNow } from "./model";
import { eventsForDate, occurrenceOn } from "./recurrence";
import { changeTaskStatus } from "./status";
import { TodoConflict, todoRepository } from "./repository";

export const desktopCompletion = z.object({
  id: z.string().uuid(), occurrenceDate: dateSchema.optional(),
  revision: z.number().int().nonnegative(), requestId: z.string().uuid(),
  completed: z.boolean().default(true), status: taskStatusSchema.optional(),
}).strict();

export function desktopSchedule(db: Database.Database, userId: number, now = () => new Date()) {
  const repo = todoRepository(db);
  function read() {
    const date = shanghaiNow(now()).date;
    const state = repo.readTodo(userId), events = eventsForDate(state.events, date);
    const account = db.prepare("SELECT name FROM users WHERE id=? AND is_active=1").get(userId) as { name: string } | undefined;
    if (!account) throw new Error("登录已过期，请重新登录");
    return { date, today: date, timeZone: "Asia/Shanghai", revision: state.revision,
      account, total: events.length, completed: events.filter(e => e.completed).length,
      pending: events.filter(e => isPending(e)).length, next_offset: null,
      events: events.map(e => ({ id: e.id, title: e.title, date: e.date, start: e.start, end: e.end,
        status: statusOf(e), notes: e.notes, completed: e.completed, occurrence_date: e.occurrenceDate ?? null, editable: true })),
    };
  }
  function complete(raw: unknown) {
    const input = desktopCompletion.parse(raw);
    return db.transaction(() => {
      const state = repo.readTodo(userId);
      if (state.requestIds.includes(input.requestId)) return read();
      if (state.revision !== input.revision) throw new TodoConflict();
      const root = state.events.find(e => e.id === input.id);
      if (!root) throw new Error("找不到这个账号的日程");
      if (root.repeat && !input.occurrenceDate) throw new Error("请指定重复日程的具体日期");
      if (!root.repeat && input.occurrenceDate && input.occurrenceDate !== root.date) throw new Error("该日期没有此日程");
      const event = root.repeat ? occurrenceOn(root, input.occurrenceDate!) : root;
      if (!event || event.date !== shanghaiNow(now()).date) throw new Error("只能完成今天的日程，请刷新后重试");
      const status = input.status ?? (input.completed ? "completed" : "pending");
      const events = changeTaskStatus(state.events, { id: input.id, occurrenceDate: input.occurrenceDate, date: event.date, status }, now());
      repo.writeTodo(userId, input.revision, input.requestId, { ...state, events, undo: state.events }, "desktop");
      return read();
    })();
  }
  return { read, complete };
}
