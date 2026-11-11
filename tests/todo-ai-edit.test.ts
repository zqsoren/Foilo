import { describe, expect, it, vi } from "vitest";
import { emptyState, type TodoEvent, type TodoOperation } from "../lib/todo/model";
import { applyOperations } from "../lib/todo/operations";
import { requestTodoAi } from "../lib/todo/ai";
import { occurrenceOn, eventsForDate } from "../lib/todo/recurrence";

const now = new Date("2026-10-15T06:30:00Z"); // Shanghai 14:30
const event = (extra: Partial<TodoEvent> = {}): TodoEvent => ({ id: crypto.randomUUID(), title: "论文", date: "2026-10-15", start: "14:00", end: "15:00", notes: "", completed: false, fixed: false, ...extra });
const config = { provider: "openai-compatible" as const, model: "test", baseUrl: "https://example.test/v1", apiKey: "test-only" };
const answer = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));

describe("AI 修改权限与顺序", () => {
  it("今天未完成的任务可改内容、延长、调整顺序，即使已经开始或原定时间已过", () => {
    const a = event(), b = event({ start: "15:05", end: "16:05", title: "健身" });
    const edits: TodoOperation[] = [
      { type: "upsert", event: { ...a, title: "论文修改", notes: "修改摘要", start: "15:35", end: "16:35" } },
      { type: "upsert", event: { ...b, start: "14:30", end: "15:30" } },
    ];
    const result = applyOperations([a, b], edits, true, now);
    expect(result.map((e) => e.id)).toEqual([b.id, a.id]);
    expect(result[1].notes).toBe("修改摘要");
    const elapsed = event({ start: "09:00", end: "10:00" });
    expect(applyOperations([elapsed], [{ type: "upsert", event: { ...elapsed, title: "改标题" } }], true, now)[0].title).toBe("改标题");
  });
  it("过去日期的有时间、无时间任务均不能改名、改时间、移到今天或删除", () => {
    for (const past of [event({ date: "2026-10-14" }), event({ date: "2026-10-14", start: null, end: null })]) {
      for (const operation of [
        { type: "delete" as const, id: past.id },
        ...[{ title: "修改" }, { date: "2026-10-15" }, { start: "18:00", end: "19:00" }].map((change) => ({ type: "upsert" as const, event: { ...past, ...change } })),
      ]) expect(() => applyOperations([past], [operation], true, now)).toThrow("过去日期");
    }
    expect(() => applyOperations([], [{ type: "upsert", event: event({ date: "2026-10-14", start: null, end: null }) }], true, now)).toThrow("过去日期");
    const current = event();
    expect(() => applyOperations([current], [{ type: "upsert", event: { ...current, date: "2026-10-14" } }], true, now)).toThrow("过去日期");
  });
  it("已完成任务只读，保护校验按上海日期跨零点生效", () => {
    const done = event({ completed: true });
    expect(() => applyOperations([done], [{ type: "delete", id: done.id }], true, now)).toThrow("已完成");
    expect(() => applyOperations([done], [{ type: "upsert", event: { ...done, completed: false } }], true, now)).toThrow("已完成");
    const today = event();
    expect(() => applyOperations([today], [{ type: "delete", id: today.id }], true, new Date("2026-10-15T16:00:00Z"))).toThrow("过去日期");
  });
  it("重复日程按具体日期的完成状态保护，历史起始日期不妨碍修改今天", () => {
    const root = event({ date: "2026-10-01", repeat: { frequency: "daily", days: [] } });
    const today = occurrenceOn(root, "2026-10-15")!;
    const next = applyOperations([root], [{ type: "upsert", event: { ...today, end: "16:00" } }], true, now);
    expect(eventsForDate(next, "2026-10-15")[0].end).toBe("16:00");
    expect(eventsForDate(next, "2026-10-16")[0].end).toBe("15:00");
    expect(() => applyOperations(next, [{ type: "delete", id: root.id, occurrenceDate: "2026-10-14" }], true, now)).toThrow("过去日期");
    const completed = applyOperations(next, [{ type: "upsert", event: { ...today, completed: true } }]);
    expect(() => applyOperations(completed, [{ type: "upsert", event: today }], true, now)).toThrow("已完成");
  });
});

describe("按日期读取与修正 AI 修改方案", () => {
  it("可读取任意历史日期及重复实例，以数据库真实完成状态为准", async () => {
    const root = event({ date: "2026-10-01", repeat: { frequency: "daily", days: [] }, exceptions: { "2026-10-10": { title: "实际完成的任务", start: "12:00", end: "13:00", notes: "", completed: true } } });
    const fetcher = vi.fn().mockResolvedValueOnce(answer({ message: "读取", readDates: ["2026-10-10"], operations: [] })).mockResolvedValueOnce(answer({ message: "12:00–13:00 实际完成的任务，已完成", operations: [] }));
    const result = await requestTodoAi(config, { ...emptyState(), events: [root] }, "2026-10-15", "10月10日做了什么", fetcher, now);
    expect(result.operations).toHaveLength(0);
    const supplied = JSON.parse(JSON.parse(fetcher.mock.calls[1][1].body).messages.at(-1).content);
    expect(supplied.schedules[0].events[0]).toMatchObject({ title: "实际完成的任务", completed: true, editable: false, occurrenceDate: "2026-10-10" });
  });
  it("跨日期修改先补读源日期和目标日期，再提交，不依赖聊天旧记录", async () => {
    const original = event({ date: "2026-10-17" });
    const output = { message: "已调整", operations: [{ type: "upsert", event: { ...original, date: "2026-10-18", title: "修改标题" } }] };
    const fetcher = vi.fn().mockImplementation(async () => answer(output));
    const result = await requestTodoAi(config, { ...emptyState(), events: [original] }, "2026-10-15", "把17日的论文挪到18日", fetcher, now);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const supplied = JSON.parse(JSON.parse(fetcher.mock.calls[1][1].body).messages.at(-1).content);
    expect(supplied.schedules.map((s: { date: string }) => s.date).sort()).toEqual(["2026-10-17", "2026-10-18"]);
    expect(result.operations).toEqual(output.operations);
    expect(original.date).toBe("2026-10-17");
  });
  it("时间冲突反馈给 AI 修正，重试成功前不改原数据", async () => {
    const a = event(), b = event({ start: "16:00", end: "17:00" });
    const fetcher = vi.fn().mockResolvedValueOnce(answer({ message: "调整", operations: [{ type: "upsert", event: { ...a, end: "16:30" } }] })).mockResolvedValueOnce(answer({ message: "已调整两项", operations: [{ type: "upsert", event: { ...a, end: "16:30" } }, { type: "upsert", event: { ...b, start: "16:35", end: "17:35" } }] }));
    const result = await requestTodoAi(config, { ...emptyState(), events: [a, b] }, a.date, "论文延长并顺延健身", fetcher, now);
    expect(result.operations).toHaveLength(2);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).messages.at(-1).content).toContain("重叠");
    expect(a.end).toBe("15:00");
  });
  it("反复尝试修改过去任务仍会被拒绝，不落库", async () => {
    const past = event({ date: "2026-10-14" });
    const fetcher = vi.fn().mockImplementation(async () => answer({ message: "已删除", operations: [{ type: "delete", id: past.id }] }));
    await expect(requestTodoAi(config, { ...emptyState(), events: [past] }, past.date, "删掉昨天", fetcher, now)).rejects.toThrow("过去日期");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
