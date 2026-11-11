import { describe, expect, it } from "vitest";
import { type TodoEvent } from "../lib/todo/model";
import { eventsForDate, occurrenceOn } from "../lib/todo/recurrence";
import { applyOperations } from "../lib/todo/operations";

const daily = (extra: Partial<TodoEvent> = {}): TodoEvent => ({ id: crypto.randomUUID(), title: "阅读", date: "2026-10-13", start: "20:00", end: "20:30", completed: false, fixed: false, notes: "", repeat: { frequency: "daily", days: [] }, ...extra });
const now = new Date("2026-10-13T00:00:00Z");
describe("重复日程", () => {
  it("每天持续显示且不会在起始日期前出现", () => {
    const event = daily();
    expect(eventsForDate([event], "2026-10-12")).toHaveLength(0);
    expect(eventsForDate([event], "2028-02-29")).toHaveLength(1);
  });
  it("每周按起始日星期重复，自定义按勾选星期出现", () => {
    const event = daily({ repeat: { frequency: "weekly", days: [] } });
    expect(eventsForDate([event], "2026-10-20")).toHaveLength(1);
    expect(eventsForDate([event], "2026-10-21")).toHaveLength(0);
    const custom = daily({ repeat: { frequency: "custom", days: [1, 3, 5] } });
    expect(eventsForDate([custom], "2026-10-14")).toHaveLength(1);
    expect(eventsForDate([custom], "2026-10-15")).toHaveLength(0);
  });
  it("单次完成、修改、删除不会影响其他日期", () => {
    const event = daily();
    const occurrence = occurrenceOn(event, "2026-10-14")!;
    let events = applyOperations([event], [{ type: "upsert", event: { ...occurrence, completed: true } }]);
    expect(eventsForDate(events, "2026-10-14")[0].completed).toBe(true);
    expect(eventsForDate(events, "2026-10-15")[0].completed).toBe(false);
    events = applyOperations(events, [{ type: "upsert", event: { ...occurrence, start: "21:00", end: "21:30" } }]);
    expect(eventsForDate(events, "2026-10-14")[0].start).toBe("21:00");
    expect(eventsForDate(events, "2026-10-15")[0].start).toBe("20:00");
    events = applyOperations(events, [{ type: "delete", id: event.id, occurrenceDate: "2026-10-14" }]);
    expect(eventsForDate(events, "2026-10-14")).toHaveLength(0);
    expect(eventsForDate(events, "2026-10-15")).toHaveLength(1);
  });
  it("整组编辑保留单次完成和例外，整组删除清除所有日期", () => {
    const root = daily();
    const [completed] = applyOperations([root], [{ type: "upsert", event: { ...occurrenceOn(root, "2026-10-14")!, completed: true } }]);
    const next = applyOperations([completed], [{ type: "upsert", event: { ...completed, title: "读书" } }]);
    expect(eventsForDate(next, "2026-10-15")[0].title).toBe("读书");
    expect(eventsForDate(next, "2026-10-14")[0].completed).toBe(true);
    expect(applyOperations(next, [{ type: "delete", id: root.id }])).toHaveLength(0);
  });
  it("能发现遥远日期和每周重复间的冲突", () => {
    const oneOff = daily({ repeat: null, date: "2028-01-01" });
    expect(applyOperations([oneOff], [{ type: "upsert", event: daily() }])).toHaveLength(2);
    expect(() => applyOperations([oneOff], [{ type: "upsert", event: daily() }], true, now)).toThrow("重叠");
    const weekly = daily({ repeat: { frequency: "weekly", days: [] } });
    expect(() => applyOperations([weekly], [{ type: "upsert", event: daily({ date: "2027-02-01" }) }], true, now)).toThrow("重叠");
  });
  it("即使第一周都跳过，也能发现之后的重复冲突", () => {
    const event = daily({ exceptions: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`2026-10-${13 + i}`, null])) });
    expect(() => applyOperations([event], [{ type: "upsert", event: daily() }], true, now)).toThrow("重叠");
  });
  it("单次修改校验冲突但不修改其他日程", () => {
    const recurring = daily();
    const other = daily({ repeat: null, date: "2026-10-14", start: "21:00", end: "22:00" });
    const operation = { type: "upsert" as const, event: { ...occurrenceOn(recurring, other.date)!, start: "21:00", end: "21:30" } };
    expect(() => applyOperations([recurring, other], [operation], true, now)).toThrow("重叠");
    expect(eventsForDate(applyOperations([recurring, other], [operation]), other.date)).toHaveLength(2);
    expect(recurring.exceptions).toBeUndefined();
  });
  it("AI 新排程会避开重复日程并保留五分钟间隔", () => {
    const recurring = daily();
    const now = new Date("2026-10-13T00:00:00Z");
    expect(() => applyOperations([recurring], [{ type: "upsert", event: daily({ repeat: null, date: "2026-10-14", start: "20:30", end: "21:30" }) }], true, now)).toThrow("5 分钟");
    expect(() => applyOperations([recurring], [{ type: "delete", id: recurring.id }], true, now)).toThrow("日期");
  });
});
