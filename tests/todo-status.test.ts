import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { changeTaskStatus } from "../lib/todo/status";
import { eventsForDate } from "../lib/todo/recurrence";
import { statusOf, emptyState, type TodoEvent } from "../lib/todo/model";
import { desktopSchedule } from "../lib/todo/desktop";
import { widgetTokens } from "../lib/todo/widget";
import { todoRepository } from "../lib/todo/repository";
import { applyOperations } from "../lib/todo/operations";
const now = new Date("2026-11-03T09:00:00Z"), today = "2026-11-03";
const task = (extra: Partial<TodoEvent> = {}): TodoEvent => ({ id: randomUUID(), date: today, title: "论文", start: "18:00", end: "19:00", notes: "保留备注", fixed: false, completed: false, ...extra });
describe("任务状态与推迟", () => {
  it("保留今日记录，明天新增无时间待办，重复推迟不再复制", () => {
    const e = task(), input = { id: e.id, date: today, status: "deferred" as const };
    const next = changeTaskStatus([e], input, now);
    expect(next).toHaveLength(2);
    expect(eventsForDate(next, today)[0]).toMatchObject({ ...e, status: "deferred" });
    expect(eventsForDate(next, "2026-11-04")[0]).toMatchObject({ title: e.title, notes: e.notes, start: null, end: null, completed: false, status: "pending", repeat: null });
    expect(changeTaskStatus(next, input, now)).toEqual(next);
  });
  it("重复任务仅当天推迟；明天正常重复项和推迟项分别保留", () => {
    const e = task({ date: "2026-11-01", repeat: { frequency: "daily", days: [] } });
    const next = changeTaskStatus([e], { id: e.id, date: today, occurrenceDate: today, status: "deferred" }, now);
    expect(statusOf(eventsForDate(next, today)[0])).toBe("deferred");
    expect(eventsForDate(next, "2026-11-04")).toHaveLength(2);
    expect(eventsForDate(next, "2026-11-05")).toHaveLength(1);
    expect(eventsForDate(next, "2026-11-04").find(v => v.id !== e.id)?.start).toBeNull();
  });
  it("完成、取消、恢复的符号状态互斥，可以补记过去日期", () => {
    const e = task(); let events = [e];
    for (const status of ["completed", "cancelled", "pending"] as const) {
      events = changeTaskStatus(events, { id: e.id, date: today, status }, now);
      expect(statusOf(events[0])).toBe(status); expect(events[0].completed).toBe(status === "completed");
    }
    const past = task({date:"2026-11-02"});
    expect(changeTaskStatus([past], {id:past.id, date:past.date, status:"cancelled"}, now)[0].status).toBe("cancelled");
  });
  it("持久化原子推迟、请求去重、跨账号拒绝、撤销快照完整", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,is_active INTEGER); INSERT INTO users VALUES(1,'A',1),(2,'B',1)");
    try {
      const repo = todoRepository(db), e = task(); repo.writeTodo(1,0,randomUUID(),{ ...emptyState(), events:[e] });
      const api = desktopSchedule(db,1,() => now), input = { id:e.id, status:"deferred", revision:1, requestId:randomUUID() };
      expect(api.complete(input)).toMatchObject({ pending:0, total:1 });
      expect(api.complete(input).revision).toBe(2); expect(repo.readTodo(1).events).toHaveLength(2);
      expect(repo.readTodo(1).undo).toEqual([e]);
      const child = repo.readTodo(1).events.find(item => item.id !== e.id)!;
      expect(child.origin).toMatchObject({ kind:"deferred", rootTaskId:e.id, parentTaskId:e.id, parentOccurrenceDate:today, createdAt:now.getTime() });
      const edited = applyOperations(repo.readTodo(1).events,[{type:"upsert",event:{...child,title:"编辑后的论文"}}],false,now);
      repo.writeTodo(1,2,randomUUID(),{...repo.readTodo(1),events:edited},"web");
      const history = repo.readActivity(1,0,Date.now()+1000);
      expect(history.map(item => item.action)).toEqual(["created","deferred","deferred_created","edited"]);
      expect(history.at(-1)?.changedFields).toContain("title");
      expect(repo.readTodo(1).events.find(item => item.id === child.id)?.origin).toEqual(child.origin);
      expect(() => desktopSchedule(db,2,() => now).complete({...input,revision:0})).toThrow(/账号/);
    } finally { db.close(); }
  });
  it("重复日程的推迟按具体日期记录，不重复计入规则修改", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,is_active INTEGER); INSERT INTO users VALUES(1,'A',1)");
    try {
      const repo = todoRepository(db), e = task({ date:"2026-11-01", repeat:{ frequency:"daily", days:[] } });
      repo.writeTodo(1,0,randomUUID(),{ ...emptyState(), events:[e] },"web");
      const state = repo.readTodo(1), events = changeTaskStatus(state.events,{ id:e.id, occurrenceDate:today, date:today, status:"deferred" },now);
      repo.writeTodo(1,state.revision,randomUUID(),{ ...state, events },"widget");
      const history = repo.readActivity(1,0,Date.now()+1000);
      expect(history.map(item => item.action)).toEqual(["created","deferred","deferred_created"]);
      expect(history[1]).toMatchObject({ occurrenceDate:today, source:"widget", previousStatus:"pending", nextStatus:"deferred" });
      expect(history[2].occurrenceDate).toBeNull();
    } finally { db.close(); }
  });
  it("旧只读连接码不自动获得写权限，新连接码写权限独立且可撤销", () => {
    const db = new Database(":memory:"); db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,is_active INTEGER); INSERT INTO users VALUES(1,1)");
    try {
      const tokens = widgetTokens(db), token = tokens.issue(1).token;
      db.prepare("UPDATE todo_widget_tokens SET can_write=0").run();
      expect(tokens.authenticate(`Bearer ${token}`)).toBe(1);
      expect(tokens.authenticate(`Bearer ${token}`,Date.now(),true)).toBeNull();
      const newToken = tokens.issue(1).token;
      expect(tokens.authenticate(`Bearer ${newToken}`,Date.now(),true)).toBe(1);
      expect(tokens.authenticate(`Bearer ${token}`)).toBeNull();
    } finally { db.close(); }
  });
});

it("再次推迟恢复今日原时间并删除明日副本，重复恢复不误删", () => {
  const e = task(), defer = { id:e.id, date:today, status:"deferred" as const };
  const deferred = changeTaskStatus([e],defer,now);
  const restored = changeTaskStatus(deferred,{...defer,status:"pending"},now);
  expect(restored).toHaveLength(1);
  expect(restored[0]).toMatchObject({ id:e.id, date:today, start:e.start, end:e.end, notes:e.notes, status:"pending", completed:false });
  expect(eventsForDate(restored,"2026-11-04")).toHaveLength(0);
  expect(changeTaskStatus(restored,{...defer,status:"pending"},now)).toEqual(restored);
});
it("重复任务取消推迟只恢复本次，明日正常重复项仍存在", () => {
  const e=task({date:"2026-11-01",repeat:{frequency:"daily",days:[]}});
  const input={id:e.id,occurrenceDate:today,date:today,status:"deferred" as const};
  const restored=changeTaskStatus(changeTaskStatus([e],input,now),{...input,status:"pending"},now);
  expect(eventsForDate(restored,today)[0]).toMatchObject({status:"pending",start:e.start});
  expect(eventsForDate(restored,"2026-11-04")).toHaveLength(1);
  expect(eventsForDate(restored,"2026-11-04")[0].id).toBe(e.id);
});
it("明日任务已编辑或完成时拒绝撤回，保留所有改动", () => {
  const e=task(), input={id:e.id,date:today,status:"deferred" as const};
  for(const patch of [{title:"改过的标题"},{completed:true,status:"completed" as const},{start:"20:00",end:"21:00"}]) {
    const next=changeTaskStatus([e],input,now).map(v=>v.id===e.id?v:{...v,...patch});
    const original=JSON.stringify(next);
    expect(()=>changeTaskStatus(next,{...input,status:"pending"},now)).toThrow(/已修改或完成/);
    expect(JSON.stringify(next)).toBe(original);
  }
});
