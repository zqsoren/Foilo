import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  completedByScheduledDay,
  metrics,
  plannedCount,
  searchTasks,
  taskTotals,
  type ActivityCount,
} from "../lib/todo/dashboard";
import { changeTaskStatus } from "../lib/todo/status";
import { applyOperations } from "../lib/todo/operations";
import { type TodoEvent } from "../lib/todo/model";
const task = (extra: Partial<TodoEvent> = {}): TodoEvent => ({
  id: randomUUID(),
  date: "2026-10-31",
  title: "看书",
  notes: "",
  start: null,
  end: null,
  completed: false,
  fixed: false,
  ...extra,
});
describe("桌面看板", () => {
  it("热力图按计划日累计旧任务和重复日程，撤销完成后同步减少", () => {
    const day = "2026-11-08";
    const old = task({ date: day, completed: true });
    const recurring = task({
      repeat: { frequency: "daily", days: [] },
      exceptions: {
        "2026-11-07": null,
        [day]: { title: "散步", start: null, end: null, notes: "", completed: true },
      },
    });
    const next = task({ date: "2026-11-09", status: "cancelled" });
    expect([...completedByScheduledDay([old, recurring, next])]).toEqual([[day, 2]]);
    const reopened = changeTaskStatus([old, recurring, next], {
      id: old.id, date: day, status: "pending",
    });
    expect([...completedByScheduledDay(reopened)]).toEqual([[day, 1]]);
  });
  it("按计划日期计分母，按操作日期统计补记，计入每次推迟", () => {
    const old = task(),
      current = task({ date: "2026-11-05" });
    const row: ActivityCount = {
      task: old.id,
      root: old.id,
      occurrence: null,
      count: 1,
      action: "completed",
      day: "2026-11-09",
    };
    const m = metrics(
      [old, current],
      [row, { ...row, action: "deferred", count: 2 }],
      "2026-11-01",
      "2026-12-01",
    );
    expect([m.total, m.completed, m.deferred]).toEqual([1, 1, 2]);
  });
  it("重复任务按实际日期计数，排除特定日删除的记录", () => {
    const e = task({
      repeat: { frequency: "daily", days: [] },
      exceptions: { "2026-11-03": null },
    });
    expect(plannedCount([e], "2026-11-01", "2026-12-01")).toBe(29);
    expect(taskTotals([e], "2026-11-03").pending).toBe(3);
    expect(searchTasks([e], "看书", "2026-11-03")[0].date).toBe("2026-11-02");
  });
  it("自定义推迟日期可重选，后续内容编辑再改回也无法撤销", () => {
    const e = task();
    const cmd = { id: e.id, date: e.date, status: "deferred" as const };
    const next = changeTaskStatus([e], { ...cmd, targetDate: "2026-11-07" });
    const moved = changeTaskStatus(next, { ...cmd, targetDate: "2026-11-14" }),
      child = moved.find((t) => t.id !== e.id)!;
    expect(child.id).toBe(next.find((t) => t.id !== e.id)?.id);
    expect(changeTaskStatus(moved, { ...cmd, status: "pending" })).toHaveLength(
      1,
    );
    const edited = applyOperations(moved, [
      { type: "upsert", event: { ...child, notes: "阅读两章" } },
    ]);
    const restored = applyOperations(edited, [
      { type: "upsert", event: child },
    ]);
    expect(() =>
      changeTaskStatus(restored, { ...cmd, status: "pending" }),
    ).toThrow("2026-11-14");
  });
});
