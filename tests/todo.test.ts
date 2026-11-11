import { describe, expect, it, vi } from "vitest";
import { dateSchema, emptyState, eventSchema, type TodoEvent } from "../lib/todo/model";
import { applyOperations } from "../lib/todo/operations";
import { requestTodoAi } from "../lib/todo/ai";

const now = new Date("2026-10-13T01:00:00Z");
const makeEvent = (overrides: Partial<TodoEvent> = {}): TodoEvent => ({ id: crypto.randomUUID(), title: "写论文", date: "2026-10-13", start: "14:00", end: "16:00", fixed: false, completed: false, notes: "", ...overrides });
describe("日程排程规则", () => {
  it("校验真实日期与有效起止时间", () => {
    expect(dateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(eventSchema.safeParse(makeEvent({ end: "13:00" })).success).toBe(false);
    expect(eventSchema.safeParse(makeEvent({ start: null, end: null })).success).toBe(true);
  });
  it("AI 任务间至少留五分钟，不能重叠", () => {
    const a = makeEvent();
    expect(() => applyOperations([a], [{ type: "upsert", event: makeEvent({ start: "16:00", end: "17:00" }) }], true, now)).toThrow("5 分钟");
    expect(() => applyOperations([a], [{ type: "upsert", event: makeEvent({ start: "15:00", end: "17:00" }) }], true, now)).toThrow("重叠");
    expect(applyOperations([a], [{ type: "upsert", event: makeEvent({ start: "16:05", end: "17:05" }) }], true, now)).toHaveLength(2);
  });
  it("手动新建和编辑允许相邻、部分重叠及完全重合", () => {
    const a = makeEvent();
    expect(applyOperations([a], [{ type: "upsert", event: makeEvent({ start: "16:00", end: "17:00" }) }])).toHaveLength(2);
    expect(applyOperations([a], [{ type: "upsert", event: makeEvent({ start: "15:59", end: "17:00" }) }])).toHaveLength(2);
    const b = makeEvent();
    expect(applyOperations([a], [{ type: "upsert", event: b }])).toHaveLength(2);
    expect(applyOperations([a, b], [{ type: "upsert", event: { ...b, start: "15:00", end: "18:00" } }]).find(e => e.id === b.id)?.start).toBe("15:00");
  });
  it("保留已完成和未安排任务", () => {
    const done = makeEvent({ completed: true });
    expect(() => applyOperations([done], [{ type: "upsert", event: { ...done, title: "修改" } }], true, now)).toThrow("已完成");
    expect(applyOperations([], [{ type: "upsert", event: makeEvent({ start: null, end: null }) }], true, now)[0].start).toBeNull();
  });
  it("跨日不冲突；新日程不能安排在过去", () => {
    expect(applyOperations([makeEvent()], [{ type: "upsert", event: makeEvent({ date: "2026-10-14" }) }], true, now)).toHaveLength(2);
    expect(() => applyOperations([], [{ type: "upsert", event: makeEvent({ start: "08:00", end: "09:00" }) }], true, now)).toThrow("过去");
  });
  it("批量改动失败不会修改原数据，并拒绝重复操作", () => {
    const original = makeEvent();
    expect(() => applyOperations([original], [{ type: "upsert", event: { ...original, title: "新标题" } }, { type: "upsert", event: makeEvent({ start: "15:00", end: "17:00" }) }], true, now)).toThrow();
    expect(original.title).toBe("写论文");
    expect(() => applyOperations([original], [{ type: "delete", id: original.id }, { type: "delete", id: original.id }])).toThrow("重复");
  });
  it("手动取消完成允许与活动任务重叠", () => {
    const completed = makeEvent({ completed: true });
    const other = makeEvent({ start: "15:00", end: "17:00" });
    expect(applyOperations([completed, other], [{ type: "upsert", event: { ...completed, completed: false } }]).find(e => e.id === completed.id)?.completed).toBe(false);
  });
  it("AI 可调整正在进行的未完成任务且不能凭空完成新任务", () => {
    const ongoing = makeEvent({ start: "08:30", end: "09:30" });
    expect(applyOperations([ongoing], [{ type: "upsert", event: { ...ongoing, title: "改为阅读", end: "10:00" } }], true, now)[0]).toMatchObject({ title: "改为阅读", start: "08:30", end: "10:00" });
    expect(applyOperations([ongoing], [{ type: "delete", id: ongoing.id }], true, now)).toHaveLength(0);
    expect(() => applyOperations([], [{ type: "upsert", event: makeEvent({ completed: true }) }], true, now)).toThrow("已完成");
  });
});

describe("日程 AI 接口", () => {
  const config = { provider: "openai-compatible" as const, model: "test-model", baseUrl: "https://example.test/v1", apiKey: "test-only" };
  it("复用配置并传入现有日程和五分钟规则", async () => {
    const event = makeEvent({ date: "2099-01-01" });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ message: "已修改", operations: [{ type: "upsert", event: { ...event, title: "阅读" } }] }) } }] }))) as unknown as typeof fetch;
    const response = await requestTodoAi(config, { ...emptyState(), events: [event] }, "2099-01-01", "写论文", fetcher);
    expect(response.operations).toHaveLength(1);
    const [url, options] = vi.mocked(fetcher).mock.calls[0];
    expect(url).toBe("https://example.test/v1/chat/completions");
    expect(JSON.parse(options!.body as string).messages[0].content).toContain("5分钟");
    expect(JSON.parse(options!.body as string).model).toBe("test-model");
  });
  it("错误响应或不合法日程不能写入", async () => {
    const invalid = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "已安排好" } }] }))) as unknown as typeof fetch;
    await expect(requestTodoAi(config, emptyState(), "2026-10-13", "安排", invalid)).rejects.toThrow("格式");
    const denied = vi.fn(async () => new Response("private upstream detail", { status: 401 })) as unknown as typeof fetch;
    await expect(requestTodoAi(config, emptyState(), "2026-10-13", "安排", denied)).rejects.toThrow("认证");
  });
});
