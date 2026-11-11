import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { desktopSchedule } from "../lib/todo/desktop";
import { todoRepository } from "../lib/todo/repository";
import { emptyState, type TodoEvent } from "../lib/todo/model";
const now = () => new Date("2026-10-26T06:30:00Z");
const event = (extra: Partial<TodoEvent> = {}): TodoEvent => ({ id: randomUUID(), date: "2026-10-26", title: "写论文", start: "14:00", end: "16:00", completed: false, notes: "备注", fixed: false, ...extra });
function setup(events: TodoEvent[]) {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT, is_active INTEGER); INSERT INTO users VALUES(1,'测试一',1),(2,'测试二',1)");
  const repo = todoRepository(db); repo.writeTodo(1, 0, randomUUID(), { ...emptyState(), events, messages: [{ id: randomUUID(), role: "user", content: "不可输出的聊天" }] });
  return { db, repo, a: desktopSchedule(db, 1, now), b: desktopSchedule(db, 2, now) };
}
describe("Mac 账号日程服务", () => {
  it("仅返回当天日程及账号名称，账号隔离，不输出聊天或密钥", () => {
    const { db, a, b } = setup([event(), event({ date: "2026-10-25" })]);
    try {
      expect(a.read()).toMatchObject({ date: "2026-10-26", total: 1, pending: 1, account: { name: "测试一" } });
      expect(b.read().events).toHaveLength(0);
      expect(JSON.stringify(a.read())).not.toMatch(/不可输出|password|messages|key/);
    } finally { db.close(); }
  });
  it("完成、重复请求去重与旧 revision 拒绝", () => {
    const e = event(), { db, a } = setup([e]);
    try {
      const input = { id: e.id, revision: 1, requestId: randomUUID() };
      expect(a.complete(input)).toMatchObject({ revision: 2, completed: 1, pending: 0 });
      expect(a.complete(input).revision).toBe(2);
      expect(() => a.complete({ ...input, requestId: randomUUID() })).toThrow(/发生了变化/);
      expect(a.complete({ ...input, revision: 2, requestId: randomUUID() }).completed).toBe(1);
    } finally { db.close(); }
  });
  it("不可写其他账号、过去或未来日期", () => {
    for (const date of ["2026-10-25", "2026-10-27"]) {
      const e = event({ date }), { db, a, b } = setup([e]);
      try {
        expect(() => a.complete({ id: e.id, revision: 1, requestId: randomUUID() })).toThrow(/今天/);
        expect(() => b.complete({ id: e.id, revision: 0, requestId: randomUUID() })).toThrow(/账号/);
        expect(() => a.complete({ id: e.id, completed: false, revision: 1, requestId: randomUUID() })).toThrow(/今天/);
        expect(() => b.complete({ id: e.id, completed: false, revision: 0, requestId: randomUUID() })).toThrow(/账号/);
      } finally { db.close(); }
    }
  });
  it("取消完成持久化，保留细节和总数，仍校验版本并去重", () => {
    const e = event({ completed: true }), { db, a, repo } = setup([e]);
    try {
      expect(a.read().events[0].editable).toBe(true);
      const input = { id: e.id, completed: false, revision: 1, requestId: randomUUID() };
      expect(a.complete(input)).toMatchObject({ revision: 2, total: 1, completed: 0, pending: 1 });
      expect(repo.readTodo(1).events[0]).toMatchObject({ ...e, completed: false });
      expect(a.complete(input).revision).toBe(2);
      expect(() => a.complete({ ...input, completed: true, requestId: randomUUID() })).toThrow(/发生了变化/);
      expect(a.complete({ ...input, completed: true, revision: 2, requestId: randomUUID() }).completed).toBe(1);
    } finally { db.close(); }
  });
  it("重复日程只完成当天这一项，保留其他天", () => {
    const e = event({ date: "2026-10-01", repeat: { frequency: "daily", days: [] } }), { db, a, repo } = setup([e]);
    try {
      expect(() => a.complete({ id: e.id, revision: 1, requestId: randomUUID() })).toThrow(/具体日期/);
      expect(a.complete({ id: e.id, occurrenceDate: "2026-10-26", revision: 1, requestId: randomUUID() }).completed).toBe(1);
      const root = repo.readTodo(1).events[0];
      expect(root.completed).toBe(false);
      expect(root.exceptions?.["2026-10-26"]?.completed).toBe(true);
      expect(root.exceptions?.["2026-10-27"]).toBeUndefined();
      expect(a.complete({ id: e.id, occurrenceDate: "2026-10-26", completed: false, revision: 2, requestId: randomUUID() }).completed).toBe(0);
      const restored = repo.readTodo(1).events[0];
      expect(restored.completed).toBe(false);
      expect(restored.exceptions?.["2026-10-26"]?.completed).toBe(false);
      expect(restored.exceptions?.["2026-10-27"]).toBeUndefined();
    } finally { db.close(); }
  });
});
